import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DB_PATH || './data/food.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    takeout INTEGER NOT NULL DEFAULT 0,
    ingredients TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS menus (
    date TEXT PRIMARY KEY,
    entries TEXT NOT NULL DEFAULT '[]'
  );
`);

export default db;
