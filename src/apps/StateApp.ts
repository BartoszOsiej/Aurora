/**
 * StateApp — system snapshot manager (.aurora format).
 *
 * EXPORT: serialises the entire system state (virtual filesystem + settings,
 * format v2) to a `stan.aurora` document with a SHA-256 checksum and downloads
 * it (proprietary extension).
 * IMPORT: accepts a dropped/picked .aurora file, validates magic + version +
 * checksum, restores the filesystem and desktop settings.
 * v1 files (filesystem-only) still import; they just carry no settings.
 *
 * The .aurora extension is Hartwell Labs / AURORA OS proprietary.
 */

import { buildStateDocument, verifyStateDocument, type SettingsLike } from '../core/AuroraState';

const SNAPSHOT_DIR = '/home/user/snapshots';

/** Read live desktop settings off the kernel (main.ts publishes them here). */
const liveSettings = (): SettingsLike | null =>
  ((globalThis as { __auroraSettings?: SettingsLike }).__auroraSettings ?? null);

/** Push restored settings back into the running desktop. */
const applySettings = (s: SettingsLike): void => {
  (globalThis as { __auroraApplySettings?: (s: SettingsLike) => void }).__auroraApplySettings?.(s);
};

export function createStateApp(ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-state';

  body.innerHTML = `
    <style>
      .app-state { display: flex; flex-direction: column; gap: 12px; padding: 16px; height: 100%; overflow-y: auto; }
      .st-title { font-size: 15px; color: var(--acc,#F15A24); font-weight: 600; }
      .st-desc { font-size: 12px; opacity: .75; line-height: 1.5; }
      .st-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .st-btn { background: rgba(241,90,36,.15); color: var(--acc,#F15A24); border: 1px solid rgba(241,90,36,.4);
                border-radius: 4px; padding: 7px 16px; cursor: pointer; font: inherit; font-size: 12px; }
      .st-btn:hover { background: rgba(241,90,36,.3); }
      .st-log { font-family: 'JetBrains Mono', monospace; font-size: 11px; opacity: .8; border: 1px solid rgba(241,90,36,.2);
                border-radius: 4px; padding: 8px 10px; min-height: 90px; background: rgba(0,0,0,.25); white-space: pre-wrap; }
      .st-file { display: none; }
      .st-list { font-size: 11px; opacity: .8; }
      .st-list div { padding: 2px 0; border-bottom: 1px dotted rgba(241,90,36,.15); cursor: pointer; }
      .st-list div:hover { color: var(--acc,#F15A24); }
    </style>
    <div class="st-title">◈ Snapshot systemu (.aurora)</div>
    <div class="st-desc">
      Eksportuje cały wirtualny system plików do pliku <b>stan.aurora</b> (własnościowy format
      AURORA OS — JSON z nagłówkiem magic i wersją). Import zastępuje obecny stan systemu
      zweryfikowanym snapshotem.
    </div>
    <div class="st-row">
      <button class="st-btn" id="st-export">💾 Eksportuj stan.aurora</button>
      <button class="st-btn" id="st-import">📂 Importuj .aurora</button>
      <button class="st-btn" id="st-save-local">⚡ Zapisz lokalnie</button>
    </div>
    <input type="file" class="st-file" id="st-file" accept=".aurora,application/json" />
    <div class="st-title" style="font-size:12px">Snapshoty lokalne (w FS)</div>
    <div class="st-list" id="st-list"></div>
    <div class="st-log" id="st-log">gotowy</div>`;

  const log = (...lines: string[]): void => {
    const el = body.querySelector<HTMLDivElement>('#st-log')!;
    el.textContent = lines.join('\n');
  };

  const fileList = (): void => {
    const el = body.querySelector<HTMLDivElement>('#st-list')!;
    try {
      const names = (ctx.fs.tree(SNAPSHOT_DIR, 1) ?? [])
        .filter((n) => n.kind === 'file')
        .map((n) => n.path.split('/').pop() ?? n.path);
      el.innerHTML = names.length
        ? names.map((n) => `<div data-n="${n}">◈ ${n}</div>`).join('')
        : '<div style="opacity:.4;cursor:default">brak snapshotów — zapisz lokalny</div>';
      el.querySelectorAll('div[data-n]').forEach((d) =>
        d.addEventListener('click', () => restoreLocal((d as HTMLElement).dataset.n ?? '')));
    } catch {
      el.innerHTML = '<div style="opacity:.4;cursor:default">brak snapshotów</div>';
    }
  };

  const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // ── EXPORT: download stan.aurora (v2: fs + settings + checksum) ──
  body.querySelector<HTMLButtonElement>('#st-export')!.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#st-export')!;
    btn.disabled = true;
    try {
      const json = await buildStateDocument({ fsJson: ctx.fs.exportState(), settings: liveSettings() });
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `stan-${stamp()}.aurora`;
      a.click();
      URL.revokeObjectURL(a.href);
      log(`[${stamp()}] wyeksportowano stan-${stamp()}.aurora (v2, ${(json.length / 1024).toFixed(1)} kB, checksum ✓)`);
    } catch (e) {
      log(`[${stamp()}] ✕ eksport nieudany: ${(e as Error).message}`);
    } finally {
      btn.disabled = false;
    }
  });

  // ── IMPORT: file picker ──
  const fileInput = body.querySelector<HTMLInputElement>('#st-file')!;
  body.querySelector<HTMLButtonElement>('#st-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const doc = String(reader.result ?? '');
      const verdict = await verifyStateDocument(doc);
      if (!verdict.ok) {
        log(`[${stamp()}] ✕ ${f.name}: ${verdict.reason}`);
        fileInput.value = '';
        return;
      }
      const fsOk = ctx.fs.importState(JSON.stringify({ magic: 'AURORA-STATE', version: 1, fs: verdict.fs }));
      let settingsNote = '';
      if (verdict.settings) {
        applySettings(verdict.settings);
        settingsNote = ' + ustawienia przywrócone';
      }
      if (fsOk) {
        log(`[${stamp()}] zaimportowano ${f.name} ✓ (v${verdict.version}${settingsNote})`);
      } else {
        log(`[${stamp()}] ✕ ${f.name}: FS ok, ale import systemu plików nie powiódł się`);
      }
      fileInput.value = '';
      fileList();
    };
    reader.readAsText(f);
  });

  // ── LOCAL snapshots inside the FS (v2 documents) ──
  body.querySelector<HTMLButtonElement>('#st-save-local')!.addEventListener('click', async () => {
    try {
      if (!ctx.fs.exists(SNAPSHOT_DIR)) ctx.fs.mkdir(SNAPSHOT_DIR);
    } catch { /* exists */ }
    const name = `snap-${stamp()}.aurora`;
    const json = await buildStateDocument({ fsJson: ctx.fs.exportState(), settings: liveSettings() });
    ctx.fs.writeFile(`${SNAPSHOT_DIR}/${name}`, json);
    log(`[${stamp()}] zapisano lokalnie: ${SNAPSHOT_DIR}/${name} (v2)`);
    fileList();
  });

  const restoreLocal = async (name: string): Promise<void> => {
    if (!name) return;
    try {
      const doc = ctx.fs.readFile(`${SNAPSHOT_DIR}/${name}`);
      const verdict = await verifyStateDocument(doc);
      if (!verdict.ok) {
        log(`[${stamp()}] ✕ ${name}: ${verdict.reason}`);
        return;
      }
      const ok = ctx.fs.importState(JSON.stringify({ magic: 'AURORA-STATE', version: 1, fs: verdict.fs }));
      if (ok && verdict.settings) applySettings(verdict.settings);
      log(`[${stamp()}] przywrócono ${name} (v${verdict.version}): ${ok ? '✓' : '✕ błąd FS'}`);
    } catch (e) {
      log(`[${stamp()}] ✕ ${name}: ${(e as Error).message}`);
    }
  };

  fileList();
  return body;
}
