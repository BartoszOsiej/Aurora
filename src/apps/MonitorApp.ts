/**
 * MonitorApp — live system monitor with animated graphs and process list.
 */

import type { AppContext } from '../core/AppRegistry';

export function createMonitorApp(ctx: AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-monitor';

  const wrap = document.createElement('div');
  wrap.className = 'monitor-grid';

  // CPU graph
  const cpuCard = mkCard('CPU');
  const cpuCanvas = document.createElement('canvas');
  cpuCanvas.width = 300;
  cpuCanvas.height = 90;
  const cpuCtx = cpuCanvas.getContext('2d')!;
  cpuCard.appendChild(cpuCanvas);

  // MEM graph
  const memCard = mkCard('Memory');
  const memCanvas = document.createElement('canvas');
  memCanvas.width = 300;
  memCanvas.height = 90;
  const memCtx = memCanvas.getContext('2d')!;
  memCard.appendChild(memCanvas);

  // Process table
  const procCard = mkCard('Processes');
  const table = document.createElement('div');
  table.className = 'monitor-table';
  procCard.appendChild(table);

  wrap.append(cpuCard, memCard, procCard);

  const stats = document.createElement('div');
  stats.className = 'monitor-stats';

  body.append(wrap, stats);

  const cpuHist: number[] = [];
  const memHist: number[] = [];

  function mkCard(title: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'monitor-card';
    const h = document.createElement('h4');
    h.textContent = title;
    card.appendChild(h);
    return card;
  }

  function drawGraph(c: CanvasRenderingContext2D, hist: number[], color: string): void {
    const w = c.canvas.width;
    const h = c.canvas.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      c.beginPath();
      c.moveTo(0, (h / 3) * i);
      c.lineTo(w, (h / 3) * i);
      c.stroke();
    }
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(1, color + '11');
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    hist.forEach((v, i) => {
      const x = (i / Math.max(1, hist.length - 1)) * w;
      const y = h - (v / 100) * (h - 8) - 4;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
  }

  function renderProcTable(): void {
    const procs = ctx.processes.list();
    table.innerHTML = procs.map((p) => `
      <div class="monitor-row">
        <span>${p.icon} ${p.name}</span>
        <span class="m-cpu">${p.cpu.toFixed(0)}%</span>
        <span class="m-mem">${(p.mem / 1024).toFixed(0)} MB</span>
      </div>`).join('') || '<div class="monitor-row muted">no processes</div>';
  }

  const tick = (): void => {
    ctx.processes.tick();
    const procs = ctx.processes.list();
    const cpu = procs.length ? procs.reduce((a, p) => a + p.cpu, 0) / procs.length : 0;
    const mem = procs.length ? procs.reduce((a, p) => a + p.mem, 0) : 0;
    cpuHist.push(Math.min(100, cpu + 15 + Math.random() * 10));
    memHist.push(Math.min(100, (mem / (400 * 1024)) * 100 + 22));
    if (cpuHist.length > 60) cpuHist.shift();
    if (memHist.length > 60) memHist.shift();
    drawGraph(cpuCtx, cpuHist, '#F15A24');
    drawGraph(memCtx, memHist, '#34d399');
    renderProcTable();
    stats.textContent = `uptime ${Math.floor((Date.now() - (ctx.processes.list()[0]?.startedAt ?? Date.now())) / 1000)}s · ${procs.length} processes · ${(mem / 1024).toFixed(0)} MB used`;
  };

  const iv = setInterval(tick, 800);
  tick();
  body.addEventListener('app-exit', () => clearInterval(iv));
  return body;
}
