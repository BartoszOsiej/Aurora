/**
 * main.ts — AURORA OS kernel entry point.
 *
 * Boots the system (animated boot screen → desktop), wires together the
 * kernel subsystems (filesystem, processes, windows, apps, sound, settings)
 * and builds the desktop shell: icons, taskbar, start menu, context menu,
 * lock screen and global shortcuts.
 */

import { bus, EV } from './core/EventBus';
import { FileSystem } from './fs/FileSystem';
import { ProcessManager } from './core/ProcessManager';
import { WindowManager, type WinState } from './core/WindowManager';
import { AppRegistry, type AppContext } from './core/AppRegistry';
import { sound } from './sound/SoundSystem';
import {
  loadSettings,
  saveSettings,
  THEMES,
  WALLPAPERS,
  type SettingsState,
} from './apps/SettingsApp';

import { createTerminalApp } from './apps/TerminalApp';
import { createFilesApp } from './apps/FilesApp';
import { createEditorApp } from './apps/EditorApp';
import { createCalculatorApp } from './apps/CalculatorApp';
import { createPaintApp } from './apps/PaintApp';
import { createSettingsApp } from './apps/SettingsApp';
import { createMonitorApp } from './apps/MonitorApp';
import { createAboutApp } from './apps/AboutApp';
import { createClockApp } from './apps/ClockApp';
import { createMarkdownApp } from './apps/MarkdownApp';
import { createBrowserApp } from './apps/BrowserApp';
import { createMinesweeperApp } from './apps/MinesweeperApp';
import { createSnakeApp } from './apps/SnakeApp';
import { createTasksApp } from './apps/TasksApp';
import { createStateApp } from './apps/StateApp';

/* ------------------------------------------------------------------ *
 * Boot helpers
 * ------------------------------------------------------------------ */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const bootScreen = document.getElementById('boot-screen') as HTMLElement;
const bootBar = document.getElementById('boot-bar') as HTMLElement;
const bootRing = document.getElementById('boot-ring') as HTMLElement;
const bootStatus = document.getElementById('boot-status') as HTMLElement;
const desktop = document.getElementById('desktop') as HTMLElement;

const RING_CIRC = 326; // circumference of the boot ring (r=52 → 2πr)

/** Apply the active theme as CSS custom properties on <html>. */
function applyTheme(s: SettingsState): void {
  const t = THEMES.find((x) => x.id === s.theme) ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--acc', t.accent);
  root.style.setProperty('--acc2', t.acc2);
  root.style.setProperty('--bg', t.bg);
  root.dataset.theme = t.id;
}

/** Register every application in the catalogue. */
function registerApps(registry: AppRegistry): void {
  const A = (
    id: string,
    name: string,
    icon: string,
    description: string,
    create: (c: AppContext) => HTMLElement,
    opts: Partial<{
      width: number;
      height: number;
      resizable: boolean;
      singleInstance: boolean;
      category: 'System' | 'Tools' | 'Games' | 'Media';
    }> = {},
  ): void => {
    registry.register({
      id,
      name,
      icon,
      description,
      width: opts.width ?? 720,
      height: opts.height ?? 480,
      resizable: opts.resizable ?? true,
      singleInstance: opts.singleInstance ?? false,
      category: opts.category ?? 'Tools',
      create,
    });
  };

  A('files', 'Files', '📁', 'Browse the virtual filesystem', createFilesApp, {
    width: 760,
    height: 500,
    category: 'System',
  });
  A('terminal', 'Terminal', '⌨️', 'AURORA shell — 35+ commands', createTerminalApp, {
    width: 840,
    height: 520,
    category: 'System',
  });
  A('editor', 'Editor', '📝', 'Plain-text editor with save & open', createEditorApp, {
    width: 660,
    height: 470,
    category: 'Tools',
  });
  A('calculator', 'Calculator', '🧮', 'Scientific calculator', createCalculatorApp, {
    width: 340,
    height: 480,
    resizable: false,
    category: 'Tools',
  });
  A('paint', 'Paint', '🎨', 'Canvas drawing with palette', createPaintApp, {
    width: 800,
    height: 540,
    category: 'Tools',
  });
  A('monitor', 'System Monitor', '📊', 'Live CPU / memory / process telemetry', createMonitorApp, {
    width: 700,
    height: 540,
    category: 'System',
  });
  A('settings', 'Settings', '⚙️', 'Themes, wallpaper, sound, clock', createSettingsApp, {
    width: 540,
    height: 580,
    singleInstance: true,
    category: 'System',
  });
  A('about', 'About', '◈', 'About AURORA OS', createAboutApp, {
    width: 480,
    height: 470,
    resizable: false,
    singleInstance: true,
    category: 'System',
  });
  A('clock', 'Clock', '🕐', 'Analog clock, world time & stopwatch', createClockApp, {
    width: 480,
    height: 300,
    category: 'Tools',
  });
  A('markdown', 'Markdown', '📄', 'Live Markdown editor with preview', createMarkdownApp, {
    width: 860,
    height: 540,
    category: 'Tools',
  });
  A('browser', 'Browser', '🌐', 'Sandboxed web browser', createBrowserApp, {
    width: 900,
    height: 600,
    category: 'Tools',
  });
  A('tasks', 'Tasks', '✅', 'Task tracker (saved to /home/user)', createTasksApp, {
    width: 520,
    height: 480,
    category: 'Tools',
  });
  A('state', 'Snapshots', '💾', 'Save & restore system state (.aurora)', createStateApp, {
    width: 560,
    height: 540,
    singleInstance: true,
    category: 'System',
  });
  A('mines', 'Minesweeper', '💣', 'Classic minesweeper (flags: right-click)', createMinesweeperApp, {
    width: 400,
    height: 480,
    category: 'Games',
  });
  A('snake', 'Snake', '🐍', 'Arcade snake (arrows/WASD, P = pause)', createSnakeApp, {
    width: 520,
    height: 440,
    category: 'Games',
  });
}

/* ------------------------------------------------------------------ *
 * Desktop shell
 * ------------------------------------------------------------------ */

interface ShellDeps {
  fs: FileSystem;
  windows: WindowManager;
  processes: ProcessManager;
  registry: AppRegistry;
  settings: SettingsState;
}

function buildDesktopShell(deps: ShellDeps): void {
  const { fs, windows, processes, registry, settings } = deps;

  const wallpaper = document.getElementById('wallpaper') as HTMLElement;
  const icons = document.getElementById('desktop-icons') as HTMLElement;
  const tbApps = document.getElementById('tb-apps') as HTMLElement;
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const startMenu = document.getElementById('start-menu') as HTMLElement;
  const contextMenu = document.getElementById('context-menu') as HTMLElement;
  const clockEl = document.getElementById('tb-clock') as HTMLElement;
  const wifiBtn = document.getElementById('tb-wifi') as HTMLButtonElement;

  wallpaper.className = `wallpaper wp-${settings.wallpaper}`;

  /** Central launch helper — every UI entry point routes through here. */
  const launch = (id: string, args?: string[]): number | null => {
    const pid = registry.launch(id, { fs, windows, processes, args });
    if (pid !== null) sound.open();
    return pid;
  };

  /* ---- desktop icons -------------------------------------------- */
  const iconIds = ['files', 'terminal', 'editor', 'calculator', 'paint', 'monitor', 'settings'];
  for (const id of iconIds) {
    const app = registry.get(id);
    if (!app) continue;
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.innerHTML = `<div class="di-ico">${app.icon}</div><div class="di-label">${app.name}</div>`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      icons.querySelectorAll('.desktop-icon').forEach((i) => i.classList.remove('selected'));
      el.classList.add('selected');
      sound.click();
    });
    el.addEventListener('dblclick', () => {
      el.classList.remove('selected');
      launch(id);
    });
    icons.appendChild(el);
  }

  /* ---- taskbar app buttons -------------------------------------- */
  const rebuildTaskbar = (): void => {
    tbApps.innerHTML = '';
    const groups = new Map<string, WinState[]>();
    for (const w of windows.windows) {
      const arr = groups.get(w.appId) ?? [];
      arr.push(w);
      groups.set(w.appId, arr);
    }
    for (const [appId, wins] of groups) {
      const app = registry.get(appId);
      if (!app) continue;
      const active = wins.some((w) => !w.minimized);
      const b = document.createElement('button');
      b.className = `tb-app${active ? ' active' : ''}`;
      b.title = app.name;
      b.innerHTML = `<span class="tb-app-ico">${app.icon}</span><span class="tb-app-name">${app.name}</span>`;
      b.addEventListener('click', () => {
        const top = wins[wins.length - 1];
        if (top.minimized) windows.restore(top.id);
        else if (active) windows.minimize(top.id);
        else windows.restore(top.id);
        sound.click();
      });
      tbApps.appendChild(b);
    }
  };
  bus.on(EV.WINDOW_OPEN, rebuildTaskbar);
  bus.on(EV.WINDOW_CLOSE, rebuildTaskbar);

  /* ---- clock ----------------------------------------------------- */
  const fmtTime = (d: Date): string => {
    const h = settings.clock24 ? d.getHours() : ((d.getHours() + 11) % 12) + 1;
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ampm = settings.clock24 ? '' : d.getHours() >= 12 ? ' PM' : ' AM';
    return `${String(h).padStart(2, '0')}:${mm}${ampm}`;
  };
  const tickClock = (): void => {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    clockEl.textContent = `${fmtTime(now)}  ${date}`;
  };
  tickClock();
  setInterval(tickClock, 1000);

  /* ---- lock screen ----------------------------------------------- */
  let lockEl: HTMLElement | null = null;
  const lock = (): void => {
    if (lockEl) return;
    lockEl = document.createElement('div');
    lockEl.className = 'lock-screen';
    lockEl.innerHTML = `
      <div class="lock-logo">◈</div>
      <div class="lock-time"></div>
      <div class="lock-date"></div>
      <div class="lock-hint">Click anywhere or press any key to unlock</div>`;
    document.body.appendChild(lockEl);
    const tick = (): void => {
      if (!lockEl) return;
      const t = lockEl.querySelector('.lock-time') as HTMLElement;
      const d = lockEl.querySelector('.lock-date') as HTMLElement;
      const now = new Date();
      t.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      d.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    };
    tick();
    const iv = setInterval(tick, 1000);
    const unlock = (): void => {
      clearInterval(iv);
      lockEl?.remove();
      lockEl = null;
      document.removeEventListener('keydown', unlock);
      sound.notify();
    };
    lockEl.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  };

  /* ---- start menu ------------------------------------------------ */
  const smApps = document.createElement('div');
  smApps.className = 'sm-apps';
  for (const app of registry.list()) {
    const b = document.createElement('button');
    b.className = 'sm-app';
    b.innerHTML = `<span class="sm-app-ico">${app.icon}</span><span>${app.name}</span>`;
    b.addEventListener('click', () => {
      launch(app.id);
      startMenu.hidden = true;
    });
    smApps.appendChild(b);
  }
  startMenu.innerHTML = `
    <div class="sm-head">
      <span class="sm-logo">◈</span>
      <div class="sm-head-text">
        <div class="sm-title">AURORA OS</div>
        <div class="sm-sub">1.0.0 “Nebula”</div>
      </div>
    </div>`;
  startMenu.appendChild(smApps);
  const smFoot = document.createElement('div');
  smFoot.className = 'sm-foot';
  const lockBtn = document.createElement('button');
  lockBtn.textContent = '🔒 Lock';
  lockBtn.addEventListener('click', () => {
    startMenu.hidden = true;
    lock();
  });
  const restartBtn = document.createElement('button');
  restartBtn.textContent = '⟳ Restart';
  restartBtn.addEventListener('click', () => {
    startMenu.hidden = true;
    window.location.reload();
  });
  smFoot.append(lockBtn, restartBtn);
  startMenu.appendChild(smFoot);

  const toggleStart = (force?: boolean): void => {
    startMenu.hidden = force ?? !startMenu.hidden;
  };
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStart();
    sound.click();
  });

  /* ---- context menu ---------------------------------------------- */
  const cycleWallpaper = (): void => {
    const idx = WALLPAPERS.indexOf(settings.wallpaper);
    settings.wallpaper = WALLPAPERS[(idx + 1) % WALLPAPERS.length];
    saveSettings(settings);
    wallpaper.className = `wallpaper wp-${settings.wallpaper}`;
    bus.emit(EV.THEME_CHANGED, settings);
  };

  const ctxItems: Array<[string, () => void]> = [
    ['Open Terminal', () => launch('terminal')],
    [
      'New Folder…',
      () => {
        const name = window.prompt('Folder name:', 'New Folder');
        if (name) {
          try {
            fs.mkdir(`/home/user/Desktop/${name}`);
          } catch {
            /* ignore */
          }
        }
      },
    ],
    [
      'New File…',
      () => {
        const name = window.prompt('File name:', 'newfile.txt');
        if (name) {
          try {
            fs.writeFile(`/home/user/Desktop/${name}`, '');
          } catch {
            /* ignore */
          }
        }
      },
    ],
    ['Change Wallpaper', cycleWallpaper],
    ['Lock Screen', () => lock()],
    ['Restart AURORA OS', () => window.location.reload()],
  ];

  const showContext = (x: number, y: number): void => {
    contextMenu.innerHTML = '';
    for (const [label, fn] of ctxItems) {
      const item = document.createElement('button');
      item.className = 'ctx-item';
      item.textContent = label;
      item.addEventListener('click', () => {
        hideContext();
        fn();
      });
      contextMenu.appendChild(item);
    }
    contextMenu.hidden = false;
    const w = contextMenu.offsetWidth;
    const h = contextMenu.offsetHeight;
    contextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 8))}px`;
    contextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 56))}px`;
  };
  const hideContext = (): void => {
    contextMenu.hidden = true;
  };

  desktop.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.win') || t.closest('#taskbar')) return;
    e.preventDefault();
    showContext(e.clientX, e.clientY);
  });

  /* ---- global click / key handling ------------------------------- */
  document.addEventListener('click', (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target as Node) && (e.target as HTMLElement) !== startBtn) {
      toggleStart(true);
    }
    if (!contextMenu.hidden && !contextMenu.contains(e.target as Node)) hideContext();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleStart(true);
      hideContext();
    }
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      lock();
    }
  });

  /* ---- wifi popup ------------------------------------------------ */
  wifiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.createElement('div');
    pop.className = 'tb-popup';
    pop.innerHTML =
      '<div class="pop-title">Network</div>' +
      '<div>📶 <b>AuroraNet</b> — connected</div>' +
      '<div class="muted">Virtual interface · 10.0.0.1</div>';
    const rect = wifiBtn.getBoundingClientRect();
    pop.style.right = `${window.innerWidth - rect.right}px`;
    pop.style.bottom = '52px';
    document.body.appendChild(pop);
    const close = (ev: Event): void => {
      if (!pop.contains(ev.target as Node)) {
        pop.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  });

  // Unlock the AudioContext on the first real interaction.
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

  // Double-click the wallpaper to open a terminal.
  wallpaper.addEventListener('dblclick', () => launch('terminal'));
}

/* ------------------------------------------------------------------ *
 * Boot sequence
 * ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  const steps: Array<[string, number]> = [
    ['Initializing kernel…', 10],
    ['Mounting virtual filesystem…', 26],
    ['Starting window manager…', 44],
    ['Loading applications…', 64],
    ['Starting shell services…', 82],
  ];

  const t0 = performance.now();
  for (const [label, pct] of steps) {
    bootStatus.textContent = label;
    bootBar.style.width = `${pct}%`;
    bootRing.style.strokeDashoffset = String(RING_CIRC * (1 - pct / 100));
    await delay(160 + Math.random() * 220);
  }

  /* ---- kernel subsystems ----------------------------------------- */
  const settings = loadSettings();
  applyTheme(settings);

  const fs = new FileSystem(true);
  const processes = new ProcessManager();
  const windows = new WindowManager(document.getElementById('windows-layer') as HTMLElement);
  const registry = new AppRegistry();

  registerApps(registry);
  buildDesktopShell({ fs, windows, processes, registry, settings });

  bus.on(EV.THEME_CHANGED, (s) => applyTheme(s as SettingsState));
  bus.on(EV.VOLUME_CHANGED, (v) => sound.setEnabled(v as boolean));

  // When a process dies (e.g. `kill` from the terminal), close its windows.
  // Closing an already-closing window is a no-op, so this is safe on the
  // normal exit path too.
  bus.on(EV.PROCESS_EXIT, (p) => {
    const pid = (p as { pid: number }).pid;
    for (const w of windows.windows) {
      if (w.pid === pid) windows.close(w.id);
    }
  });

  /* ---- ready ----------------------------------------------------- */
  bootStatus.textContent = 'Ready.';
  bootBar.style.width = '100%';
  bootRing.style.strokeDashoffset = '0';
  await delay(360);

  bootScreen.classList.add('boot-done');
  desktop.hidden = false;
  requestAnimationFrame(() => desktop.classList.add('desktop-in'));
  setTimeout(() => bootScreen.remove(), 1000);

  bus.emit(EV.BOOT_DONE, { took: Math.round(performance.now() - t0) });
  sound.boot();
}

void boot();
