import { dishes as dishesApi } from '../api';
import type { Dish } from '../types';
import { icon, PLUS, EDIT, UPLOAD } from '../icons';

const TAG_COLORS: Record<string, string> = {
  breakfast: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  lunch: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  dinner: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  snack: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  dessert: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  drink: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  takeout: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
};

const ALL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink', 'takeout'];

const IMPORT_SCHEMA = `[
  {
    // Regular dish with full details
    "name": "Oatmeal with Berries",          // string, required, must be unique
    "tags": ["breakfast", "snack"],           // array — allowed values: "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "drink"
    "takeout": false,                         // boolean — if true, ingredients/instructions are ignored
    "ingredients": [
      { "name": "rolled oats",  "quantity": 80,  "unit": "g"    },
      { "name": "milk",         "quantity": 200, "unit": "ml"   },
      { "name": "blueberries",  "quantity": 50,  "unit": "g"    },
      { "name": "honey",        "quantity": 1,   "unit": "tbsp" }
      // name: string  |  quantity: number  |  unit: any string (g, ml, tbsp, tsp, pcs, …)
    ],
    "instructions": "Bring milk to a boil, add oats and cook 5 min. Top with berries and honey.",
    "notes": "Can use water instead of milk."
  },
  {
    // Takeout dish — no ingredients or recipe needed
    "name": "Sushi Takeout",
    "tags": ["dinner"],
    "takeout": true,
    "ingredients": [],
    "instructions": "",
    "notes": "Order from the place on Main St."
  }
]`;

// Strip // comments for actual JSON parsing
function stripComments(s: string) {
  return s.replace(/\/\/[^\n]*/g, '');
}

export async function renderDishLibrary(container: HTMLElement) {
  let allDishes: Dish[] = [];
  let search = '';
  let tagFilter = '';
  let showImport = false;

  async function load() {
    try {
      allDishes = await dishesApi.list();
    } catch (err) {
      console.error('Failed to load dishes:', err);
      allDishes = [];
    }
    render();
  }

  function filtered() {
    return allDishes.filter(d => {
      const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
      const matchTag = !tagFilter
        || (tagFilter === 'takeout' ? d.takeout : d.tags.includes(tagFilter as any));
      return matchSearch && matchTag;
    });
  }

  function render() {
    const list = filtered();
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex gap-2">
          <input id="search" type="search" placeholder="Search dishes…" value="${search}"
            class="flex-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button id="import-btn"
            class="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            ${icon(UPLOAD)} Import
          </button>
          <a href="#editor"
            class="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-blue-700">
            ${icon(PLUS)} New
          </a>
        </div>

        <div class="flex gap-2 flex-wrap">
          <button class="tag-filter-btn text-xs px-2.5 py-1 rounded-full border ${!tagFilter ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}" data-tag="">
            All
          </button>
          ${ALL_TAGS.map(t => `
            <button class="tag-filter-btn text-xs px-2.5 py-1 rounded-full border ${tagFilter === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}" data-tag="${t}">
              ${t}
            </button>
          `).join('')}
        </div>

        ${showImport ? renderImportPanel() : ''}

        ${list.length === 0
          ? `<p class="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No dishes found</p>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              ${list.map(renderDishCard).join('')}
            </div>`
        }
      </div>
    `;

    container.querySelector<HTMLInputElement>('#search')!.addEventListener('input', (e) => {
      search = (e.target as HTMLInputElement).value;
      render();
    });

    container.querySelectorAll('.tag-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tagFilter = (btn as HTMLElement).dataset.tag!;
        render();
      });
    });

    container.querySelector('#import-btn')!.addEventListener('click', () => {
      showImport = !showImport;
      render();
    });

    if (showImport) attachImportHandlers();
  }

  function renderDishCard(d: Dish) {
    const badges = d.takeout
      ? `<span class="text-xs px-1.5 py-0.5 rounded ${TAG_COLORS.takeout}">takeout</span>`
      : d.tags.map(t => `<span class="text-xs px-1.5 py-0.5 rounded ${TAG_COLORS[t] ?? ''}">${t}</span>`).join('');

    return `
      <a href="#editor-${d.id}"
        class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all block">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium text-gray-900 dark:text-gray-100 text-sm">${d.name}</span>
          ${icon(EDIT, 'w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0')}
        </div>
        ${badges ? `<div class="flex gap-1 mt-2 flex-wrap">${badges}</div>` : ''}
        ${d.ingredients.length > 0 ? `<p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${d.ingredients.length} ingredient${d.ingredients.length !== 1 ? 's' : ''}</p>` : ''}
      </a>
    `;
  }

  function renderImportPanel() {
    return `
      <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-gray-900 dark:text-gray-100 text-sm">Import dishes from JSON</h3>
          <button id="copy-schema-btn" class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800">Copy schema</button>
        </div>
        <pre class="bg-gray-50 dark:bg-gray-800 rounded p-3 overflow-x-auto text-xs text-gray-600 dark:text-gray-400 leading-relaxed">${escapeHtml(IMPORT_SCHEMA)}</pre>
        <textarea id="import-json" rows="5" placeholder="Paste your JSON here… (// comments are stripped before parsing)"
          class="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        <div id="import-error" class="text-sm text-red-600 hidden"></div>
        <div id="import-success" class="text-sm text-green-600 hidden"></div>
        <div class="flex gap-2 justify-end">
          <button id="import-cancel" class="text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button id="import-submit" class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Import</button>
        </div>
      </div>
    `;
  }

  function attachImportHandlers() {
    container.querySelector('#copy-schema-btn')!.addEventListener('click', () => {
      navigator.clipboard.writeText(IMPORT_SCHEMA).catch(() => {});
    });

    container.querySelector('#import-cancel')!.addEventListener('click', () => {
      showImport = false;
      render();
    });

    container.querySelector('#import-submit')!.addEventListener('click', async () => {
      const errEl = container.querySelector<HTMLElement>('#import-error')!;
      const okEl = container.querySelector<HTMLElement>('#import-success')!;
      const raw = container.querySelector<HTMLTextAreaElement>('#import-json')!.value.trim();
      errEl.classList.add('hidden');
      okEl.classList.add('hidden');
      let parsed: unknown[];
      try {
        parsed = JSON.parse(stripComments(raw));
        if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
      } catch (e) {
        errEl.textContent = (e as Error).message;
        errEl.classList.remove('hidden');
        return;
      }
      try {
        const result = await dishesApi.import(parsed);
        okEl.textContent = `Imported ${result.imported} dish${result.imported !== 1 ? 'es' : ''}`;
        okEl.classList.remove('hidden');
        await load();
      } catch (e) {
        errEl.textContent = (e as Error).message;
        errEl.classList.remove('hidden');
      }
    });
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  container.innerHTML = `<div class="flex justify-center py-8"><div class="text-gray-400 dark:text-gray-500 text-sm">Loading…</div></div>`;
  await load();
}
