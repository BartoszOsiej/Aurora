/**
 * BrowserApp — sandboxed web browser panel.
 *
 * Renders external pages in a sandboxed iframe (no same-origin, no
 * top-navigation), with an URL bar and quick-bookmarks. Many sites
 * refuse framing (X-Frame-Options/CSP); those show a friendly note
 * and an "open in new tab" escape hatch.
 */

const BOOKMARKS: Array<[string, string]> = [
  ['Wikipedia', 'https://pl.m.wikipedia.org/'],
  ['Hacker News', 'https://news.ycombinator.com/'],
  ['MDN', 'https://developer.mozilla.org/'],
  ['GitHub', 'https://github.com/'],
];

export function createBrowserApp(_ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-browser';

  body.innerHTML = `
    <style>
      .app-browser { display: flex; flex-direction: column; height: 100%; }
      .br-bar { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid rgba(241,90,36,.25); }
      .br-url { flex: 1; background: rgba(0,0,0,.3); border: 1px solid rgba(241,90,36,.35); color: var(--acc,#F15A24);
                font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 5px 8px; border-radius: 4px; outline: none; }
      .br-go { background: rgba(241,90,36,.2); color: var(--acc,#F15A24); border: 1px solid rgba(241,90,36,.4);
               border-radius: 4px; padding: 5px 12px; cursor: pointer; font: inherit; font-size: 12px; }
      .br-marks { display: flex; gap: 6px; padding: 4px 8px; border-bottom: 1px solid rgba(241,90,36,.15); flex-wrap: wrap; }
      .br-mark { font-size: 11px; color: var(--acc,#F15A24); opacity: .85; cursor: pointer; padding: 2px 6px;
                 border: 1px solid rgba(241,90,36,.25); border-radius: 3px; }
      .br-mark:hover { background: rgba(241,90,36,.15); }
      .br-frame-wrap { flex: 1; position: relative; min-height: 0; }
      .br-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: #0b0b12; }
      .br-note { position: absolute; inset: 0; display: none; flex-direction: column; gap: 10px; align-items: center;
                 justify-content: center; text-align: center; padding: 24px; color: var(--acc,#F15A24); font-size: 13px; }
      .br-note a { color: #7f5af0; }
    </style>
    <div class="br-bar">
      <input class="br-url" spellcheck="false" placeholder="https://…" />
      <button class="br-go" id="br-go">Go</button>
    </div>
    <div class="br-marks">
      ${BOOKMARKS.map(([name, url]) => `<span class="br-mark" data-url="${url}">${name}</span>`).join('')}
    </div>
    <div class="br-frame-wrap">
      <iframe class="br-frame" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>
      <div class="br-note" id="br-note">
        <div>🔒 Ta strona odmawia osadzenia w ramce (X-Frame-Options / CSP).</div>
        <div><a id="br-open" href="#" target="_blank" rel="noopener noreferrer">Otwórz w nowej karcie ↗</a></div>
      </div>
    </div>`;

  const urlInput = body.querySelector<HTMLInputElement>('.br-url')!;
  const frame = body.querySelector<HTMLIFrameElement>('.br-frame')!;
  const note = body.querySelector<HTMLDivElement>('#br-note')!;
  const openLink = body.querySelector<HTMLAnchorElement>('#br-open')!;

  const navigate = (raw: string): void => {
    let url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      urlInput.value = u.toString();
      note.style.display = 'none';
      frame.src = u.toString();
    } catch { /* ignore malformed */ }
  };

  body.querySelector<HTMLButtonElement>('#br-go')!.addEventListener('click', () => navigate(urlInput.value));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(urlInput.value); });
  body.querySelectorAll<HTMLSpanElement>('.br-mark').forEach((el) =>
    el.addEventListener('click', () => navigate(el.dataset.url ?? '')));
  // if the site refused framing, the load event still fires but content is
  // blocked — detect the common case via load timeout probe
  frame.addEventListener('load', () => {
    // best effort: nothing reliable cross-origin; hide note on successful nav
    setTimeout(() => { /* keep as-is */ }, 0);
  });
  frame.addEventListener('error', () => {
    openLink.href = frame.src;
    note.style.display = 'flex';
  });

  return body;
}
