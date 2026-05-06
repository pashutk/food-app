import db from '../db';

/**
 * Dishes service — domain boundary for dish reads/writes.
 * Owns: row parsing, list/create/update/delete/import, duplicate detection.
 * No HTTP or MCP shaping — pure domain logic.
 */

export interface DishRow {
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

export interface ParsedDish {
  id: number;
  name: string;
  tags: string[];
  takeout: boolean;
  ingredients: unknown[];
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export function parse(row: DishRow): ParsedDish {
  return {
    ...row,
    takeout: row.takeout === 1,
    tags: JSON.parse(row.tags),
    ingredients: JSON.parse(row.ingredients),
  };
}

export interface CreateDishInput {
  name: string;
  tags?: string[];
  takeout?: boolean;
  ingredients?: unknown[];
  instructions?: string;
  notes?: string;
}

export interface UpdateDishInput {
  name: string;
  tags?: string[];
  takeout?: boolean;
  ingredients?: unknown[];
  instructions?: string;
  notes?: string;
}

export interface ImportDishInput {
  name: string;
  tags?: string[];
  takeout?: boolean;
  ingredients?: unknown[];
  instructions?: string;
  notes?: string;
}

/**
 * List all dishes ordered by name (case-insensitive).
 */
export function listDishes(): ParsedDish[] {
  const rows = db
    .prepare('SELECT * FROM dishes ORDER BY name COLLATE NOCASE')
    .all() as DishRow[];
  return rows.map(parse);
}

/**
 * Create a new dish. Returns the parsed dish.
 */
export function createDish(input: CreateDishInput): ParsedDish {
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const result = db
    .prepare(
      `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      JSON.stringify(tags ?? []),
      takeout ? 1 : 0,
      JSON.stringify(ingredients ?? []),
      instructions ?? '',
      notes ?? '',
    );
  const row = db
    .prepare('SELECT * FROM dishes WHERE id = ?')
    .get(result.lastInsertRowid) as DishRow;
  return parse(row);
}

/**
 * Update a dish by id.
 * Returns { found: true, dish } if updated, or { found: false } if not found.
 */
export function updateDish(
  id: string,
  input: UpdateDishInput,
): { found: true; dish: ParsedDish } | { found: false } {
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const info = db
    .prepare(
      `UPDATE dishes SET name=?, tags=?, takeout=?, ingredients=?, instructions=?, notes=?, updated_at=datetime('now')
       WHERE id=?`,
    )
    .run(
      name,
      JSON.stringify(tags ?? []),
      takeout ? 1 : 0,
      JSON.stringify(ingredients ?? []),
      instructions ?? '',
      notes ?? '',
      id,
    );
  if (info.changes === 0) {
    return { found: false };
  }
  const row = db
    .prepare('SELECT * FROM dishes WHERE id = ?')
    .get(id) as DishRow;
  return { found: true, dish: parse(row) };
}

/**
 * Delete a dish by id. Returns { found: true } if deleted, or { found: false } if not found.
 */
export function deleteDish(id: string): { found: true } | { found: false } {
  const info = db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
  if (info.changes === 0) {
    return { found: false };
  }
  return { found: true };
}

/**
 * Bulk import dishes. Fails if any dish name already exists (case-insensitive).
 * Returns { imported: number } on success.
 * Returns { duplicates: string[] } on conflict.
 */
export function importDishes(
  items: ImportDishInput[],
):
  | { imported: number }
  | { duplicates: string[] } {
  const existingNames = (db
    .prepare('SELECT name FROM dishes')
    .all() as { name: string }[])
    .map((r) => r.name.toLowerCase());

  const duplicates = items
    .filter((i) => existingNames.includes(i.name.toLowerCase()))
    .map((i) => i.name);
  if (duplicates.length > 0) {
    return { duplicates };
  }

  const insert = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const importAll = db.transaction((rows: typeof items) => {
    for (const r of rows) {
      insert.run(
        r.name,
        JSON.stringify(r.tags ?? []),
        r.takeout ? 1 : 0,
        JSON.stringify(r.ingredients ?? []),
        r.instructions ?? '',
        r.notes ?? '',
      );
    }
  });
  importAll(items);
  return { imported: items.length };
}
