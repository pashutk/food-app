import db from '../db';

/**
 * Menus service — domain boundary for menu reads/writes.
 * Owns: loading menus by date, upserting menus.
 * No HTTP or MCP shaping — pure domain logic.
 */

export interface MenuEntry {
  [key: string]: unknown;
}

export interface Menu {
  date: string;
  entries: MenuEntry[];
}

/**
 * Get a menu by date. Returns { date, entries: [] } if not found.
 */
export function getMenu(date: string): Menu {
  const row = db
    .prepare('SELECT * FROM menus WHERE date = ?')
    .get(date) as { date: string; entries: string } | undefined;
  return { date, entries: row ? JSON.parse(row.entries) : [] };
}

/**
 * Upsert a menu by date. Returns the persisted menu.
 */
export function upsertMenu(date: string, entries: MenuEntry[]): Menu {
  db.prepare(
    `INSERT INTO menus (date, entries) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET entries = excluded.entries`,
  ).run(date, JSON.stringify(entries));
  return { date, entries };
}
