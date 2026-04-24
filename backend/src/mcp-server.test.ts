import { describe, expect, it, beforeEach } from 'vitest';
import { aggregateShoppingList, type DailyMenu, type Dish, type ShoppingItem } from './mcp-server';

type MealTag = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'drink';

function makeDish(id: number, name: string, tags: MealTag[], takeout: boolean, ingredients: Array<{ name: string; quantity: number; unit: string }>): Dish {
  return { id, name, tags, takeout, ingredients, instructions: '', notes: '', created_at: '', updated_at: '' };
}

function makeMenu(date: string, entries: Array<{ slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'; dishId: number; servings: number }>): DailyMenu {
  return { date, entries };
}

describe('aggregateShoppingList', () => {
  it('returns empty array when menu has no entries', () => {
    const menu = makeMenu('2025-01-01', []);
    const dishMap = new Map<number, Dish>();
    expect(aggregateShoppingList(menu, dishMap)).toEqual([]);
  });

  it('excludes takeout dishes from shopping list', () => {
    const menu = makeMenu('2025-01-01', [{ slot: 'breakfast', dishId: 1, servings: 1 }]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Pizza', ['dinner'], true, [{ name: 'cheese', quantity: 200, unit: 'g' }])],
    ]);
    expect(aggregateShoppingList(menu, dishMap)).toEqual([]);
  });

  it('excludes dishes not found in dishMap', () => {
    const menu = makeMenu('2025-01-01', [{ slot: 'breakfast', dishId: 999, servings: 1 }]);
    const dishMap = new Map<number, Dish>();
    expect(aggregateShoppingList(menu, dishMap)).toEqual([]);
  });

  it('scales ingredient quantities by servings', () => {
    const menu = makeMenu('2025-01-01', [{ slot: 'breakfast', dishId: 1, servings: 3 }]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Oatmeal', ['breakfast'], false, [{ name: 'Oats', quantity: 100, unit: 'g' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toEqual([{ name: 'Oats', quantity: 300, unit: 'g' }]);
  });

  it('merges ingredients with same name and unit (case-insensitive)', () => {
    const menu = makeMenu('2025-01-01', [
      { slot: 'breakfast', dishId: 1, servings: 2 },
      { slot: 'lunch', dishId: 2, servings: 1 },
    ]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Oatmeal', ['breakfast'], false, [{ name: 'Oats', quantity: 100, unit: 'g' }])],
      [2, makeDish(2, 'Smoothie', ['breakfast'], false, [{ name: 'oats', quantity: 50, unit: 'G' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(250); // 200 + 50
  });

  it('does not merge ingredients with different units', () => {
    const menu = makeMenu('2025-01-01', [
      { slot: 'breakfast', dishId: 1, servings: 1 },
      { slot: 'lunch', dishId: 2, servings: 1 },
    ]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Porridge', ['breakfast'], false, [{ name: 'Milk', quantity: 200, unit: 'ml' }])],
      [2, makeDish(2, 'Cereal', ['breakfast'], false, [{ name: 'Milk', quantity: 1, unit: 'cup' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toHaveLength(2);
  });

  it('returns sorted alphabetically by ingredient name', () => {
    const menu = makeMenu('2025-01-01', [
      { slot: 'breakfast', dishId: 1, servings: 1 },
      { slot: 'lunch', dishId: 2, servings: 1 },
    ]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Dish A', ['lunch'], false, [{ name: 'Zucchini', quantity: 100, unit: 'g' }])],
      [2, makeDish(2, 'Dish B', ['dinner'], false, [{ name: 'Apple', quantity: 1, unit: 'pcs' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result[0].name).toBe('Apple');
    expect(result[1].name).toBe('Zucchini');
  });

  it('handles multiple ingredients from multiple dishes', () => {
    const menu = makeMenu('2025-01-01', [
      { slot: 'breakfast', dishId: 1, servings: 1 },
      { slot: 'lunch', dishId: 2, servings: 2 },
    ]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Eggs', ['breakfast'], false, [
        { name: 'Eggs', quantity: 2, unit: 'pcs' },
        { name: 'Butter', quantity: 10, unit: 'g' },
      ])],
      [2, makeDish(2, 'Pasta', ['lunch'], false, [
        { name: 'Pasta', quantity: 200, unit: 'g' },
        { name: 'Eggs', quantity: 1, unit: 'pcs' },
      ])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toHaveLength(3);
    const eggs = result.find(r => r.name === 'Eggs');
    expect(eggs?.quantity).toBe(4); // 2*1 + 1*2
    const butter = result.find(r => r.name === 'Butter');
    expect(butter?.quantity).toBe(10);
    const pasta = result.find(r => r.name === 'Pasta');
    expect(pasta?.quantity).toBe(400); // 200 * 2
  });

  it('rounds merged quantities to 3 decimal places', () => {
    const menu = makeMenu('2025-01-01', [
      { slot: 'breakfast', dishId: 1, servings: 1 },
      { slot: 'lunch', dishId: 2, servings: 1 },
    ]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Dish A', ['breakfast'], false, [{ name: 'Rice', quantity: 33.33, unit: 'g' }])],
      [2, makeDish(2, 'Dish B', ['lunch'], false, [{ name: 'rice', quantity: 33.33, unit: 'g' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(66.66);
  });

  it('handles multiple servings correctly', () => {
    const menu = makeMenu('2025-01-01', [{ slot: 'dinner', dishId: 1, servings: 4 }]);
    const dishMap = new Map<number, Dish>([
      [1, makeDish(1, 'Soup', ['dinner'], false, [{ name: 'Carrots', quantity: 150, unit: 'g' }])],
    ]);
    const result = aggregateShoppingList(menu, dishMap);
    expect(result).toEqual([{ name: 'Carrots', quantity: 600, unit: 'g' }]);
  });
});
