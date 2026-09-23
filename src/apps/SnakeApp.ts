/**
 * SnakeApp — grid snake on canvas, arrow keys / WASD, speed ramps.
 * Zero dependencies; fixed-timestep loop with pause.
 */

export function createSnakeApp(_ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-snake';
  const COLS = 24, ROWS = 18, CELL = 20;

  body.innerHTML = `
    <style>
      .app-snake { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px; outline: none; }
      .sn-top { display: flex; gap: 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
      .sn-canvas { background: rgba(0,0,0,.4); border: 1px solid rgba(241,90,36,.4); border-radius: 4px; }
      .sn-hint { font-size: 11px; opacity: .65; }
    </style>
    <div class="sn-top"><span id="sn-score">🍎 0</span><span id="sn-best">🏆 0</span><span id="sn-state">Ready</span></div>
    <canvas class="sn-canvas" width="${COLS * CELL}" height="${ROWS * CELL}"></canvas>
    <div class="sn-hint">strzałki / WASD · P = pauza</div>`;

  const canvas = body.querySelector<HTMLCanvasElement>('.sn-canvas')!;
  const ctx2d = canvas.getContext('2d')!;
  const scoreEl = body.querySelector<HTMLSpanElement>('#sn-score')!;
  const bestEl = body.querySelector<HTMLSpanElement>('#sn-best')!;
  const stateEl = body.querySelector<HTMLSpanElement>('#sn-state')!;

  type P = { x: number; y: number };
  let snake: P[] = [], dir: P = { x: 1, y: 0 }, nextDir: P = dir, food: P = { x: 0, y: 0 };
  let score = 0, best = 0, dead = true, paused = false, acc = 0, last = 0, speed = 140;

  const placeFood = (): void => {
    do {
      food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  };

  const reset = (): void => {
    snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
    dir = { x: 1, y: 0 }; nextDir = dir;
    score = 0; dead = false; paused = false; speed = 140; acc = 0;
    scoreEl.textContent = '🍎 0'; stateEl.textContent = 'Running';
    placeFood();
  };

  const step = (): void => {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        snake.some((s) => s.x === head.x && s.y === head.y)) {
      dead = true; stateEl.textContent = 'Game Over — Enter = restart';
      best = Math.max(best, score); bestEl.textContent = `🏆 ${best}`;
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10; scoreEl.textContent = `🍎 ${score}`;
      speed = Math.max(60, speed - 3);
      placeFood();
    } else {
      snake.pop();
    }
  };

  const draw = (): void => {
    ctx2d.fillStyle = 'rgba(0,0,0,0)';
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    // food
    ctx2d.fillStyle = '#DA2C38';
    ctx2d.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
    // snake
    snake.forEach((s, i) => {
      ctx2d.fillStyle = i === 0 ? '#F15A24' : `rgba(241,90,36,${Math.max(0.35, 1 - i * 0.03)})`;
      ctx2d.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
    if (paused) {
      ctx2d.fillStyle = 'rgba(5,5,5,.6)';
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.fillStyle = '#F15A24';
      ctx2d.font = '16px JetBrains Mono, monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText('PAUZA', canvas.width / 2, canvas.height / 2);
    }
  };

  const loop = (t: number): void => {
    if (!document.body.contains(body)) return; // app closed
    const dt = t - last; last = t;
    if (!dead && !paused) {
      acc += dt;
      while (acc >= speed) { acc -= speed; step(); if (dead) break; }
    }
    draw();
    requestAnimationFrame(loop);
  };

  const onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    const map: Record<string, P> = {
      arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
      arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
    };
    if (k === 'enter' && dead) { reset(); return; }
    if (k === 'p' && !dead) { paused = !paused; stateEl.textContent = paused ? 'Paused' : 'Running'; return; }
    const nd = map[k];
    if (nd && !(nd.x === -dir.x && nd.y === -dir.y)) { nextDir = nd; e.preventDefault(); }
  };
  body.tabIndex = 0;
  body.addEventListener('keydown', onKey);
  body.addEventListener('click', () => body.focus());

  bestEl.textContent = `🏆 0`;
  stateEl.textContent = 'Ready — Enter/kliknij';
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && dead) reset(); });
  requestAnimationFrame((t) => { last = t; loop(t); });

  return body;
}
