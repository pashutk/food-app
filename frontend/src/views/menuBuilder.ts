import { dishes as dishesApi, mealLogs as mealLogsApi, menus } from '../api';
import type { Dish, DailyMenu, MealLogWithDish, MealSlot } from '../types';
import { icon, CHEVRON_LEFT, CHEVRON_RIGHT, PLUS, TRASH } from '../icons';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};
const TAG_COLORS: Record<string, string> = {
  breakfast: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  lunch: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  dinner: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  snack: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  dessert: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  drink: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  takeout: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
};

function today() { return new Date().toISOString().slice(0, 10); }

function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export async function renderMenuBuilder(container: HTMLElement) {
  let date = today();
  let menu: DailyMenu = { date, entries: [] };
  let allDishes: Dish[] = [];
  let mealLogs: MealLogWithDish[] = [];
  let selectedMealLogDishId = '';
  let selectedMealLogSlot = '';
  let mealLogError = '';
  let mealLogSaving = false;
  let loadRequestId = 0;

  async function load() {
    const requestedDate = date;
    const requestId = ++loadRequestId;
    const [nextMenu, nextDishes, nextMealLogs] = await Promise.all([
      menus.get(requestedDate),
      dishesApi.list(),
      mealLogsApi.list(requestedDate),
    ]);

    if (requestId !== loadRequestId || requestedDate !== date) {
      return;
    }

    menu = nextMenu;
    allDishes = nextDishes;
    mealLogs = nextMealLogs;
    render();
  }

  async function save() {
    menu = await menus.save(date, menu.entries);
  }

  function render() {
    const dishMap = new Map(allDishes.map(d => [d.id, d]));

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <button id="prev-day" class="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-300">
            ${icon(CHEVRON_LEFT)}
          </button>
          <input type="date" id="date-input" value="${date}"
            class="flex-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button id="next-day" class="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-300">
            ${icon(CHEVRON_RIGHT)}
          </button>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center -mt-2">${formatDate(date)}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${SLOTS.map(slot => renderSlot(slot, dishMap)).join('')}
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <div>
            <h3 class="font-medium text-gray-900 dark:text-gray-100">Log dish</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Record what actually happened on ${formatDate(date)}.</p>
          </div>

          ${mealLogError
            ? `<div class="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">${escapeHtml(mealLogError)}</div>`
            : ''}

          <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_12rem_auto] gap-2">
            <select id="meal-log-dish"
              class="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Choose a dish…</option>
              ${allDishes.map(d => `
                <option value="${d.id}" ${selectedMealLogDishId === String(d.id) ? 'selected' : ''}>${escapeHtml(d.name)}</option>
              `).join('')}
            </select>

            <select id="meal-log-slot"
              class="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">No slot</option>
              ${SLOTS.map(slot => `
                <option value="${slot}" ${selectedMealLogSlot === slot ? 'selected' : ''}>${SLOT_LABELS[slot]}</option>
              `).join('')}
            </select>

            <button id="meal-log-save" ${mealLogSaving || allDishes.length === 0 ? 'disabled' : ''}
              class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              ${mealLogSaving ? 'Saving…' : 'Log dish'}
            </button>
          </div>

          ${allDishes.length === 0
            ? '<p class="text-xs text-gray-400 dark:text-gray-500">Create a dish in the library before logging meals.</p>'
            : ''}
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="font-medium text-gray-900 dark:text-gray-100">Logged meals</h3>
            <span class="text-xs text-gray-400 dark:text-gray-500">${mealLogs.length} log${mealLogs.length === 1 ? '' : 's'}</span>
          </div>

          ${mealLogs.length === 0
            ? '<p class="text-sm text-gray-400 dark:text-gray-500">No meals logged for this date yet.</p>'
            : `
              <div class="space-y-2">
                ${mealLogs.map(renderMealLogRow).join('')}
              </div>
            `}
        </div>
      </div>
    `;

    container.querySelector('#prev-day')!.addEventListener('click', () => {
      date = addDays(date, -1);
      load();
    });
    container.querySelector('#next-day')!.addEventListener('click', () => {
      date = addDays(date, 1);
      load();
    });
    container.querySelector<HTMLInputElement>('#date-input')!.addEventListener('change', (e) => {
      date = (e.target as HTMLInputElement).value;
      load();
    });

    container.querySelector<HTMLSelectElement>('#meal-log-dish')?.addEventListener('change', (e) => {
      selectedMealLogDishId = (e.target as HTMLSelectElement).value;
    });

    container.querySelector<HTMLSelectElement>('#meal-log-slot')?.addEventListener('change', (e) => {
      selectedMealLogSlot = (e.target as HTMLSelectElement).value;
    });

    container.querySelector('#meal-log-save')?.addEventListener('click', async () => {
      if (!selectedMealLogDishId) {
        mealLogError = 'Choose a dish to log.';
        render();
        return;
      }

      mealLogError = '';
      mealLogSaving = true;
      render();

      try {
        await mealLogsApi.create({
          date,
          dishId: parseInt(selectedMealLogDishId, 10),
          ...(selectedMealLogSlot ? { slot: selectedMealLogSlot as MealSlot } : {}),
        });
        selectedMealLogDishId = '';
        selectedMealLogSlot = '';
        mealLogSaving = false;
        await load();
      } catch (error) {
        mealLogError = (error as Error).message;
        mealLogSaving = false;
        render();
      }
    });

    container.querySelectorAll('.meal-log-remove-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        mealLogError = '';
        render();

        try {
          await mealLogsApi.remove(parseInt((button as HTMLElement).dataset.id!, 10));
          await load();
        } catch (error) {
          mealLogError = (error as Error).message;
          render();
        }
      });
    });

    SLOTS.forEach(slot => {
      container.querySelector(`[data-slot="${slot}"] .add-dish-select`)
        ?.addEventListener('change', async (e) => {
          const dishId = parseInt((e.target as HTMLSelectElement).value);
          if (!dishId) return;
          (e.target as HTMLSelectElement).value = '';
          menu.entries.push({ slot, dishId, servings: 1 });
          await save();
          render();
        });

      container.querySelectorAll(`[data-slot="${slot}"] .remove-btn`).forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt((btn as HTMLElement).dataset.idx!);
          menu.entries.splice(idx, 1);
          await save();
          render();
        });
      });
    });
  }

  function renderSlot(slot: MealSlot, dishMap: Map<number, Dish>) {
    const entries = menu.entries
      .map((e, i) => ({ ...e, _idx: i }))
      .filter(e => e.slot === slot);

    const dishesInSlot = new Set(entries.map(e => e.dishId));
    const available = allDishes.filter(d => !dishesInSlot.has(d.id));

    return `
      <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4" data-slot="${slot}">
        <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-3">${SLOT_LABELS[slot]}</h3>
        <div class="space-y-2 mb-3">
          ${entries.map(e => {
            const dish = dishMap.get(e.dishId);
            if (!dish) return '';
            const tagBadges = dish.takeout
              ? `<span class="text-xs px-1.5 py-0.5 rounded ${TAG_COLORS.takeout}">takeout</span>`
              : dish.tags.map(t => `<span class="text-xs px-1.5 py-0.5 rounded ${TAG_COLORS[t] ?? ''}">${t}</span>`).join('');
            return `
              <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <span class="text-sm text-gray-900 dark:text-gray-100">${dish.name}</span>
                  <div class="flex gap-1 mt-0.5 flex-wrap">${tagBadges}</div>
                </div>
                <button class="remove-btn text-gray-400 hover:text-red-500 shrink-0" data-idx="${e._idx}">
                  ${icon(TRASH)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
        ${available.length > 0 ? `
          <select class="add-dish-select w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 rounded-lg px-2 py-1.5 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">+ Add dish…</option>
            ${available.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
          </select>
        ` : `<p class="text-xs text-gray-400 dark:text-gray-500">All dishes added</p>`}
      </div>
    `;
  }

  function renderMealLogRow(log: MealLogWithDish) {
    return `
      <div class="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2" data-meal-log-row="${log.id}">
        <div class="flex-1 min-w-0">
          <div class="text-sm text-gray-900 dark:text-gray-100">${escapeHtml(log.dish.name)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            ${log.slot ? SLOT_LABELS[log.slot] : 'No slot'}
          </div>
        </div>
        <button class="meal-log-remove-btn text-gray-400 hover:text-red-500 shrink-0" data-id="${log.id}" aria-label="Delete meal log">
          ${icon(TRASH)}
        </button>
      </div>
    `;
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  container.innerHTML = `<div class="flex justify-center py-8"><div class="text-gray-400 dark:text-gray-500 text-sm">Loading…</div></div>`;
  await load();
}
