/**
 * PaintApp — a canvas drawing app with color palette, brush size and eraser.
 */

import type { AppContext } from '../core/AppRegistry';

const PALETTE = ['#ffffff', '#000000', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#F15A24', '#ec4899', '#94a3b8', '#78350f'];

export function createPaintApp(_ctx: AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-paint';

  const toolbar = document.createElement('div');
  toolbar.className = 'paint-toolbar';

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 420;
  canvas.className = 'paint-canvas';

  const ctx2d = canvas.getContext('2d')!;
  ctx2d.fillStyle = '#1a2036';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  let color = '#ffffff';
  let size = 4;
  let drawing = false;

  const colorRow = document.createElement('div');
  colorRow.className = 'paint-colors';
  for (const c of PALETTE) {
    const sw = document.createElement('button');
    sw.className = 'paint-swatch';
    sw.style.background = c;
    sw.addEventListener('click', () => { color = c; });
    colorRow.appendChild(sw);
  }

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'paint-size-label';
  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = '1';
  sizeInput.max = '24';
  sizeInput.value = '4';
  sizeInput.addEventListener('input', () => { size = parseInt(sizeInput.value, 10); sizeLabel.textContent = `Brush: ${size}px`; });

  const eraser = document.createElement('button');
  eraser.className = 'fbtn';
  eraser.textContent = 'Eraser';
  eraser.addEventListener('click', () => { color = '#1a2036'; });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'fbtn';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    ctx2d.fillStyle = '#1a2036';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'fbtn primary';
  saveBtn.textContent = 'Save PNG';
  saveBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'aurora-art.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  sizeLabel.textContent = 'Brush: 4px';
  toolbar.append(colorRow, sizeLabel, sizeInput, eraser, clearBtn, saveBtn);

  const pos = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const p = pos(e);
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx2d.fill();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = size;
    ctx2d.lineCap = 'round';
    ctx2d.lineTo(p.x, p.y);
    ctx2d.stroke();
    ctx2d.beginPath();
    ctx2d.moveTo(p.x, p.y);
  });
  window.addEventListener('mouseup', () => { drawing = false; });

  body.append(toolbar, canvas);
  return body;
}
