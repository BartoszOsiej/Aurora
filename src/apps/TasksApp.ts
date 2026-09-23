/**
 * TasksApp — lightweight task tracker persisted in the virtual FS
 * (/home/user/tasks.json). Add, complete, delete, filter. Data survives
 * reloads and is included in .aurora system snapshots.
 */

interface Task { id: number; text: string; done: boolean; created: string }

const TASKS_PATH = '/home/user/tasks.json';

export function createTasksApp(ctx: import('../core/AppRegistry').AppContext): HTMLElement {
  const body = document.createElement('div');
  body.className = 'app app-tasks';

  body.innerHTML = `
    <style>
      .app-tasks { display: flex; flex-direction: column; height: 100%; padding: 10px 14px; gap: 8px; }
      .tk-add { display: flex; gap: 6px; }
      .tk-input { flex: 1; background: rgba(0,0,0,.3); border: 1px solid rgba(241,90,36,.35); color: var(--acc,#F15A24);
                  font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 4px; outline: none; }
      .tk-btn { background: rgba(241,90,36,.2); color: var(--acc,#F15A24); border: 1px solid rgba(241,90,36,.4);
                border-radius: 4px; padding: 5px 14px; cursor: pointer; font: inherit; font-size: 12px; }
      .tk-filters { display: flex; gap: 8px; font-size: 11px; }
      .tk-f { cursor: pointer; opacity: .6; padding: 2px 8px; border-radius: 3px; border: 1px solid transparent; }
      .tk-f.active { opacity: 1; border-color: rgba(241,90,36,.4); }
      .tk-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
      .tk-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid rgba(241,90,36,.15);
                 border-radius: 4px; font-size: 13px; }
      .tk-item.done .tk-text { text-decoration: line-through; opacity: .5; }
      .tk-check { cursor: pointer; color: var(--acc,#F15A24); }
      .tk-text { flex: 1; }
      .tk-del { cursor: pointer; opacity: .4; font-size: 12px; }
      .tk-del:hover { opacity: 1; color: #DA2C38; }
      .tk-meta { font-size: 10px; opacity: .55; }
    </style>
    <div class="tk-add">
      <input class="tk-input" placeholder="Nowe zadanie… (Enter)" spellcheck="false" />
      <button class="tk-btn" id="tk-add">Dodaj</button>
    </div>
    <div class="tk-filters">
      <span class="tk-f active" data-f="all">wszystkie</span>
      <span class="tk-f" data-f="open">otwarte</span>
      <span class="tk-f" data-f="done">zrobione</span>
      <span style="flex:1"></span>
      <span class="tk-meta">zapis: /home/user/tasks.json</span>
    </div>
    <div class="tk-list" id="tk-list"></div>`;

  const input = body.querySelector<HTMLInputElement>('.tk-input')!;
  const listEl = body.querySelector<HTMLDivElement>('#tk-list')!;
  let tasks: Task[] = [];
  let filter: 'all' | 'open' | 'done' = 'all';

  const load = (): void => {
    try { tasks = JSON.parse(ctx.fs.readFile(TASKS_PATH)) as Task[]; }
    catch { tasks = []; }
  };
  const persist = (): void => {
    try { ctx.fs.writeFile(TASKS_PATH, JSON.stringify(tasks, null, 2)); } catch { /* ignore */ }
  };

  const render = (): void => {
    const visible = tasks.filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done));
    listEl.innerHTML = '';
    for (const t of visible) {
      const row = document.createElement('div');
      row.className = 'tk-item' + (t.done ? ' done' : '');
      const check = document.createElement('span');
      check.className = 'tk-check'; check.textContent = t.done ? '☑' : '☐';
      check.addEventListener('click', () => { t.done = !t.done; persist(); render(); });
      const text = document.createElement('span');
      text.className = 'tk-text'; text.textContent = t.text;
      const del = document.createElement('span');
      del.className = 'tk-del'; del.textContent = '✕';
      del.addEventListener('click', () => { tasks = tasks.filter((x) => x.id !== t.id); persist(); render(); });
      row.append(check, text, del);
      listEl.appendChild(row);
    }
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'opacity:.5;font-size:12px;text-align:center;padding:20px';
      empty.textContent = 'brak zadań';
      listEl.appendChild(empty);
    }
  };

  const add = (): void => {
    const text = input.value.trim();
    if (!text) return;
    tasks.unshift({ id: Date.now(), text, done: false, created: new Date().toISOString() });
    input.value = '';
    persist(); render();
  };
  body.querySelector<HTMLButtonElement>('#tk-add')!.addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  body.querySelectorAll<HTMLSpanElement>('.tk-f').forEach((f) =>
    f.addEventListener('click', () => {
      filter = (f.dataset.f as typeof filter) ?? 'all';
      body.querySelectorAll('.tk-f').forEach((x) => x.classList.toggle('active', x === f));
      render();
    }));

  load();
  render();
  return body;
}
