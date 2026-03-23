import { dishes as dishesApi } from '../api';
import type { Dish, MealTag, Ingredient } from '../types';
import { icon, PLUS, TRASH } from '../icons';

const ALL_TAGS: MealTag[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'];
const TAG_LABELS: Record<MealTag, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
  dessert: 'Dessert', drink: 'Drink',
};

type FormState = {
  name: string;
  tags: MealTag[];
  takeout: boolean;
  ingredients: Ingredient[];
  instructions: string;
  notes: string;
};

export async function renderDishEditor(
  container: HTMLElement,
  dishId: number | null,
  onDone: () => void,
) {
  let state: FormState = {
    name: '', tags: [], takeout: false, ingredients: [], instructions: '', notes: '',
  };
  let error = '';
  let saving = false;

  if (dishId !== null) {
    try {
      const all = await dishesApi.list();
      const dish = all.find(d => d.id === dishId);
      if (dish) {
        state = {
          name: dish.name,
          tags: [...dish.tags],
          takeout: dish.takeout,
          ingredients: dish.ingredients.map(i => ({ ...i })),
          instructions: dish.instructions,
          notes: dish.notes,
        };
      }
    } catch { /* ignore */ }
  }

  function render() {
    container.innerHTML = `
      <div class="space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">${dishId ? 'Edit Dish' : 'New Dish'}</h2>
          ${dishId ? `
            <button id="delete-btn" class="text-sm text-red-600 hover:text-red-700">Delete dish</button>
          ` : ''}
        </div>

        ${error ? `<div class="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">${error}</div>` : ''}

        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input id="name" type="text" value="${escapeAttr(state.name)}"
              class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Meal tags</label>
            <div class="flex gap-2 flex-wrap">
              ${ALL_TAGS.map(t => `
                <button type="button" data-tag="${t}" aria-pressed="${state.tags.includes(t)}"
                  class="tag-btn text-sm px-3 py-1 rounded-full border transition-colors ${state.tags.includes(t) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                  ${TAG_LABELS[t]}
                </button>
              `).join('')}
            </div>
          </div>

          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="takeout" type="checkbox" ${state.takeout ? 'checked' : ''}
                class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Takeout dish</span>
            </label>
            ${state.takeout ? `<p class="text-xs text-orange-600 dark:text-orange-400 mt-1">No ingredients or recipe for takeout dishes</p>` : ''}
          </div>
        </div>

        ${!state.takeout ? `
          <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Ingredients</h3>
            <div id="ingredients-list" class="space-y-2">
              ${state.ingredients.map((ing, i) => renderIngredientRow(ing, i)).join('')}
            </div>
            <button id="add-ingredient"
              class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
              ${icon(PLUS)} Add ingredient
            </button>
          </div>

          <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
            <label class="block text-sm font-medium text-gray-900 dark:text-gray-100">Instructions</label>
            <textarea id="instructions" rows="5"
              class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${escapeHtml(state.instructions)}</textarea>
          </div>
        ` : ''}

        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <label class="block text-sm font-medium text-gray-900 dark:text-gray-100">Notes</label>
          <textarea id="notes" rows="2"
            class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${escapeHtml(state.notes)}</textarea>
        </div>

        <div class="flex gap-3">
          <button id="save-btn" ${saving ? 'disabled' : ''}
            class="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            ${saving ? 'Saving…' : 'Save'}
          </button>
          <button id="cancel-btn"
            class="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
        </div>
      </div>
    `;

    attachHandlers();
  }

  function renderIngredientRow(ing: Ingredient, i: number) {
    return `
      <div class="flex gap-2 items-center" data-ing="${i}">
        <input type="text" placeholder="Ingredient" value="${escapeAttr(ing.name)}"
          data-field="name"
          class="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input type="number" placeholder="Qty" value="${ing.quantity || ''}"
          data-field="quantity" min="0" step="any"
          class="w-20 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input type="text" placeholder="Unit" value="${escapeAttr(ing.unit)}"
          data-field="unit"
          class="w-16 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button class="remove-ing text-gray-400 hover:text-red-500" data-ing="${i}">
          ${icon(TRASH)}
        </button>
      </div>
    `;
  }

  function readFormIntoState() {
    state.name = container.querySelector<HTMLInputElement>('#name')!.value.trim();
    state.takeout = container.querySelector<HTMLInputElement>('#takeout')!.checked;
    if (!state.takeout) {
      state.instructions = container.querySelector<HTMLTextAreaElement>('#instructions')?.value ?? '';
    }
    state.notes = container.querySelector<HTMLTextAreaElement>('#notes')!.value;

    // Read ingredients
    container.querySelectorAll('div[data-ing]').forEach(row => {
      const i = parseInt((row as HTMLElement).dataset.ing!);
      if (!state.ingredients[i]) return;
      state.ingredients[i].name = row.querySelector<HTMLInputElement>('[data-field="name"]')!.value.trim();
      state.ingredients[i].quantity = parseFloat(row.querySelector<HTMLInputElement>('[data-field="quantity"]')!.value) || 0;
      state.ingredients[i].unit = row.querySelector<HTMLInputElement>('[data-field="unit"]')!.value.trim();
    });
  }

  function attachHandlers() {
    container.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const t = (btn as HTMLElement).dataset.tag as MealTag;
        if (state.tags.includes(t)) state.tags = state.tags.filter(x => x !== t);
        else state.tags.push(t);
        render();
      });
    });

    container.querySelector('#takeout')!.addEventListener('change', () => {
      readFormIntoState();
      render();
    });

    container.querySelector('#add-ingredient')?.addEventListener('click', () => {
      readFormIntoState();
      state.ingredients.push({ name: '', quantity: 0, unit: '' });
      render();
    });

    container.querySelectorAll('.remove-ing').forEach(btn => {
      btn.addEventListener('click', () => {
        readFormIntoState();
        const i = parseInt((btn as HTMLElement).dataset.ing!);
        state.ingredients.splice(i, 1);
        render();
      });
    });

    container.querySelector('#save-btn')!.addEventListener('click', async () => {
      readFormIntoState();
      if (!state.name) { error = 'Name is required'; render(); return; }
      error = '';
      saving = true;
      render();
      try {
        const payload = {
          name: state.name,
          tags: state.tags,
          takeout: state.takeout,
          ingredients: state.takeout ? [] : state.ingredients.filter(i => i.name),
          instructions: state.takeout ? '' : state.instructions,
          notes: state.notes,
        };
        if (dishId) await dishesApi.update(dishId, payload);
        else await dishesApi.create(payload);
        onDone();
      } catch (e) {
        error = (e as Error).message;
        saving = false;
        render();
      }
    });

    container.querySelector('#cancel-btn')!.addEventListener('click', onDone);

    container.querySelector('#delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${state.name}"? This cannot be undone.`)) return;
      try {
        await dishesApi.delete(dishId!);
        onDone();
      } catch (e) {
        error = (e as Error).message;
        render();
      }
    });
  }

  function escapeAttr(s: string) {
    return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  container.innerHTML = `<div class="flex justify-center py-8"><div class="text-gray-400 dark:text-gray-500 text-sm">Loading…</div></div>`;
  render();
}
