import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../db';
import * as dishesService from '../dishes';
import * as mealLogsService from '../mealLogs';
import { recommendDishes } from '../recommendations';

describe('dish recommendations service', () => {
  beforeEach(() => {
    db.exec('DELETE FROM meal_logs');
    db.exec('DELETE FROM dishes');
    db.exec('DELETE FROM menus');
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'meal_logs'");
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'dishes'");
  });

  it('returns only dishes tagged with the requested kind', () => {
    const breakfast = dishesService.createDish({
      name: 'Oatmeal',
      tags: ['breakfast'],
    });
    dishesService.createDish({ name: 'Soup', tags: ['lunch'] });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'breakfast', count: 2 }],
    });

    expect(result).toEqual({
      date: '2026-07-20',
      recommendations: [
        {
          kind: 'breakfast',
          requested: 2,
          dishes: [breakfast],
        },
      ],
    });
  });

  it('supports several groups in request order without repeating a dish', () => {
    dishesService.createDish({ name: 'Toast', tags: ['breakfast'] });
    dishesService.createDish({ name: 'Yogurt', tags: ['breakfast'] });
    dishesService.createDish({ name: 'Brunch plate', tags: ['breakfast', 'lunch'] });
    dishesService.createDish({ name: 'Salad', tags: ['lunch'] });
    dishesService.createDish({ name: 'Curry', tags: ['dinner'] });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [
        { kind: 'lunch', count: 2 },
        { kind: 'breakfast', count: 2 },
        { kind: 'dinner', count: 1 },
      ],
    });

    expect(result.recommendations.map(({ kind }) => kind)).toEqual([
      'lunch',
      'breakfast',
      'dinner',
    ]);
    expect(result.recommendations.map(({ dishes }) => dishes.length)).toEqual([2, 2, 1]);

    const returned = result.recommendations.flatMap(({ dishes }) => dishes);
    expect(new Set(returned.map(({ id }) => id)).size).toBe(returned.length);
    for (const group of result.recommendations) {
      expect(group.dishes.every(({ tags }) => tags.includes(group.kind))).toBe(true);
    }
  });

  it.each([
    ['target date', '2026-07-20'],
    ['one day before', '2026-07-19'],
    ['two days before', '2026-07-18'],
  ])('excludes a dish logged on the %s', (_label, loggedDate) => {
    const logged = dishesService.createDish({ name: `Logged ${loggedDate}`, tags: ['dinner'] });
    const eligible = dishesService.createDish({ name: 'Eligible', tags: ['dinner'] });
    mealLogsService.createMealLog({
      date: loggedDate,
      dishId: logged.id,
      slot: 'breakfast',
    });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'dinner', count: 2 }],
    });

    expect(result.recommendations[0].dishes.map(({ id }) => id)).toEqual([eligible.id]);
  });

  it('allows a dish logged three days before the target date', () => {
    const dish = dishesService.createDish({ name: 'Ready again', tags: ['snack'] });
    mealLogsService.createMealLog({
      date: '2026-07-17',
      dishId: dish.id,
      slot: 'dinner',
    });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'snack', count: 1 }],
    });

    expect(result.recommendations[0].dishes).toEqual([dish]);
  });

  it('ignores logs after the target date', () => {
    const dish = dishesService.createDish({ name: 'Future log', tags: ['lunch'] });
    mealLogsService.createMealLog({
      date: '2026-07-21',
      dishId: dish.id,
      slot: 'lunch',
    });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'lunch', count: 1 }],
    });

    expect(result.recommendations[0].dishes).toEqual([dish]);
  });

  it('applies cooldown regardless of the logged slot or a null slot', () => {
    const otherSlot = dishesService.createDish({
      name: 'Logged at dinner',
      tags: ['breakfast'],
    });
    const noSlot = dishesService.createDish({
      name: 'Logged without slot',
      tags: ['breakfast'],
    });
    const eligible = dishesService.createDish({ name: 'Eligible breakfast', tags: ['breakfast'] });
    mealLogsService.createMealLog({
      date: '2026-07-20',
      dishId: otherSlot.id,
      slot: 'dinner',
    });
    mealLogsService.createMealLog({
      date: '2026-07-19',
      dishId: noSlot.id,
    });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'breakfast', count: 3 }],
    });

    expect(result.recommendations[0].dishes).toEqual([eligible]);
  });

  it('maximally fills overlapping multi-tag requests', () => {
    const breakfastOnly = dishesService.createDish({
      name: 'Breakfast only',
      tags: ['breakfast'],
    });
    const flexible = dishesService.createDish({
      name: 'Flexible',
      tags: ['breakfast', 'lunch'],
    });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [
        { kind: 'breakfast', count: 1 },
        { kind: 'lunch', count: 1 },
      ],
    });

    expect(result.recommendations[0].dishes).toEqual([breakfastOnly]);
    expect(result.recommendations[1].dishes).toEqual([flexible]);
  });

  it('returns partial and empty groups when eligible supply is insufficient', () => {
    const breakfast = dishesService.createDish({ name: 'One breakfast', tags: ['breakfast'] });

    const result = recommendDishes({
      date: '2026-07-20',
      requests: [
        { kind: 'breakfast', count: 3 },
        { kind: 'dinner', count: 1 },
      ],
    });

    expect(result.recommendations).toEqual([
      { kind: 'breakfast', requested: 3, dishes: [breakfast] },
      { kind: 'dinner', requested: 1, dishes: [] },
    ]);
  });

  it('does not create menu or meal-log records', () => {
    dishesService.createDish({ name: 'No side effects', tags: ['dinner'] });

    recommendDishes({
      date: '2026-07-20',
      requests: [{ kind: 'dinner', count: 1 }],
    });

    expect(db.prepare('SELECT COUNT(*) AS count FROM meal_logs').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM menus').get()).toEqual({ count: 0 });
  });
});
