/**
 * ClockApp — analog clock, world time and stopwatch in one window.
 *
 * Zero dependencies: SVG hands driven by requestAnimationFrame, a
 * world-clock column (UTC + a few cities) and a lap-capable stopwatch.
 */

export function createClockApp(_ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-clock';

  body.innerHTML = `
    <style>
      .app-clock { display: flex; gap: 16px; padding: 14px; font-family: 'JetBrains Mono', monospace; }
      .clock-left { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .clock-dial { width: 180px; height: 180px; }
      .clock-digital { font-size: 20px; letter-spacing: 2px; }
      .clock-date { font-size: 11px; opacity: .7; }
      .clock-right { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 170px; }
      .clock-zone { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(241,90,36,.25); padding-bottom: 3px; font-size: 13px; }
      .clock-zone b { font-weight: 600; }
      .clock-sw { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
      .clock-sw-time { font-size: 22px; text-align: center; }
      .clock-sw-row { display: flex; gap: 6px; justify-content: center; }
      .clock-btn { background: rgba(241,90,36,.15); color: var(--acc, #F15A24); border: 1px solid rgba(241,90,36,.4);
                   border-radius: 4px; padding: 4px 14px; cursor: pointer; font: inherit; font-size: 12px; }
      .clock-btn:hover { background: rgba(241,90,36,.3); }
      .clock-laps { font-size: 11px; opacity: .8; max-height: 84px; overflow-y: auto; text-align: center; }
    </style>
    <div class="clock-left">
      <svg class="clock-dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(241,90,36,.5)" stroke-width="3"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30) * Math.PI / 180;
          const x1 = 100 + 84 * Math.sin(a), y1 = 100 - 84 * Math.cos(a);
          const x2 = 100 + 92 * Math.sin(a), y2 = 100 - 92 * Math.cos(a);
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(241,90,36,.8)" stroke-width="2"/>`;
        }).join('')}
        <line id="clk-h" x1="100" y1="100" x2="100" y2="52" stroke="var(--acc,#F15A24)" stroke-width="5" stroke-linecap="round"/>
        <line id="clk-m" x1="100" y1="100" x2="100" y2="30" stroke="var(--acc,#F15A24)" stroke-width="3" stroke-linecap="round"/>
        <line id="clk-s" x1="100" y1="100" x2="100" y2="24" stroke="#7f5af0" stroke-width="1.5"/>
        <circle cx="100" cy="100" r="4" fill="var(--acc,#F15A24)"/>
      </svg>
      <div class="clock-digital" id="clk-digital">--:--:--</div>
      <div class="clock-date" id="clk-date"></div>
    </div>
    <div class="clock-right">
      <div id="clk-zones"></div>
      <div class="clock-sw">
        <div class="clock-sw-time" id="sw-time">00:00.0</div>
        <div class="clock-sw-row">
          <button class="clock-btn" id="sw-start">Start</button>
          <button class="clock-btn" id="sw-lap">Lap</button>
          <button class="clock-btn" id="sw-reset">Reset</button>
        </div>
        <div class="clock-laps" id="sw-laps"></div>
      </div>
    </div>`;

  const ZONES: Array<[string, number]> = [
    ['UTC', 0], ['Warszawa', 1], ['Londyn', 0], ['Nowy Jork', -5], ['Tokio', 9],
  ];

  const zonesEl = body.querySelector<HTMLDivElement>('#clk-zones')!;
  zonesEl.innerHTML = ZONES.map(([name], i) =>
    `<div class="clock-zone"><span>${name}</span><b id="clk-z${i}">--:--</b></div>`).join('');

  const h = body.querySelector('#clk-h') as SVGLineElement;
  const m = body.querySelector('#clk-m') as SVGLineElement;
  const s = body.querySelector('#clk-s') as SVGLineElement;
  const digital = body.querySelector<HTMLDivElement>('#clk-digital')!;
  const dateEl = body.querySelector<HTMLDivElement>('#clk-date')!;

  const setHand = (el: SVGLineElement, len: number, frac: number): void => {
    const a = frac * 2 * Math.PI;
    el.setAttribute('x2', String(100 + len * Math.sin(a)));
    el.setAttribute('y2', String(100 - len * Math.cos(a)));
  };

  const fmt2 = (n: number): string => String(n).padStart(2, '0');

  const tick = (): void => {
    const now = new Date();
    const ms = now.getMilliseconds();
    const sec = now.getSeconds() + ms / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    setHand(s, 74, sec / 60);
    setHand(m, 56, min / 60);
    setHand(h, 40, hr / 12);
    digital.textContent = `${fmt2(now.getHours())}:${fmt2(now.getMinutes())}:${fmt2(now.getSeconds())}`;
    dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    ZONES.forEach(([_name, off], i) => {
      const t = new Date(now.getTime() + (off * 60 + now.getTimezoneOffset()) * 60000);
      const el = body.querySelector<HTMLBRElement>(`#clk-z${i}`);
      if (el) el.textContent = `${fmt2(t.getHours())}:${fmt2(t.getMinutes())}`;
    });
    if (document.body.contains(body)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // stopwatch
  let swStart = 0, swAcc = 0, swRunning = false, raf = 0;
  const swTime = body.querySelector<HTMLDivElement>('#sw-time')!;
  const laps = body.querySelector<HTMLDivElement>('#sw-laps')!;
  const swRender = (): void => {
    const t = swAcc + (swRunning ? Date.now() - swStart : 0);
    const mins = Math.floor(t / 60000);
    const secs = Math.floor((t % 60000) / 1000);
    const tenths = Math.floor((t % 1000) / 100);
    swTime.textContent = `${fmt2(mins)}:${fmt2(secs)}.${tenths}`;
    if (swRunning) raf = requestAnimationFrame(swRender);
  };
  const bStart = body.querySelector<HTMLButtonElement>('#sw-start')!;
  bStart.addEventListener('click', () => {
    if (swRunning) { swAcc += Date.now() - swStart; swRunning = false; bStart.textContent = 'Start'; cancelAnimationFrame(raf); }
    else { swStart = Date.now(); swRunning = true; bStart.textContent = 'Stop'; swRender(); }
  });
  body.querySelector<HTMLButtonElement>('#sw-lap')!.addEventListener('click', () => {
    if (!swRunning && swAcc === 0) return;
    const div = document.createElement('div');
    div.textContent = `• ${swTime.textContent}`;
    laps.prepend(div);
  });
  body.querySelector<HTMLButtonElement>('#sw-reset')!.addEventListener('click', () => {
    swRunning = false; swAcc = 0; cancelAnimationFrame(raf); swTime.textContent = '00:00.0'; laps.innerHTML = ''; bStart.textContent = 'Start';
  });

  return body;
}
