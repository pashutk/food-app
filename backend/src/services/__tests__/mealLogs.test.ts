import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../db';
import * as dishesService from '../dishes';
import * as mealLogsService from '../mealLogs';

describe('meal logs service', () => {
  beforeEach(() => {
    db.exec('DELETE FROM meal_logs');
    db.exec('DELETE FROM dishes');
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'meal_logs'");
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'dishes'");
  });

  it('creates a meal log for an existing dish', () => {
    const dish = dishesService.createDish({ name: 'Curry' });

    const result = mealLogsService.createMealLog({
      date: '2026-07-10',
      dishId: dish.id,
      slot: 'dinner',
    });

    expect(result).toMatchObject({
      ok: true,
      mealLog: {
        date: '2026-07-10',
        dishId: dish.id,
        slot: 'dinner',
      },
    });
  });

  it('lists logs by date', () => {
    const dish = dishesService.createDish({ name: 'Oatmeal' });
    mealLogsService.createMealLog({
      date: '2026-07-11',
      dishId: dish.id,
      slot: 'breakfast',
    });

    const result = mealLogsService.listMealLogsByDate('2026-07-11');

    expect(result).toEqual({
      ok: true,
      mealLogs: [
        expect.objectContaining({
          date: '2026-07-11',
          dishId: dish.id,
          slot: 'breakfast',
          dish: {
            id: dish.id,
            name: 'Oatmeal',
          },
        }),
      ],
    });
  });

  it('does not list logs from other dates', () => {
    const dish = dishesService.createDish({ name: 'Salad' });
    mealLogsService.createMealLog({
      date: '2026-07-12',
      dishId: dish.id,
      slot: 'lunch',
    });
    mealLogsService.createMealLog({
      date: '2026-07-13',
      dishId: dish.id,
      slot: 'dinner',
    });

    const result = mealLogsService.listMealLogsByDate('2026-07-12');

    expect(result).toEqual({
      ok: true,
      mealLogs: [
        expect.objectContaining({
          date: '2026-07-12',
          slot: 'lunch',
        }),
      ],
    });
  });

  it('deletes a meal log', () => {
    const dish = dishesService.createDish({ name: 'Toast' });
    const created = mealLogsService.createMealLog({
      date: '2026-07-14',
      dishId: dish.id,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    expect(mealLogsService.deleteMealLog(String(created.mealLog.id))).toEqual({ ok: true });
    expect(mealLogsService.listMealLogsByDate('2026-07-14')).toEqual({
      ok: true,
      mealLogs: [],
    });
  });

  it('returns not found when deleting a missing meal log', () => {
    expect(mealLogsService.deleteMealLog('999')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects malformed and impossible dates', () => {
    const dish = dishesService.createDish({ name: 'Invalid Date Dish' });

    expect(
      mealLogsService.createMealLog({
        date: '2026/07/15',
        dishId: dish.id,
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
    expect(
      mealLogsService.createMealLog({
        date: '2026-02-31',
        dishId: dish.id,
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
    expect(mealLogsService.listMealLogsByDate('2026-02-31')).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('rejects invalid dishId', () => {
    expect(
      mealLogsService.createMealLog({
        date: '2026-07-15',
        dishId: 99999,
        slot: 'dinner',
      }),
    ).toEqual({ ok: false, reason: 'invalid_dish' });
  });

  it('rejects invalid slot', () => {
    const dish = dishesService.createDish({ name: 'Soup' });

    expect(
      mealLogsService.createMealLog({
        date: '2026-07-16',
        dishId: dish.id,
        slot: 'brunch' as any,
      }),
    ).toEqual({ ok: false, reason: 'invalid_slot' });
  });

  it('prevents duplicate slotted logs', () => {
    const dish = dishesService.createDish({ name: 'Pasta' });

    const first = mealLogsService.createMealLog({
      date: '2026-07-17',
      dishId: dish.id,
      slot: 'dinner',
    });
    const second = mealLogsService.createMealLog({
      date: '2026-07-17',
      dishId: dish.id,
      slot: 'dinner',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('allows duplicate no-slot logs for the same dish and date', () => {
    const dish = dishesService.createDish({ name: 'Late Snack' });

    const first = mealLogsService.createMealLog({
      date: '2026-07-18',
      dishId: dish.id,
    });
    const second = mealLogsService.createMealLog({
      date: '2026-07-18',
      dishId: dish.id,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it('blocks deleting a dish with meal logs', () => {
    const dish = dishesService.createDish({ name: 'Protected Dish' });
    mealLogsService.createMealLog({
      date: '2026-07-19',
      dishId: dish.id,
      slot: 'dinner',
    });

    expect(dishesService.deleteDish(String(dish.id))).toEqual({ blocked: true });
  });
});
