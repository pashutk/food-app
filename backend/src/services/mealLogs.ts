import db from '../db';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface MealLogRow {
  id: number;
  date: string;
  dish_id: number;
  slot: MealSlot | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedMealLog {
  id: number;
  date: string;
  dishId: number;
  slot: MealSlot | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedMealLogWithDish extends ParsedMealLog {
  dish: {
    id: number;
    name: string;
  };
}

export interface CreateMealLogInput {
  date: string;
  dishId: number;
  slot?: MealSlot | null;
}

export type CreateMealLogResult =
  | { ok: true; mealLog: ParsedMealLog }
  | { ok: false; reason: 'invalid_date' | 'invalid_dish' | 'invalid_slot' | 'duplicate' };

export type ListMealLogsResult =
  | { ok: true; mealLogs: ParsedMealLogWithDish[] }
  | { ok: false; reason: 'invalid_date' };

export type DeleteMealLogResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' };

interface MealLogWithDishRow extends MealLogRow {
  dish_name: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

export function isMealSlot(value: string): value is MealSlot {
  return MEAL_SLOTS.includes(value as MealSlot);
}

function parse(row: MealLogRow): ParsedMealLog {
  return {
    id: row.id,
    date: row.date,
    dishId: row.dish_id,
    slot: row.slot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseWithDish(row: MealLogWithDishRow): ParsedMealLogWithDish {
  return {
    ...parse(row),
    dish: {
      id: row.dish_id,
      name: row.dish_name,
    },
  };
}

export function createMealLog(input: CreateMealLogInput): CreateMealLogResult {
  const slot = input.slot ?? null;

  if (!isValidDate(input.date)) {
    return { ok: false, reason: 'invalid_date' };
  }

  if (slot !== null && !isMealSlot(slot)) {
    return { ok: false, reason: 'invalid_slot' };
  }

  const dish = db.prepare('SELECT id FROM dishes WHERE id = ?').get(input.dishId) as
    | { id: number }
    | undefined;
  if (!dish) {
    return { ok: false, reason: 'invalid_dish' };
  }

  if (slot !== null) {
    const duplicate = db
      .prepare('SELECT id FROM meal_logs WHERE date = ? AND slot = ? AND dish_id = ?')
      .get(input.date, slot, input.dishId) as { id: number } | undefined;
    if (duplicate) {
      return { ok: false, reason: 'duplicate' };
    }
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO meal_logs (date, dish_id, slot)
         VALUES (?, ?, ?)`,
      )
      .run(input.date, input.dishId, slot);
    const row = db
      .prepare('SELECT * FROM meal_logs WHERE id = ?')
      .get(result.lastInsertRowid) as MealLogRow;

    return { ok: true, mealLog: parse(row) };
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      return { ok: false, reason: 'duplicate' };
    }

    throw error;
  }
}

export function listMealLogsByDate(date: string): ListMealLogsResult {
  if (!isValidDate(date)) {
    return { ok: false, reason: 'invalid_date' };
  }

  const rows = db
    .prepare(
      `SELECT meal_logs.*, dishes.name AS dish_name
       FROM meal_logs
       INNER JOIN dishes ON dishes.id = meal_logs.dish_id
       WHERE meal_logs.date = ?
       ORDER BY
         CASE meal_logs.slot
           WHEN 'breakfast' THEN 0
           WHEN 'lunch' THEN 1
           WHEN 'dinner' THEN 2
           WHEN 'snack' THEN 3
           ELSE 4
         END,
         meal_logs.created_at,
         meal_logs.id`,
    )
    .all(date) as MealLogWithDishRow[];

  return { ok: true, mealLogs: rows.map(parseWithDish) };
}

export function deleteMealLog(id: string): DeleteMealLogResult {
  const info = db.prepare('DELETE FROM meal_logs WHERE id = ?').run(id);
  if (info.changes === 0) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true };
}
