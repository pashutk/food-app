import db from '../db';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Dish {
  id: number;
  name: string;
  tags: string[];
  takeout: boolean;
  ingredients: Ingredient[];
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DishData {
  name: string;
  tags?: string[];
  takeout?: boolean;
  ingredients?: Ingredient[];
  instructions?: string;
  notes?: string;
}

interface DishRow {
  id: number;
  name: string;
  tags: string;
  takeout: number;
  ingredients: string;
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

function parse(row: DishRow): Dish {
  return {
    ...row,
    takeout: row.takeout === 1,
    tags: JSON.parse(row.tags),
    ingredients: JSON.parse(row.ingredients),
  };
}

export function listDishes(): Dish[] {
  const rows = db.prepare('SELECT * FROM dishes ORDER BY name COLLATE NOCASE').all() as DishRow[];
  return rows.map(parse);
}

export function createDish(input: DishData): Dish {
  if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
    throw new Error('Dish name is required');
  }
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const result = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name.trim(), JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '');
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as DishRow;
  return parse(row);
}

export function updateDish(id: number, input: DishData): Dish | null {
  if (isNaN(id) || id <= 0) return null;
  if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
    throw new Error('Dish name is required');
  }
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const info = db.prepare(
    `UPDATE dishes SET name=?, tags=?, takeout=?, ingredients=?, instructions=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(name.trim(), JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '', id);
  if (info.changes === 0) return null;
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(id) as DishRow;
  return parse(row);
}

export function deleteDish(id: number): { success: boolean } {
  if (isNaN(id) || id <= 0) return { success: false };
  db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
  return { success: true };
}

export type ImportResult =
  | { ok: true; imported: number }
  | { ok: false; error: string; duplicates: string[] };

export function importDishes(items: unknown): ImportResult {
  if (!Array.isArray(items)) {
    return { ok: false, error: 'Expected an array', duplicates: [] };
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each item must be an object', duplicates: [] };
    }
    if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
      return { ok: false, error: 'Each dish must have a non-empty name', duplicates: [] };
    }
  }
  const existingNames = (db.prepare('SELECT name FROM dishes').all() as { name: string }[])
    .map(r => r.name.toLowerCase());

  const duplicates = items
    .filter((i: { name: string }) => existingNames.includes(i.name.toLowerCase()))
    .map((i: { name: string }) => i.name);

  if (duplicates.length > 0) {
    return { ok: false, error: 'Duplicate dishes found', duplicates };
  }

  const insert = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const importAll = db.transaction((rows: DishData[]) => {
    for (const r of rows) {
      insert.run(r.name.trim(), JSON.stringify(r.tags ?? []), r.takeout ? 1 : 0, JSON.stringify(r.ingredients ?? []), r.instructions ?? '', r.notes ?? '');
    }
  });
  importAll(items as DishData[]);
  return { ok: true, imported: items.length };
}
