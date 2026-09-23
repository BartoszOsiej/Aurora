/**
 * MinesweeperApp — classic minesweeper, 9x9/16x16, flags via right-click.
 * Zero dependencies; state machine per cell, flood-fill reveal.
 */

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; count: number };

export function createMinesweeperApp(_ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-mines';
  const COLS = 9, ROWS = 9, MINES = 10;

  body.innerHTML = `
    <style>
      .app-mines { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px; user-select: none; }
      .ms-top { display: flex; gap: 18px; font-family: 'JetBrains Mono', monospace; font-size: 14px; }
      .ms-face { cursor: pointer; font-size: 18px; }
      .ms-grid { display: grid; grid-template-columns: repeat(${COLS}, 28px); gap: 2px; }
      .ms-cell { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
                 background: rgba(241,90,36,.12); border: 1px solid rgba(241,90,36,.35); cursor: pointer;
                 font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--acc,#F15A24); }
      .ms-cell:hover { background: rgba(241,90,36,.25); }
      .ms-cell.revealed { background: rgba(0,0,0,.35); border-color: rgba(241,90,36,.12); cursor: default; }
      .ms-cell.mine { background: rgba(218,44,56,.6); }
      .ms-cell.flagged::after { content: '🚩'; font-size: 12px; }
      .ms-n1 { color: #7fd1ff; } .ms-n2 { color: #7ce38b; } .ms-n3 { color: #ff9580; } .ms-n4 { color: #d2a8ff; }
      .ms-new { background: rgba(241,90,36,.2); color: var(--acc,#F15A24); border: 1px solid rgba(241,90,36,.4);
                border-radius: 4px; padding: 4px 14px; cursor: pointer; font: inherit; font-size: 12px; }
    </style>
    <div class="ms-top">
      <span id="ms-mines">💣 ${MINES}</span>
      <span class="ms-face" id="ms-face">🙂</span>
      <span id="ms-time">⏱ 0s</span>
    </div>
    <div class="ms-grid" id="ms-grid"></div>
    <button class="ms-new" id="ms-new">Nowa gra</button>`;

  const gridEl = body.querySelector<HTMLDivElement>('#ms-grid')!;
  const face = body.querySelector<HTMLSpanElement>('#ms-face')!;
  const minesEl = body.querySelector<HTMLSpanElement>('#ms-mines')!;
  const timeEl = body.querySelector<HTMLSpanElement>('#ms-time')!;

  let grid: Cell[] = [], started = false, over = false, flags = 0, revealed = 0, timer = 0, tHandle = 0;

  const idx = (r: number, c: number): number => r * COLS + c;
  const neighbours = (r: number, c: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
    }
    return out;
  };

  const place = (safeR: number, safeC: number): void => {
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS);
      if (grid[idx(r, c)].mine || (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) continue;
      grid[idx(r, c)].mine = true; placed++;
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      grid[idx(r, c)].count = neighbours(r, c).filter(([nr, nc]) => grid[idx(nr, nc)].mine).length;
  };

  const render = (): void => {
    gridEl.innerHTML = '';
    grid.forEach((cell, i) => {
      const el = document.createElement('div');
      el.className = 'ms-cell' + (cell.revealed ? ' revealed' : '') + (cell.flagged ? ' flagged' : '') +
        (cell.revealed && cell.mine ? ' mine' : '');
      if (cell.revealed && !cell.mine && cell.count > 0) {
        el.textContent = String(cell.count);
        el.classList.add(`ms-n${Math.min(4, cell.count)}`);
      }
      el.addEventListener('click', () => reveal(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleFlag(i); });
      gridEl.appendChild(el);
    });
    minesEl.textContent = `💣 ${MINES - flags}`;
  };

  const reveal = (i: number): void => {
    if (over) return;
    const cell = grid[i];
    if (cell.flagged || cell.revealed) return;
    if (!started) { started = true; place(Math.floor(i / COLS), i % COLS); startTimer(); }
    cell.revealed = true;
    if (cell.mine) { return lose(i); }
    revealed++;
    if (cell.count === 0) {
      const r = Math.floor(i / COLS), c = i % COLS;
      for (const [nr, nc] of neighbours(r, c)) {
        const n = grid[idx(nr, nc)];
        if (!n.revealed && !n.flagged) reveal(idx(nr, nc));
      }
    }
    if (revealed === ROWS * COLS - MINES) return win();
    render();
  };

  const toggleFlag = (i: number): void => {
    if (over) return;
    const cell = grid[i];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    render();
  };

  const lose = (hit: number): void => {
    over = true; stopTimer();
    grid.forEach((c) => { if (c.mine) c.revealed = true; });
    grid[hit].revealed = true;
    face.textContent = '💀';
    render();
  };

  const win = (): void => {
    over = true; stopTimer();
    face.textContent = '😎';
    grid.forEach((c) => { if (c.mine) c.flagged = true; });
    render();
  };

  const startTimer = (): void => {
    timer = 0;
    tHandle = window.setInterval(() => { timer++; timeEl.textContent = `⏱ ${timer}s`; }, 1000);
  };
  const stopTimer = (): void => window.clearInterval(tHandle);

  const reset = (): void => {
    stopTimer();
    grid = Array.from({ length: ROWS * COLS }, () => ({ mine: false, revealed: false, flagged: false, count: 0 }));
    started = false; over = false; flags = 0; revealed = 0; timer = 0;
    timeEl.textContent = '⏱ 0s'; face.textContent = '🙂';
    render();
  };
  body.querySelector<HTMLButtonElement>('#ms-new')!.addEventListener('click', reset);
  face.addEventListener('click', reset);
  reset();

  return body;
}
