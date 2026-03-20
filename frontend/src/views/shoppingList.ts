import { dishes as dishesApi, menus } from '../api';
import type { Dish } from '../types';
import { icon, CHEVRON_LEFT, CHEVRON_RIGHT, COPY, PRINTER } from '../icons';

function today() { return new Date().toISOString().slice(0, 10); }

function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

type ShoppingItem = { name: string; quantity: number; unit: string };

export async function renderShoppingList(container: HTMLElement) {
  let date = today();
  let items: ShoppingItem[] = [];

  async function load() {
    const [menu, allDishes] = await Promise.all([menus.get(date), dishesApi.list()]);
    const dishMap = new Map<number, Dish>(allDishes.map(d => [d.id, d]));
    const aggregated = new Map<string, ShoppingItem>();

    for (const entry of menu.entries) {
      const dish = dishMap.get(entry.dishId);
      if (!dish || dish.takeout) continue;
      for (const ing of dish.ingredients) {
        const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity = Math.round((existing.quantity + ing.quantity * entry.servings) * 1000) / 1000;
        } else {
          aggregated.set(key, { name: ing.name, quantity: ing.quantity * entry.servings, unit: ing.unit });
        }
      }
    }

    items = Array.from(aggregated.values()).sort((a, b) => a.name.localeCompare(b.name));
    render();
  }

  function render() {
    const listText = items.map(i => `${i.name}: ${i.quantity} ${i.unit}`).join('\n');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <button id="prev-day" class="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100">
            ${icon(CHEVRON_LEFT)}
          </button>
          <input type="date" id="date-input" value="${date}"
            class="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button id="next-day" class="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100">
            ${icon(CHEVRON_RIGHT)}
          </button>
        </div>
        <p class="text-sm text-gray-500 text-center -mt-2">${formatDate(date)}</p>

        ${items.length === 0
          ? `<div class="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
              No ingredients — menu is empty or all dishes are takeout
            </div>`
          : `
            <div class="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              ${items.map(i => `
                <div class="flex items-center px-4 py-3 gap-3">
                  <span class="flex-1 text-sm text-gray-900">${i.name}</span>
                  <span class="text-sm text-gray-500">${i.quantity}</span>
                  <span class="text-sm text-gray-400 w-12 text-right">${i.unit}</span>
                </div>
              `).join('')}
            </div>

            <div class="flex gap-2 justify-end">
              <button id="copy-btn"
                class="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                ${icon(COPY)} Copy
              </button>
              <button id="print-btn"
                class="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                ${icon(PRINTER)} Print
              </button>
            </div>
          `
        }
      </div>
    `;

    container.querySelector('#prev-day')!.addEventListener('click', () => {
      date = addDays(date, -1); load();
    });
    container.querySelector('#next-day')!.addEventListener('click', () => {
      date = addDays(date, 1); load();
    });
    container.querySelector<HTMLInputElement>('#date-input')!.addEventListener('change', (e) => {
      date = (e.target as HTMLInputElement).value; load();
    });

    container.querySelector('#copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(listText).catch(() => {});
    });

    container.querySelector('#print-btn')?.addEventListener('click', () => {
      const w = window.open('', '_blank')!;
      w.document.write(`
        <html><head><title>Shopping List — ${date}</title>
        <style>body{font-family:sans-serif;padding:2rem}h1{font-size:1.2rem;margin-bottom:1rem}
        ul{list-style:none;padding:0}li{padding:.3rem 0;border-bottom:1px solid #eee;display:flex;gap:1rem}
        .qty{color:#666}</style></head>
        <body><h1>Shopping List — ${formatDate(date)}</h1>
        <ul>${items.map(i => `<li><span>${i.name}</span><span class="qty">${i.quantity} ${i.unit}</span></li>`).join('')}</ul>
        </body></html>
      `);
      w.document.close();
      w.print();
    });
  }

  container.innerHTML = `<div class="flex justify-center py-8"><div class="text-gray-400 text-sm">Loading…</div></div>`;
  await load();
}
