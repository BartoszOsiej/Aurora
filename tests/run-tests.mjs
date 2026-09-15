#!/usr/bin/env node
/**
 * AURORA OS — core logic test harness (no DOM required).
 *
 * Bundles the pure modules with esbuild (npm run build:test) and runs
 * assertions against the EventBus, FileSystem and shell interpreter.
 */

import { EventBus } from '../dist-test/EventBus.js';
import { FileSystem } from '../dist-test/FileSystem.js';
import { tokenize, runCommand } from '../dist-test/commands.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  }
}

function test(name, fn) {
  try {
    fn();
  } catch (e) {
    failed++;
    failures.push(`${name} — threw: ${e.message}`);
  }
}

/* ---------------------------------------------------------------- EventBus */

test('EventBus: emit + on', () => {
  const bus = new EventBus();
  let got = 0;
  bus.on('x', () => got++);
  bus.emit('x');
  bus.emit('x');
  assert(got === 2, 'two emissions delivered');
});

test('EventBus: once', () => {
  const bus = new EventBus();
  let got = 0;
  bus.once('x', () => got++);
  bus.emit('x');
  bus.emit('x');
  assert(got === 1, 'once fires exactly once');
});

test('EventBus: unsubscribe', () => {
  const bus = new EventBus();
  let got = 0;
  const off = bus.on('x', () => got++);
  off();
  bus.emit('x');
  assert(got === 0, 'handler removed');
});

test('EventBus: listenerCount', () => {
  const bus = new EventBus();
  bus.on('a', () => {});
  bus.on('a', () => {});
  assert(bus.listenerCount('a') === 2, 'counts subscriptions');
});

test('EventBus: handler errors do not break the bus', () => {
  const bus = new EventBus();
  let got = 0;
  bus.on('x', () => {
    throw new Error('boom');
  });
  bus.on('x', () => got++);
  bus.emit('x');
  assert(got === 1, 'second handler still runs');
});

/* -------------------------------------------------------------- FileSystem */

function freshFS() {
  return new FileSystem(false);
}

test('FS: seed layout', () => {
  const fs = freshFS();
  assert(fs.isDir('/home/user'), 'home is a directory');
  assert(fs.exists('/home/user/Desktop/welcome.txt'), 'welcome.txt seeded');
  assert(
    fs.readDir('/home/user').some((e) => e.name === 'Documents'),
    'Documents listed',
  );
});

test('FS: write / read / append', () => {
  const fs = freshFS();
  fs.writeFile('/tmp/a.txt', 'hello');
  assert(fs.readFile('/tmp/a.txt') === 'hello', 'write + read roundtrip');
  fs.appendFile('/tmp/a.txt', ' world');
  assert(fs.readFile('/tmp/a.txt') === 'hello world', 'append works');
});

test('FS: mkdir + error codes', () => {
  const fs = freshFS();
  fs.mkdir('/tmp/sub');
  assert(fs.isDir('/tmp/sub'), 'mkdir creates dir');
  let threw = '';
  try {
    fs.mkdir('/tmp/sub');
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'EEXIST', 'duplicate dir raises EEXIST');
  threw = '';
  try {
    fs.readFile('/tmp/does-not-exist');
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'ENOENT', 'missing file raises ENOENT');
  threw = '';
  try {
    fs.readFile('/home/user');
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'EISDIR', 'reading a dir raises EISDIR');
});

test('FS: path resolution with ..', () => {
  const fs = freshFS();
  assert(fs.resolve('..', '/home/user') === '/home', 'dotdot above cwd');
  assert(
    fs.resolve('Documents/notes.txt', '/home/user') === '/home/user/Documents/notes.txt',
    'relative path joins cwd',
  );
  assert(fs.resolve('/etc/motd', '/home/user') === '/etc/motd', 'absolute path wins');
});

test('FS: copy / move / remove', () => {
  const fs = freshFS();
  fs.writeFile('/tmp/s.txt', 'data');
  fs.copy('/tmp/s.txt', '/tmp/d.txt');
  assert(fs.readFile('/tmp/d.txt') === 'data', 'copy duplicates content');
  fs.move('/tmp/s.txt', '/tmp/m.txt');
  assert(!fs.exists('/tmp/s.txt') && fs.exists('/tmp/m.txt'), 'move relocates');
  fs.remove('/tmp/d.txt');
  assert(!fs.exists('/tmp/d.txt'), 'remove deletes');
});

test('FS: recursive remove', () => {
  const fs = freshFS();
  fs.mkdirp('/tmp/deep/a/b');
  fs.writeFile('/tmp/deep/a/b/f.txt', 'x');
  fs.removeRecursive('/tmp/deep');
  assert(!fs.exists('/tmp/deep'), 'recursive remove clears subtree');
});

test('FS: tree walks the hierarchy', () => {
  const fs = freshFS();
  const items = fs.tree('/home/user', 2);
  assert(items.some((i) => i.path.includes('welcome.txt')), 'tree finds nested files');
});

/* ------------------------------------------------------------------- shell */

function mkShell() {
  const lines = [];
  const shell = {
    cwd: '/home/user',
    print: (t = '') => lines.push(String(t)),
    printTable: () => {},
    setCwd: (p) => {
      shell.cwd = p;
    },
  };
  const ctx = {
    list: () => [],
    kill: () => false,
    apps: [],
    launch: () => true,
    history: [],
    reboot: () => {},
  };
  return { shell, lines, ctx };
}

test('shell: echo', () => {
  const { shell, lines, ctx } = mkShell();
  runCommand('echo hello world', shell, freshFS(), ctx);
  assert(lines.some((l) => l === 'hello world'), 'echo prints args');
});

test('shell: tokenize honors quotes', () => {
  const t = tokenize('echo "hello world" ok');
  assert(JSON.stringify(t) === JSON.stringify(['echo', 'hello world', 'ok']), 'quoted token kept whole');
});

test('shell: cd + pwd', () => {
  const { shell, lines, ctx } = mkShell();
  runCommand('cd Documents', shell, freshFS(), ctx);
  assert(shell.cwd === '/home/user/Documents', 'cd changes cwd');
  runCommand('pwd', shell, freshFS(), ctx);
  assert(lines.some((l) => l === '/home/user/Documents'), 'pwd prints cwd');
});

test('shell: ls lists the working directory', () => {
  const { shell, lines, ctx } = mkShell();
  runCommand('ls', shell, freshFS(), ctx);
  assert(lines.some((l) => l.includes('Desktop')), 'ls shows Desktop');
});

test('shell: redirection > and >>', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('echo hello > /tmp/out.txt', shell, fs, ctx);
  assert(fs.readFile('/tmp/out.txt').includes('hello'), '> writes a file');
  runCommand('echo again >> /tmp/out.txt', shell, fs, ctx);
  assert(fs.readFile('/tmp/out.txt').includes('again'), '>> appends');
});

test('shell: unknown command reports an error', () => {
  const { shell, lines, ctx } = mkShell();
  runCommand('totally-not-a-command', shell, freshFS(), ctx);
  assert(lines.some((l) => l.includes('command not found')), 'error message printed');
});

test('shell: cat reads files', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  fs.writeFile('/home/user/x.txt', 'file content');
  runCommand('cat x.txt', shell, fs, ctx);
  assert(lines.some((l) => l === 'file content'), 'cat output');
});

test('shell: mkdir via command', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('mkdir fresh-dir', shell, fs, ctx);
  assert(fs.isDir('/home/user/fresh-dir'), 'mkdir creates directory');
});

test('shell: touch + wc', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('touch t.txt', shell, fs, ctx);
  assert(fs.exists('/home/user/t.txt'), 'touch creates file');
  fs.writeFile('/home/user/t.txt', 'one two three');
  runCommand('wc t.txt', shell, fs, ctx);
  assert(lines.some((l) => l.includes('words')), 'wc reports word count');
});

test('shell: rm removes files', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('touch gone.txt', shell, fs, ctx);
  runCommand('rm gone.txt', shell, fs, ctx);
  assert(!fs.exists('/home/user/gone.txt'), 'rm deletes the file');
  assert(lines.some((l) => l.includes('removed gone.txt')), 'rm confirms');
});

test('shell: rm removes files and dirs; rm -r removes trees', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('mkdir dirx', shell, fs, ctx);
  runCommand('rm dirx', shell, fs, ctx);
  assert(!fs.exists('/home/user/dirx'), 'rm removes a directory');
  runCommand('mkdir diry', shell, fs, ctx);
  fs.writeFile('/home/user/diry/inner.txt', 'x');
  runCommand('rm -r diry', shell, fs, ctx);
  assert(!fs.exists('/home/user/diry'), 'rm -r removes the whole tree');
});

test('shell: cp copies and mv moves', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('touch a.txt', shell, fs, ctx);
  runCommand('cp a.txt b.txt', shell, fs, ctx);
  assert(fs.exists('/home/user/a.txt') && fs.exists('/home/user/b.txt'), 'cp keeps both');
  runCommand('mv b.txt c.txt', shell, fs, ctx);
  assert(fs.exists('/home/user/c.txt'), 'mv renames');
  assert(!fs.exists('/home/user/b.txt'), 'mv removes the source');
});

test('shell: grep finds matches and reports count', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  fs.writeFile('/home/user/log.txt', 'info: boot ok\ninfo: ready\nwarn: low disk');
  runCommand('grep info log.txt', shell, fs, ctx);
  assert(lines.some((l) => l.includes('1: info: boot ok')), 'first hit line shown');
  assert(lines.some((l) => l.includes('2 matches')), 'count reported');
  runCommand('grep zzz log.txt', shell, fs, ctx);
  assert(lines.some((l) => l.includes('0 matches')), 'zero matches reported');
});

test('shell: head -n limits lines', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  fs.writeFile('/home/user/many.txt', Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n'));
  runCommand('head -n 3 many.txt', shell, fs, ctx);
  const out = lines.join('\n');
  assert(out.includes('line0') && out.includes('line2'), 'first lines shown');
  assert(!out.includes('line3'), 'not beyond N');
});

test('shell: whoami / hostname / uname', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('whoami', shell, fs, ctx);
  assert(lines.some((l) => l === 'user'), 'whoami prints user');
  runCommand('hostname', shell, fs, ctx);
  assert(lines.some((l) => l === 'aurora'), 'hostname prints aurora');
  runCommand('uname', shell, fs, ctx);
  assert(lines.some((l) => l.toLowerCase().includes('aurora')), 'uname reports the OS');
});

test('shell: help and man list commands', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('help', shell, fs, ctx);
  assert(lines.some((l) => l.includes('built-in commands')), 'help banner');
  runCommand('help grep', shell, fs, ctx);
  assert(lines.some((l) => l.includes('grep')), 'help for one command');
  runCommand('man mkdir', shell, fs, ctx);
  assert(lines.some((l) => l.includes('mkdir')), 'man shows the command');
});

test('shell: echo joins args with quotes', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('echo "hello world" ok', shell, fs, ctx);
  assert(lines.some((l) => l === 'hello world ok'), 'echo preserves quoted space');
});

test('shell: cat reports missing files', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('cat nope.txt', shell, fs, ctx);
  assert(lines.some((l) => l.includes('cat: nope.txt')), 'cat errors on missing file');
});

test('shell: redirection captures output to file', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('echo saved > out.txt', shell, fs, ctx);
  assert(fs.exists('/home/user/out.txt'), 'redirection creates the file');
  assert(fs.readFile('/home/user/out.txt').includes('saved'), 'file contains output');
});

test('shell: find searches recursively by name', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  fs.mkdir('/home/user/docs');
  fs.mkdir('/home/user/docs/deep');
  fs.writeFile('/home/user/docs/deep/report.txt', 'x');
  fs.writeFile('/home/user/todo.txt', 'x');
  runCommand('find /home/user -name report', shell, fs, ctx);
  const out = lines.join('\n');
  assert(out.includes('/home/user/docs/deep/report.txt'), 'nested file found');
  assert(!out.includes('todo.txt'), 'non-matching file skipped');
  assert(lines.some((l) => l.includes('1 match')), 'match count reported');
});

test('shell: find usage error and missing start dir', () => {
  const { shell, lines, ctx } = mkShell();
  const fs = freshFS();
  runCommand('find /nope -name x', shell, fs, ctx);
  assert(lines.some((l) => l.includes('no such file or directory')), 'missing dir reported');
  runCommand('find /home/user', shell, fs, ctx);
  assert(lines.some((l) => l.includes('usage:')), 'usage printed');
});

/* --------------------------------------------------------------- summary */

console.log(`\nAURORA OS core tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('All green ✓');
