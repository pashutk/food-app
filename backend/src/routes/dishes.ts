import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const dishesRouter = Router();
dishesRouter.use(requireAuth);

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
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const result = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '');
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as DishRow;
  return parse(row);
}

export function updateDish(id: number, input: DishData): Dish | null {
  const { name, tags, takeout, ingredients, instructions, notes } = input;
  const info = db.prepare(
    `UPDATE dishes SET name=?, tags=?, takeout=?, ingredients=?, instructions=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(name, JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '', id);
  if (info.changes === 0) return null;
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(id) as DishRow;
  return parse(row);
}

export function deleteDish(id: number): { success: boolean } {
  db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
  return { success: true };
}

export function importDishes(
  items: DishData[]
): { imported: number } | { error: string; duplicates: string[] } {
  const existingNames = (db.prepare('SELECT name FROM dishes').all() as { name: string }[])
    .map(r => r.name.toLowerCase());

  const duplicates = items.filter(i => existingNames.includes(i.name.toLowerCase())).map(i => i.name);
  if (duplicates.length > 0) {
    return { error: 'Duplicate dishes found', duplicates };
  }

  const insert = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const importAll = db.transaction((rows: DishData[]) => {
    for (const r of rows) {
      insert.run(r.name, JSON.stringify(r.tags ?? []), r.takeout ? 1 : 0, JSON.stringify(r.ingredients ?? []), r.instructions ?? '', r.notes ?? '');
    }
  });
  importAll(items);
  return { imported: items.length };
}

dishesRouter.get('/', (_req, res) => {
  res.json(listDishes());
});

dishesRouter.post('/', (req, res) => {
  res.status(201).json(createDish(req.body));
});

dishesRouter.put('/:id', (req, res) => {
  const dish = updateDish(Number(req.params.id), req.body);
  if (!dish) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(dish);
});

dishesRouter.delete('/:id', (req, res) => {
  res.json(deleteDish(Number(req.params.id)));
});

// Bulk import — fails if any dish name already exists (case-insensitive)
dishesRouter.post('/import', (req, res) => {
  const items: DishData[] = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Expected an array' }); return; }
  const result = importDishes(items);
  if ('error' in result) { res.status(409).json(result); return; }
  res.json(result);
});
