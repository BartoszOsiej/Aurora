/**
 * FileSystem — the virtual file system of AURORA OS.
 *
 * A hierarchical POSIX-inspired tree living entirely in memory, with
 * optional persistence to localStorage. Supports:
 *   - absolute + relative paths, `.` and `..` resolution
 *   - directories and files (with size and mtime)
 *   - CRUD operations with proper error reporting
 *   - permission-lite ownership (a `root` and `user` home directory)
 *   - change notifications through the EventBus
 *
 * The terminal and every file-based application operate through this module,
 * so `ls`, `cat`, the Files app and the Editor all stay in sync.
 */

import { bus, EV } from '../core/EventBus';

export interface FSNode {
  name: string;
  kind: 'dir' | 'file';
  content?: string;      // files only
  children?: Map<string, FSNode>; // dirs only
  mtime: number;
}

export type FSErrorCode =
  | 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EEXIST' | 'EPERM' | 'EINVAL';

export class FSError extends Error {
  code: FSErrorCode;
  constructor(code: FSErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const STORAGE_KEY = 'aurora.fs.v1';

/** Default filesystem image created on first boot. */
function seedRoot(): FSNode {
  const dir = (name: string): FSNode => ({ name, kind: 'dir', children: new Map(), mtime: Date.now() });
  const file = (name: string, content: string): FSNode => ({ name, kind: 'file', content, mtime: Date.now() });

  const home = dir('user');
  const desktop = dir('Desktop');
  desktop.children!.set('welcome.txt', file('welcome.txt', [
    'Welcome to AURORA OS!',
    '',
    'A complete operating system running in your browser.',
    '',
    'Quick start:',
    '  • Open the Terminal (◈ → Terminal) and type  help',
    '  • Try  neofetch  for system info',
    '  • Create files:  echo hello > hello.txt',
    '  • Read files:    cat hello.txt',
    '  • Navigate:      cd Documents && ls',
    '',
    'Have fun exploring!',
  ].join('\n')));
  desktop.children!.set('README.md', file('README.md', [
    '# AURORA OS',
    '',
    '**AURORA OS** is a complete operating system in the browser —',
    'window manager, virtual file system, terminal, and apps,',
    'all written in TypeScript with zero dependencies.',
  ].join('\n')));

  const docs = dir('Documents');
  docs.children!.set('notes.txt', file('notes.txt', 'AURORA OS notes:\n- kernel boots in ~2s\n- try pressing Ctrl+Alt+L to lock'));
  docs.children!.set('todo.md', file('todo.md', '# TODO\n- [x] Kernel\n- [x] Window manager\n- [x] Virtual filesystem\n- [x] Terminal\n- [ ] Ship to the moon'));

  const pictures = dir('Pictures');
  const media = dir('Media');
  media.children!.set('readme.txt', file('readme.txt', 'Media folder. Drop files here.'));

  const projects = dir('Projects');
  projects.children!.set('aurora-os.txt', file('aurora-os.txt', 'AURORA OS — the OS you are running right now.'));

  home.children!.set('Desktop', desktop);
  home.children!.set('Documents', docs);
  home.children!.set('Pictures', pictures);
  home.children!.set('Media', media);
  home.children!.set('Projects', projects);

  const root = dir('');
  root.children!.set('bin', dir('bin'));
  root.children!.set('etc', dir('etc'));
  root.children!.set('home', dir('home'));
  root.children!.set('tmp', dir('tmp'));
  root.children!.set('var', dir('var'));
  root.children!.get('home')!.children!.set('user', home);
  root.children!.get('etc')!.children!.set(
    'motd',
    file('motd', 'Welcome to AURORA OS. Type "help" for available commands.')
  );
  return root;
}

export class FileSystem {
  private root: FSNode;
  private persistEnabled: boolean;

  constructor(persist = true) {
    this.persistEnabled = persist;
    this.root = this.load() ?? seedRoot();
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */

  private load(): FSNode | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as FSNode;
      return this.rehydrate(parsed);
    } catch {
      return null;
    }
  }

  private rehydrate(node: FSNode): FSNode {
    if (node.kind === 'dir') {
      const children = new Map<string, FSNode>();
      for (const [name, child] of Object.entries(node.children ?? {})) {
        children.set(name, this.rehydrate({ ...child, name }));
      }
      return { ...node, children };
    }
    return node;
  }

  save(): void {
    if (!this.persistEnabled || typeof localStorage === 'undefined') return;
    try {
      const snapshot: Record<string, unknown> = {};
      const flatten = (node: FSNode): unknown => {
        if (node.kind === 'file') return { kind: 'file', content: node.content, mtime: node.mtime };
        const children: Record<string, unknown> = {};
        for (const [name, child] of node.children ?? []) children[name] = flatten(child);
        return { kind: 'dir', children, mtime: node.mtime };
      };
      snapshot['/'] = flatten(this.root);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage full or unavailable — ignore */
    }
  }

  /** Serialise the whole filesystem to a portable state document. */
  exportState(): string {
    const snapshot: Record<string, unknown> = {};
    const flatten = (node: FSNode): unknown => {
      if (node.kind === 'file') return { kind: 'file', content: node.content, mtime: node.mtime };
      const children: Record<string, unknown> = {};
      for (const [name, child] of node.children ?? []) children[name] = flatten(child);
      return { kind: 'dir', children, mtime: node.mtime };
    };
    snapshot['/'] = flatten(this.root);
    return JSON.stringify(
      { magic: 'AURORA-STATE', version: 1, exported: new Date().toISOString(), fs: snapshot },
      null,
      2,
    );
  }

  /** Replace the live filesystem with a state document (see exportState). */
  importState(stateJson: string): boolean {
    try {
      const parsed = JSON.parse(stateJson) as { magic?: string; version?: number; fs?: Record<string, unknown> };
      if (parsed.magic !== 'AURORA-STATE' || parsed.version !== 1 || typeof parsed.fs !== 'object' || parsed.fs === null) return false;
      const rootRaw = parsed.fs['/'] as { kind?: string } | undefined;
      if (!rootRaw || rootRaw.kind !== 'dir') return false;
      const revive = (raw: unknown, name: string): FSNode | null => {
        const n = raw as { kind?: string; content?: string; mtime?: number; children?: Record<string, unknown> };
        if (n.kind === 'file') return { kind: 'file', name, content: n.content ?? '', mtime: n.mtime ?? Date.now() };
        if (n.kind === 'dir') {
          const children = new Map<string, FSNode>();
          for (const [childName, childRaw] of Object.entries(n.children ?? {})) {
            const child = revive(childRaw, childName);
            if (child) children.set(childName, child);
          }
          return { kind: 'dir', name, children, mtime: n.mtime ?? Date.now() };
        }
        return null;
      };
      const newRoot = revive(rootRaw, '/');
      if (!newRoot) return false;
      this.root = newRoot;
      this.save();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  wipe(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    this.root = seedRoot();
    this.notify();
  }

  /* ------------------------------------------------------------------ *
   * Path resolution
   * ------------------------------------------------------------------ */

  /** Split "/a/b/c" → ["a","b","c"]; rejects ".." escaping above root. */
  private tokens(path: string): string[] {
    const parts = path.split('/').filter((p) => p.length > 0);
    const out: string[] = [];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        if (out.length === 0) throw new FSError('EPERM', 'cannot go above root');
        out.pop();
        continue;
      }
      out.push(part);
    }
    return out;
  }

  /** Resolve an absolute or relative path (relative to cwd). */
  resolve(path: string, cwd = '/home/user'): string {
    const full = path.startsWith('/') ? path : `${cwd === '/' ? '' : cwd}/${path}`;
    return '/' + this.tokens(full).join('/');
  }

  /** Walk to the node at `path`; throw ENOENT if missing. */
  private nodeAt(path: string): FSNode {
    const tokens = this.tokens(path);
    let node = this.root;
    for (const t of tokens) {
      if (node.kind !== 'dir') throw new FSError('ENOTDIR', `not a directory: /${tokens.join('/')}`);
      const next = node.children!.get(t);
      if (!next) throw new FSError('ENOENT', `no such file or directory: ${path}`);
      node = next;
    }
    return node;
  }

  /** Parent dir + leaf name for a path. */
  private split(path: string): { parent: FSNode; name: string } {
    const tokens = this.tokens(path);
    if (tokens.length === 0) throw new FSError('EINVAL', 'invalid path');
    const name = tokens[tokens.length - 1];
    const parentPath = '/' + tokens.slice(0, -1).join('/');
    const parent = this.nodeAt(parentPath);
    if (parent.kind !== 'dir') throw new FSError('ENOTDIR', `not a directory: ${parentPath}`);
    return { parent, name };
  }

  /* ------------------------------------------------------------------ *
   * Queries
   * ------------------------------------------------------------------ */

  exists(path: string): boolean {
    try {
      this.nodeAt(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  stat(path: string): { kind: 'dir' | 'file'; size: number; mtime: number } {
    const node = this.nodeAt(this.resolve(path));
    return {
      kind: node.kind,
      size: node.kind === 'file' ? (node.content?.length ?? 0) : (node.children?.size ?? 0),
      mtime: node.mtime,
    };
  }

  isDir(path: string): boolean {
    try {
      return this.nodeAt(this.resolve(path)).kind === 'dir';
    } catch {
      return false;
    }
  }

  readFile(path: string): string {
    const node = this.nodeAt(this.resolve(path));
    if (node.kind !== 'file') throw new FSError('EISDIR', `is a directory: ${path}`);
    return node.content ?? '';
  }

  /** List directory entries sorted (dirs first, then alpha). */
  readDir(path: string): Array<{ name: string; kind: 'dir' | 'file'; size: number }> {
    const node = this.nodeAt(this.resolve(path));
    if (node.kind !== 'dir') throw new FSError('ENOTDIR', `not a directory: ${path}`);
    const entries: Array<{ name: string; kind: 'dir' | 'file'; size: number }> = [];
    for (const [name, child] of node.children ?? []) {
      entries.push({
        name,
        kind: child.kind,
        size: child.kind === 'file' ? (child.content?.length ?? 0) : (child.children?.size ?? 0),
      });
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  /** Recursive listing (for `tree`). */
  tree(path: string, depth = -1): Array<{ path: string; kind: 'dir' | 'file'; size: number }> {
    const base = this.resolve(path);
    const out: Array<{ path: string; kind: 'dir' | 'file'; size: number }> = [];
    const walk = (p: string, d: number) => {
      if (depth >= 0 && d > depth) return;
      for (const entry of this.readDir(p)) {
        const full = `${p === '/' ? '' : p}/${entry.name}`;
        out.push({ path: full, kind: entry.kind, size: entry.size });
        if (entry.kind === 'dir') walk(full, d + 1);
      }
    };
    walk(base, 0);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Mutations
   * ------------------------------------------------------------------ */

  private notify(): void {
    bus.emit(EV.FS_CHANGED, { at: Date.now() });
    this.save();
  }

  mkdir(path: string): void {
    const p = this.resolve(path);
    const { parent, name } = this.split(p);
    if (parent.children!.has(name)) throw new FSError('EEXIST', `already exists: ${path}`);
    parent.children!.set(name, { name, kind: 'dir', children: new Map(), mtime: Date.now() });
    this.notify();
  }

  /** Recursively create directories (-p behaviour). */
  mkdirp(path: string): void {
    const full = this.resolve(path);
    const tokens = this.tokens(full);
    let cur = this.root;
    for (const t of tokens) {
      if (cur.kind !== 'dir') throw new FSError('ENOTDIR', `not a directory: ${t}`);
      let next = cur.children!.get(t);
      if (!next) {
        next = { name: t, kind: 'dir', children: new Map(), mtime: Date.now() };
        cur.children!.set(t, next);
      }
      if (next.kind !== 'dir') throw new FSError('ENOTDIR', `not a directory: ${t}`);
      cur = next;
    }
    this.notify();
  }

  writeFile(path: string, content: string): void {
    const p = this.resolve(path);
    const { parent, name } = this.split(p);
    const existing = parent.children!.get(name);
    if (existing && existing.kind === 'dir') throw new FSError('EISDIR', `is a directory: ${path}`);
    parent.children!.set(name, { name, kind: 'file', content, mtime: Date.now() });
    this.notify();
  }

  appendFile(path: string, content: string): void {
    const existing = this.exists(path) ? this.readFile(path) : '';
    this.writeFile(path, existing + content);
  }

  remove(path: string): void {
    const p = this.resolve(path);
    if (p === '/') throw new FSError('EPERM', 'cannot remove root');
    const { parent, name } = this.split(p);
    if (!parent.children!.has(name)) throw new FSError('ENOENT', `no such file or directory: ${path}`);
    parent.children!.delete(name);
    this.notify();
  }

  /** Remove recursively. */
  removeRecursive(path: string): void {
    const p = this.resolve(path);
    const { parent, name } = this.split(p);
    const node = parent.children!.get(name);
    if (!node) throw new FSError('ENOENT', `no such file or directory: ${path}`);
    if (node.kind === 'dir' && node.children!.size > 0) {
      for (const child of [...node.children!.keys()]) this.removeRecursive(`${p}/${child}`);
    }
    this.remove(p);
  }

  /** Copy src → dst (file or directory, recursive). */
  copy(src: string, dst: string): void {
    const s = this.resolve(src);
    const node = this.nodeAt(s);
    const d = this.resolve(dst);
    if (node.kind === 'file') {
      this.writeFile(d, node.content ?? '');
    } else {
      // Snapshot the children BEFORE mkdirp(d) so a destination nested inside
      // the source (e.g. `cp a a/b`) cannot recurse into itself forever.
      const children = [...(node.children ?? []).keys()];
      this.mkdirp(d);
      for (const name of children) {
        this.copy(`${s}/${name}`, `${d}/${name}`);
      }
    }
  }

  /** Move/rename src → dst. */
  move(src: string, dst: string): void {
    const s = this.resolve(src);
    const d = this.resolve(dst);
    const { parent, name } = this.split(s);
    const node = parent.children!.get(name);
    if (!node) throw new FSError('ENOENT', `no such file or directory: ${src}`);
    this.copy(s, d);
    parent.children!.delete(name);
    this.notify();
  }

  /** Human-readable size formatting. */
  static humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = bytes;
    let u = -1;
    do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
    return `${v.toFixed(1)} ${units[u]}`;
  }
}
