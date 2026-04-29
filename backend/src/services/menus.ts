import db from '../db';

// Test injection: call setTestDb(db) before using getMenu/setMenu in tests
// to have the service use a controlled in-memory database instead of the real DB.
let _testDb: typeof db | undefined;
export function setTestDb(testDb: typeof db): void {
  _testDb = testDb;
}
const $$db = (): typeof db => _testDb ?? db;

export interface MenuResult {
  date: string;
  entries: unknown[];
}

export function getMenu(date: string): MenuResult {
  const row = $$db().prepare('SELECT * FROM menus WHERE date = ?').get(date) as { date: string; entries: string } | undefined;
  return { date, entries: row ? JSON.parse(row.entries) : [] };
}

export function setMenu(date: string, entries: unknown[]): MenuResult {
  $$db().prepare(
    `INSERT INTO menus (date, entries) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET entries = excluded.entries`
  ).run(date, JSON.stringify(entries));
  return { date, entries };
}