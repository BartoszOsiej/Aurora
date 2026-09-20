/**
 * SettingsApp — theme picker, wallpaper, clock format, sound toggle.
 */

import { bus, EV } from '../core/EventBus';
import type { AppContext } from '../core/AppRegistry';

export interface SettingsState {
  theme: string;
  wallpaper: string;
  sound: boolean;
  clock24: boolean;
}

const KEY = 'aurora.settings.v1';

export const defaultSettings: SettingsState = {
  theme: 'aurora',
  wallpaper: 'aurora',
  sound: true,
  clock24: true,
};

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultSettings, ...(JSON.parse(raw) as Partial<SettingsState>) };
  } catch { /* ignore */ }
  return { ...defaultSettings };
}

export function saveSettings(s: SettingsState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export const THEMES = [
  { id: 'aurora', name: 'Aurora', accent: '#F15A24', acc2: '#DA2C38', bg: '#050505' },
  { id: 'midnight', name: 'Midnight', accent: '#38bdf8', acc2: '#F15A24', bg: '#020617' },
  { id: 'ember', name: 'Ember', accent: '#f97316', acc2: '#ef4444', bg: '#1c0a05' },
  { id: 'forest', name: 'Forest', accent: '#4ade80', acc2: '#8b95a8', bg: '#04140c' },
  { id: 'light', name: 'Daylight', accent: '#d94e1f', acc2: '#DA2C38', bg: '#eef2ff' },
];

export const WALLPAPERS = ['aurora', 'grid', 'mountains', 'waves', 'dots'];

export function createSettingsApp(ctx: AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-settings';
  const settings = loadSettings();

  const section = (title: string): { wrap: HTMLElement; list: HTMLElement } => {
    const wrap = document.createElement('div');
    wrap.className = 'settings-section';
    const h = document.createElement('h4');
    h.textContent = title;
    const list = document.createElement('div');
    list.className = 'settings-options';
    wrap.append(h, list);
    body.appendChild(wrap);
    return { wrap, list };
  };

  const theme = section('Theme');
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'settings-option';
    b.style.borderColor = settings.theme === t.id ? t.accent : 'transparent';
    b.innerHTML = `<span class="so-dot" style="background:${t.accent}"></span>${t.name}`;
    b.addEventListener('click', () => {
      settings.theme = t.id;
      saveSettings(settings);
      bus.emit(EV.THEME_CHANGED, settings);
      location.reload();
    });
    theme.list.appendChild(b);
  }

  const wp = section('Wallpaper');
  for (const w of WALLPAPERS) {
    const b = document.createElement('button');
    b.className = 'settings-option';
    b.style.borderColor = settings.wallpaper === w ? '#F15A24' : 'transparent';
    b.textContent = w[0].toUpperCase() + w.slice(1);
    b.addEventListener('click', () => {
      settings.wallpaper = w;
      saveSettings(settings);
      bus.emit(EV.THEME_CHANGED, settings);
      const wpEl = document.getElementById('wallpaper');
      if (wpEl) wpEl.className = `wallpaper wp-${w}`;
    });
    wp.list.appendChild(b);
  }

  const toggles = section('Behavior');
  const sound = document.createElement('button');
  sound.className = 'settings-option';
  sound.textContent = `Sound: ${settings.sound ? 'ON' : 'OFF'}`;
  sound.addEventListener('click', () => {
    settings.sound = !settings.sound;
    saveSettings(settings);
    sound.textContent = `Sound: ${settings.sound ? 'ON' : 'OFF'}`;
    bus.emit(EV.VOLUME_CHANGED, settings.sound);
  });
  const clock = document.createElement('button');
  clock.className = 'settings-option';
  clock.textContent = `Clock: ${settings.clock24 ? '24h' : '12h'}`;
  clock.addEventListener('click', () => {
    settings.clock24 = !settings.clock24;
    saveSettings(settings);
    clock.textContent = `Clock: ${settings.clock24 ? '24h' : '12h'}`;
    bus.emit(EV.THEME_CHANGED, settings);
  });
  toggles.list.append(sound, clock);

  const about = section('About');
  const p = document.createElement('p');
  p.className = 'settings-about';
  p.innerHTML = `AURORA OS <b>1.0.0 "Nebula"</b><br>Window manager · Virtual filesystem · Terminal<br>${ctx.processes.count()} processes running`;
  about.list.appendChild(p);

  return body;
}
