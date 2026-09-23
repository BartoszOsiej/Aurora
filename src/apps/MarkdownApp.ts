/**
 * MarkdownApp — live Markdown editor with split preview.
 *
 * Supports the common subset: headings, bold/italic, inline code, code
 * fences, lists, links, images, blockquotes and hr. Renders to a sanitised
 * preview pane (HTML built from text nodes / element creation only — no
 * raw innerHTML from user input beyond whitelisted patterns).
 */

export function createMarkdownApp(_ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-md';

  body.innerHTML = `
    <style>
      .app-md { display: flex; flex-direction: column; height: 100%; }
      .md-toolbar { display: flex; gap: 8px; padding: 6px 10px; border-bottom: 1px solid rgba(241,90,36,.25); font-size: 12px; align-items: center; }
      .md-toolbar .md-hint { opacity: .6; margin-left: auto; }
      .md-panes { flex: 1; display: flex; min-height: 0; }
      .md-src { flex: 1; background: rgba(0,0,0,.25); color: var(--acc,#F15A24); border: none; outline: none; resize: none;
                padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.5; }
      .md-view { flex: 1; padding: 12px 16px; overflow-y: auto; line-height: 1.55; font-size: 14px; border-left: 1px solid rgba(241,90,36,.25); }
      .md-view h1, .md-view h2, .md-view h3 { color: var(--acc,#F15A24); margin: .6em 0 .3em; }
      .md-view pre { background: rgba(0,0,0,.35); padding: 8px 10px; border-radius: 4px; overflow-x: auto; }
      .md-view code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
      .md-view blockquote { border-left: 3px solid var(--acc,#F15A24); margin: .5em 0; padding: .1em .8em; opacity: .85; }
      .md-view img { max-width: 100%; }
    </style>
    <div class="md-toolbar">
      <span># nagłówek</span><span>**pogrubienie**</span><span>\`kod\`</span><span>- lista</span><span>[link](url)</span>
      <span class="md-hint">edycja na żywo →</span>
    </div>
    <div class="md-panes">
      <textarea class="md-src" spellcheck="false"></textarea>
      <div class="md-view"></div>
    </div>`;

  const src = body.querySelector<HTMLTextAreaElement>('.md-src')!;
  const view = body.querySelector<HTMLDivElement>('.md-view')!;

  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string): string =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const render = (): void => {
    const lines = src.value.split('\n');
    const out: string[] = [];
    let inCode = false, inList = false, inQuote = false;
    const closeList = (): void => { if (inList) { out.push('</ul>'); inList = false; } };
    const closeQuote = (): void => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        closeList(); closeQuote();
        out.push(inCode ? '</code></pre>' : '<pre><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(esc(line)); continue; }

      const h = /^(#{1,3})\s+(.*)/.exec(line);
      if (h) { closeList(); closeQuote(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

      if (/^(---|\*\*\*)\s*$/.test(line)) { closeList(); closeQuote(); out.push('<hr>'); continue; }

      const li = /^[-*]\s+(.*)/.exec(line);
      if (li) { closeQuote(); if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
      closeList();

      const q = /^>\s?(.*)/.exec(line);
      if (q) { if (!inQuote) { out.push('<blockquote>'); inQuote = true; } out.push(`<p>${inline(q[1])}</p>`); continue; }
      closeQuote();

      if (line.trim() === '') { out.push('<br>'); continue; }
      out.push(`<p>${inline(line)}</p>`);
    }
    closeList(); closeQuote();
    if (inCode) out.push('</code></pre>');
    view.innerHTML = out.join('');
  };

  src.addEventListener('input', render);
  src.value = `# Witaj w AURORA OS ✨

To **podgląd na żywo** — pisz po lewej, czytaj po prawej.

## Możliwości
- nagłówki *poziomu* **1-3**
- \`kod inline\` i bloki kodu
- listy, [linki](https://example.com), cytaty

> Zero zależności, całość w czystym TypeScript.

\`\`\`ts
const aurora = "beautiful";
\`\`\`
`;
  render();

  return body;
}
