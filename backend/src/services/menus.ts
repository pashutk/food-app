import db from '../db';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MenuEntry {
  slot: MealSlot;
  dishId: number;
  servings: number;
}

export interface DailyMenu {
  date: string;
  entries: MenuEntry[];
}

export function getMenu(date: string): DailyMenu {
  const row = db.prepare('SELECT * FROM menus WHERE date = ?').get(date) as { date: string; entries: string } | undefined;
  return { date, entries: row ? JSON.parse(row.entries) : [] };
}

export function setMenu(date: string, entries: MenuEntry[]): DailyMenu {
  db.prepare(
    `INSERT INTO menus (date, entries) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET entries = excluded.entries`
  ).run(date, JSON.stringify(entries));
  return { date, entries };
}