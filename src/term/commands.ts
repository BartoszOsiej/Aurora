/**
 * Commands — the terminal command interpreter.
 *
 * A POSIX-flavored shell with ~35 commands, redirection (> and >>),
 * a persistent current-directory, command history, and rich formatting.
 * The interpreter is pure (works on FileSystem + a print callback), so it
 * is fully unit-testable outside the DOM.
 */

import { FileSystem } from '../fs/FileSystem';

export interface Shell {
  cwd: string;
  print(text?: string): void;
  printTable(headers: string[], rows: string[][]): void;
  setCwd(path: string): void;
}

interface CmdDef {
  name: string;
  usage: string;
  desc: string;
  run(args: string[], shell: Shell, fs: FileSystem, ctx: CommandContext): void;
}

export function buildCommands(): CmdDef[] {
  const list: CmdDef[] = [];

  const def = (c: CmdDef) => list.push(c);

  def({
    name: 'help',
    usage: 'help [command]',
    desc: 'List commands or show help for one command',
    run(args, s) {
      if (args[0]) {
        const cmd = list.find((c) => c.name === args[0]);
        if (!cmd) { s.print(`help: no such command: ${args[0]}`); return; }
        s.print(`${cmd.name} — ${cmd.desc}`);
        s.print(`usage: ${cmd.usage}`);
        return;
      }
      s.print('AURORA OS Shell — built-in commands:');
      s.print('');
      const rows = list.map((c) => [c.name, c.desc]);
      s.printTable(['command', 'description'], rows);
      s.print('');
      s.print('Tips: Tab completes paths. ↑/↓ cycles history. > and >> redirect output.');
    },
  });

  def({
    name: 'clear',
    usage: 'clear',
    desc: 'Clear the terminal screen',
    run() { /* handled by terminal */ },
  });

  def({
    name: 'ls',
    usage: 'ls [path]',
    desc: 'List directory contents',
    run(args, s, fs) {
      const path = args[0] ? fs.resolve(args[0], s.cwd) : s.cwd;
      let entries;
      try {
        entries = fs.readDir(path);
      } catch (e) {
        s.print(String((e as Error).message));
        return;
      }
      if (entries.length === 0) { s.print('(empty)'); return; }
      for (const e of entries) {
        if (e.kind === 'dir') s.print(`\u001b[1;36m${e.name}/\u001b[0m`);
        else s.print(`  ${e.name}  ${FileSystem.humanSize(e.size)}`);
      }
    },
  });

  def({
    name: 'll',
    usage: 'll [path]',
    desc: 'Long listing with sizes',
    run(args, s, fs) {
      const path = args[0] ? fs.resolve(args[0], s.cwd) : s.cwd;
      try {
        const entries = fs.readDir(path);
        const rows = entries.map((e) => [
          e.kind === 'dir' ? 'd' : '-',
          FileSystem.humanSize(e.size),
          e.kind === 'dir' ? `${e.name}/` : e.name,
        ]);
        s.printTable(['type', 'size', 'name'], rows);
      } catch (e) {
        s.print(String((e as Error).message));
      }
    },
  });

  def({
    name: 'cd',
    usage: 'cd <path>',
    desc: 'Change directory',
    run(args, s, fs) {
      const target = args[0] ?? '/home/user';
      const p = fs.resolve(target, s.cwd);
      if (!fs.isDir(p)) { s.print(`cd: no such directory: ${target}`); return; }
      s.setCwd(p);
    },
  });

  def({
    name: 'pwd',
    usage: 'pwd',
    desc: 'Print working directory',
    run(_a, s) { s.print(s.cwd); },
  });

  def({
    name: 'cat',
    usage: 'cat <file> [file...]',
    desc: 'Concatenate files to stdout',
    run(args, s, fs) {
      if (args.length === 0) { s.print('usage: cat <file>'); return; }
      for (const a of args) {
        const p = fs.resolve(a, s.cwd);
        try {
          if (fs.isDir(p)) { s.print(`cat: ${a}: is a directory`); continue; }
          s.print(fs.readFile(p));
        } catch (e) {
          s.print(`cat: ${a}: ${(e as Error).message}`);
        }
      }
    },
  });

  def({
    name: 'echo',
    usage: 'echo <text>',
    desc: 'Print text (supports "..." quotes)',
    run(args, s) {
      s.print(args.join(' '));
    },
  });

  def({
    name: 'touch',
    usage: 'touch <file>',
    desc: 'Create an empty file',
    run(args, s, fs) {
      if (args.length === 0) { s.print('usage: touch <file>'); return; }
      for (const a of args) {
        const p = fs.resolve(a, s.cwd);
        if (!fs.exists(p)) fs.writeFile(p, '');
        s.print(`touched ${a}`);
      }
    },
  });

  def({
    name: 'mkdir',
    usage: 'mkdir [-p] <dir>',
    desc: 'Create directory (use -p for nested)',
    run(args, s, fs) {
      const recursive = args[0] === '-p';
      const dirs = recursive ? args.slice(1) : args;
      if (dirs.length === 0) { s.print('usage: mkdir <dir>'); return; }
      for (const d of dirs) {
        const p = fs.resolve(d, s.cwd);
        try {
          if (recursive) fs.mkdirp(p);
          else fs.mkdir(p);
          s.print(`created ${d}`);
        } catch (e) {
          s.print(`mkdir: ${d}: ${(e as Error).message}`);
        }
      }
    },
  });

  def({
    name: 'rm',
    usage: 'rm [-r] <path>',
    desc: 'Remove file (-r for directories)',
    run(args, s, fs) {
      const recursive = args[0] === '-r' || args[0] === '-rf';
      const targets = recursive ? args.slice(1) : args;
      if (targets.length === 0) { s.print('usage: rm <path>'); return; }
      for (const t of targets) {
        const p = fs.resolve(t, s.cwd);
        try {
          if (recursive) fs.removeRecursive(p);
          else fs.remove(p);
          s.print(`removed ${t}`);
        } catch (e) {
          s.print(`rm: ${t}: ${(e as Error).message}`);
        }
      }
    },
  });

  def({
    name: 'cp',
    usage: 'cp <src> <dst>',
    desc: 'Copy file or directory',
    run(args, s, fs) {
      if (args.length < 2) { s.print('usage: cp <src> <dst>'); return; }
      try {
        fs.copy(fs.resolve(args[0], s.cwd), fs.resolve(args[1], s.cwd));
        s.print(`copied ${args[0]} → ${args[1]}`);
      } catch (e) {
        s.print(`cp: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'mv',
    usage: 'mv <src> <dst>',
    desc: 'Move or rename',
    run(args, s, fs) {
      if (args.length < 2) { s.print('usage: mv <src> <dst>'); return; }
      try {
        fs.move(fs.resolve(args[0], s.cwd), fs.resolve(args[1], s.cwd));
        s.print(`moved ${args[0]} → ${args[1]}`);
      } catch (e) {
        s.print(`mv: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'tree',
    usage: 'tree [path] [depth]',
    desc: 'Recursively list directory tree',
    run(args, s, fs) {
      const path = args[0] ? fs.resolve(args[0], s.cwd) : s.cwd;
      const depth = args[1] ? parseInt(args[1], 10) : -1;
      try {
        const items = fs.tree(path, depth);
        if (items.length === 0) { s.print('(empty)'); return; }
        for (const i of items) {
          const indent = i.path.slice(path.length).split('/').filter(Boolean).length;
          const prefix = '  '.repeat(Math.max(0, indent - 1));
          s.print(`${prefix}${i.kind === 'dir' ? '📁 ' : '📄 '}${i.path.split('/').pop()}${i.kind === 'dir' ? '/' : ''}`);
        }
      } catch (e) {
        s.print(String((e as Error).message));
      }
    },
  });

  def({
    name: 'find',
    usage: 'find <start-dir> -name <pattern>',
    desc: 'Recursively search for files/dirs by name substring',
    run(args, s, fs) {
      let start = '.';
      let pattern = '';
      const rest = [...args];
      if (rest[0] && rest[0] !== '-name') { start = rest.shift() as string; }
      const nameIdx = rest.indexOf('-name');
      if (nameIdx === -1 || !rest[nameIdx + 1]) {
        s.print('usage: find <start-dir> -name <pattern>');
        return;
      }
      pattern = rest[nameIdx + 1];
      const base = fs.resolve(start, s.cwd);
      if (!fs.exists(base)) { s.print(`find: ${start}: no such file or directory`); return; }
      let hits = 0;
      const walk = (dir: string) => {
        for (const entry of fs.readDir(dir)) {
          const full = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
          if (entry.name.includes(pattern)) { s.print(full); hits++; }
          if (entry.kind === 'dir') walk(full);
        }
      };
      if (base.split('/').pop()!.includes(pattern)) { s.print(base); hits++; }
      walk(base);
      s.print(`— ${hits} match${hits === 1 ? '' : 'es'}`);
    },
  });

  def({
    name: 'grep',
    usage: 'grep <pattern> <file>',
    desc: 'Search a file for a pattern',
    run(args, s, fs) {
      if (args.length < 2) { s.print('usage: grep <pattern> <file>'); return; }
      const p = fs.resolve(args[1], s.cwd);
      try {
        const content = fs.readFile(p);
        const lines = content.split('\n');
        let hits = 0;
        for (const [i, line] of lines.entries()) {
          if (line.includes(args[0])) {
            s.print(`${i + 1}: ${line}`);
            hits++;
          }
        }
        s.print(`— ${hits} match${hits === 1 ? '' : 'es'} in ${args[1]}`);
      } catch (e) {
        s.print(`grep: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'wc',
    usage: 'wc <file>',
    desc: 'Count lines, words, characters',
    run(args, s, fs) {
      if (args.length === 0) { s.print('usage: wc <file>'); return; }
      try {
        const content = fs.readFile(fs.resolve(args[0], s.cwd));
        const lines = content.split('\n').length;
        const words = content.split(/\s+/).filter(Boolean).length;
        s.print(`  ${lines} lines  ${words} words  ${content.length} chars  ${args[0]}`);
      } catch (e) {
        s.print(`wc: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'head',
    usage: 'head [-n N] <file>',
    desc: 'Print first N lines (default 10)',
    run(args, s, fs) {
      let n = 10;
      let file = args[0] ?? '';
      if (args[0] === '-n') { n = parseInt(args[1] ?? '10', 10) || 10; file = args[2] ?? ''; }
      if (!file) { s.print('usage: head [-n N] <file>'); return; }
      try {
        const lines = fs.readFile(fs.resolve(file, s.cwd)).split('\n').slice(0, n);
        s.print(lines.join('\n'));
      } catch (e) {
        s.print(`head: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'tail',
    usage: 'tail [-n N] <file>',
    desc: 'Print last N lines (default 10)',
    run(args, s, fs) {
      let n = 10;
      let file = args[0] ?? '';
      if (args[0] === '-n') { n = parseInt(args[1] ?? '10', 10) || 10; file = args[2] ?? ''; }
      if (!file) { s.print('usage: tail [-n N] <file>'); return; }
      try {
        const lines = fs.readFile(fs.resolve(file, s.cwd)).split('\n');
        s.print(lines.slice(Math.max(0, lines.length - n)).join('\n'));
      } catch (e) {
        s.print(`tail: ${(e as Error).message}`);
      }
    },
  });

  def({
    name: 'date',
    usage: 'date',
    desc: 'Show current date and time',
    run(_a, s) { s.print(new Date().toString()); },
  });

  def({
    name: 'whoami',
    usage: 'whoami',
    desc: 'Print current user',
    run(_a, s) { s.print('user'); },
  });

  def({
    name: 'hostname',
    usage: 'hostname',
    desc: 'Print machine name',
    run(_a, s) { s.print('aurora'); },
  });

  def({
    name: 'uname',
    usage: 'uname [-a]',
    desc: 'Print system information',
    run(args, s) {
      if (args[0] === '-a') s.print('AURORA-OS browser 1.0.0 TypeScript/DOM 0.0.1');
      else s.print('AURORA-OS');
    },
  });

  def({
    name: 'uptime',
    usage: 'uptime',
    desc: 'Show how long the system has been running',
    run(_a, s, fs) {
      const boot = fs.stat('/etc/motd').mtime || Date.now();
      void boot;
      const secs = Math.floor((Date.now() - BOOT_TIME) / 1000);
      const m = Math.floor(secs / 60);
      const h = Math.floor(m / 60);
      s.print(`up ${h} hours, ${m % 60} minutes (since boot)`);
    },
  });

  def({
    name: 'neofetch',
    usage: 'neofetch',
    desc: 'Show system information banner',
    run(_a, s, fs) {
      const os = 'AURORA OS 1.0.0 (browser)';
      const kernel = 'TypeScript Kernel 0.9.2-dom';
      const shell = 'aurora-sh 1.0.0';
      const fsInfo = fs.stat('/').kind;
      void fsInfo;
      s.print('');
      const width = typeof innerWidth !== 'undefined' ? innerWidth : 80;
      const height = typeof innerHeight !== 'undefined' ? innerHeight : 24;
      s.print('          ██████   ╭─────────────────────────────╮');
      s.print('        ██      ██  os        ' + os.padEnd(24) + '│');
      s.print('       ██  ██ ██ ██  host      aurora-desktop' + ' '.repeat(8) + '│');
      s.print('      ██  ████  ████  kernel     ' + kernel.padEnd(22) + '│');
      s.print('     ██  ██████  ████  shell      ' + shell.padEnd(22) + '│');
      s.print('    ██  ████████  ████  resolution ' + `${width}x${height}`.padEnd(22) + '│');
      s.print('    ██████████████████  uptime     (see uptime)' + ' '.repeat(9) + '│');
      s.print('      ███████████████   ╰─────────────────────────────╯');
      s.print('');
    },
  });

  def({
    name: 'df',
    usage: 'df',
    desc: 'Show filesystem usage',
    run(_a, s, fs) {
      let used = 0;
      let files = 0;
      const walk = (p: string) => {
        for (const e of fs.readDir(p)) {
          files++;
          if (e.kind === 'file') used += e.size;
          else walk(`${p === '/' ? '' : p}/${e.name}`);
        }
      };
      walk('/');
      s.printTable(['filesystem', 'used', 'size', 'mount'], [
        ['aurora-fs', FileSystem.humanSize(used), '4.0 MB', '/'],
      ]);
      s.print(`${files} files`);
    },
  });

  def({
    name: 'du',
    usage: 'du <path>',
    desc: 'Estimate disk usage of a path',
    run(args, s, fs) {
      const p = args[0] ? fs.resolve(args[0], s.cwd) : s.cwd;
      let used = 0;
      const walk = (path: string) => {
        for (const e of fs.readDir(path)) {
          if (e.kind === 'file') used += e.size;
          else walk(`${path === '/' ? '' : path}/${e.name}`);
        }
      };
      try { walk(p); } catch (e) { s.print(String((e as Error).message)); return; }
      s.print(`${FileSystem.humanSize(used)}  ${p}`);
    },
  });

  def({
    name: 'ps',
    usage: 'ps',
    desc: 'List running processes',
    run(_a, s, _fs, ctx) {
      const rows = ctx.list().map((p) => [String(p.pid), p.icon, p.name, p.state, `${p.cpu.toFixed(1)}%`, `${(p.mem / 1024).toFixed(0)} MB`]);
      s.printTable(['pid', 'icon', 'name', 'state', 'cpu', 'mem'], rows);
    },
  });

  def({
    name: 'kill',
    usage: 'kill <pid>',
    desc: 'Terminate a process',
    run(args, s, _fs, ctx) {
      if (!args[0]) { s.print('usage: kill <pid>'); return; }
      const pid = parseInt(args[0], 10);
      const ok = ctx.kill(pid);
      s.print(ok ? `process ${pid} killed` : `kill: no such process ${pid}`);
    },
  });

  def({
    name: 'open',
    usage: 'open <app> [args]',
    desc: 'Launch an application',
    run(args, s, _fs, ctx) {
      if (!args[0]) {
        s.print('usage: open <app>');
        s.print('apps: ' + ctx.apps.map((a) => a.id).join(', '));
        return;
      }
      const ok = ctx.launch(args[0], args.slice(1));
      if (!ok) s.print(`open: no such app: ${args[0]}`);
    },
  });

  def({
    name: 'apps',
    usage: 'apps',
    desc: 'List installed applications',
    run(_a, s, _fs, ctx) {
      const rows = ctx.apps.map((a) => [a.icon, a.id, a.name, a.category]);
      s.printTable(['', 'id', 'name', 'category'], rows);
    },
  });

  def({
    name: 'history',
    usage: 'history',
    desc: 'Show command history',
    run(_a, s, _fs, ctx) {
      if (ctx.history.length === 0) { s.print('(no history)'); return; }
      ctx.history.forEach((h, i) => s.print(`${i + 1}  ${h}`));
    },
  });

  def({
    name: 'sudo',
    usage: 'sudo <command...>',
    desc: 'Execute a command as root (you are root)',
    run(_a, s, _fs, _ctx) {
      s.print('You are already root. AURORA OS is a single-user system.');
    },
  });

  def({
    name: 'fortune',
    usage: 'fortune',
    desc: 'Print a random quote',
    run(_a, s) {
      const quotes = [
        'The best way to predict the future is to invent it. — Alan Kay',
        'Simplicity is the ultimate sophistication. — Leonardo da Vinci',
        'Talk is cheap. Show me the code. — Linus Torvalds',
        'Any sufficiently advanced technology is indistinguishable from magic. — Arthur C. Clarke',
        'First, solve the problem. Then, write the code. — John Johnson',
        'Make it work, make it right, make it fast. — Kent Beck',
        'AURORA OS: your browser is now your computer.',
      ];
      s.print(quotes[Math.floor(Math.random() * quotes.length)]);
    },
  });

  def({
    name: 'man',
    usage: 'man <command>',
    desc: 'Alias for help',
    run(args, s) {
      const cmd = list.find((c) => c.name === args[0]);
      if (!cmd) { s.print(`man: no manual entry for ${args[0] ?? ''}`); return; }
      s.print(`NAME\n  ${cmd.name} — ${cmd.desc}\n\nUSAGE\n  ${cmd.usage}`);
    },
  });

  def({
    name: 'exit',
    usage: 'exit',
    desc: 'Close the terminal',
    run() { /* handled by terminal */ },
  });

  def({
    name: 'shutdown',
    usage: 'shutdown',
    desc: 'Reboot AURORA OS',
    run(_a, s, _fs, ctx) {
      s.print('Shutting down…');
      setTimeout(() => ctx.reboot(), 600);
    },
  });

  def({
    name: 'version',
    usage: 'version',
    desc: 'Show version information',
    run(_a, s) {
      s.print('AURORA OS 1.0.0 "Nebula"');
      s.print('Kernel: aurora-kernel 0.9.2 (TypeScript/DOM)');
      s.print('Shell: aurora-sh 1.0.0');
      s.print('Window manager: aurora-wm 1.0.0');
    },
  });

  return list;
}

/** Command table built once at module load and reused by runCommand. */
const COMMANDS: CmdDef[] = buildCommands();

/** Set once at module load for `uptime`. */
const BOOT_TIME = Date.now();

export interface CommandContext {
  list: () => Array<{ pid: number; icon: string; name: string; state: string; cpu: number; mem: number }>;
  kill: (pid: number) => boolean;
  apps: Array<{ id: string; name: string; icon: string; category: string }>;
  launch: (appId: string, args?: string[]) => boolean;
  history: string[];
  reboot: () => void;
}

/**
 * Run one command line. Supports:
 *   - quoted arguments ("hello world")
 *   - output redirection:  > file  and  >> file
 */
export function runCommand(
  line: string,
  shell: Shell,
  fs: FileSystem,
  ctx: CommandContext,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Redirection parsing
  let redirect: { mode: '>' | '>>'; path: string } | null = null;
  let body = trimmed;
  const m = trimmed.match(/\s*(>>|>)\s*(\S+)\s*$/);
  if (m) {
    redirect = { mode: m[1] as '>' | '>>', path: m[2] };
    body = trimmed.slice(0, trimmed.length - m[0].length);
  }

  const args = tokenize(body);
  if (args.length === 0) return;
  const name = args[0];

  // Capture output for redirection
  let captured = '';
  const capShell: Shell = {
    ...shell,
    print(text = '') {
      if (redirect) captured += text + '\n';
      else shell.print(text);
    },
    printTable(headers, rows) {
      const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(headers[i].length + 2)).join('');
      const lines = [fmt(headers), ...rows.map(fmt)];
      if (redirect) captured += lines.join('\n') + '\n';
      else lines.forEach((l) => shell.print(l));
    },
  };

  const cmd = COMMANDS.find((c) => c.name === name);

  if (name === 'clear') {
    shell.print('\u001b[2J\u001b[H');
  } else if (name === 'exit') {
    shell.print('\u001b[exit');
  } else if (cmd) {
    cmd.run(args.slice(1), capShell, fs, ctx);
  } else {
    shell.print(`aurora-sh: command not found: ${name} (try "help")`);
  }

  if (redirect) {
    const p = fs.resolve(redirect.path, shell.cwd);
    try {
      if (redirect.mode === '>') fs.writeFile(p, captured);
      else fs.appendFile(p, captured);
      shell.print(`wrote ${redirect.path} (${captured.length} chars)`);
    } catch (e) {
      shell.print(`redirection failed: ${(e as Error).message}`);
    }
  }
}

/** Split a command line honoring double quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ' ' && !inQ) {
      if (cur) { out.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** ANSI-to-HTML for the terminal renderer. */
export function ansiToHtml(text: string): string {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\u001b\[1;36m([^\u001b]*)\u001b\[0m/g, '<span class="t-dir">$1</span>');
  html = html.replace(/\u001b\[1;32m([^\u001b]*)\u001b\[0m/g, '<span class="t-ok">$1</span>');
  html = html.replace(/\u001b\[1;31m([^\u001b]*)\u001b\[0m/g, '<span class="t-err">$1</span>');
  html = html.replace(/\u001b\[2J\u001b\[H/, '');
  return html;
}
