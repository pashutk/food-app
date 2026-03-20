import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const dishesRouter = Router();
dishesRouter.use(requireAuth);

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

function parse(row: DishRow) {
  return {
    ...row,
    takeout: row.takeout === 1,
    tags: JSON.parse(row.tags),
    ingredients: JSON.parse(row.ingredients),
  };
}

dishesRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM dishes ORDER BY name COLLATE NOCASE').all() as DishRow[];
  res.json(rows.map(parse));
});

dishesRouter.post('/', (req, res) => {
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  const result = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '');
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(result.lastInsertRowid) as DishRow;
  res.status(201).json(parse(row));
});

dishesRouter.put('/:id', (req, res) => {
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  const info = db.prepare(
    `UPDATE dishes SET name=?, tags=?, takeout=?, ingredients=?, instructions=?, notes=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(name, JSON.stringify(tags ?? []), takeout ? 1 : 0, JSON.stringify(ingredients ?? []), instructions ?? '', notes ?? '', req.params.id);
  if (info.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  const row = db.prepare('SELECT * FROM dishes WHERE id = ?').get(req.params.id) as DishRow;
  res.json(parse(row));
});

dishesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM dishes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Bulk import — fails if any dish name already exists (case-insensitive)
dishesRouter.post('/import', (req, res) => {
  const items: { name: string; tags?: string[]; takeout?: boolean; ingredients?: object[]; instructions?: string; notes?: string }[] = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Expected an array' }); return; }

  const existingNames = (db.prepare('SELECT name FROM dishes').all() as { name: string }[])
    .map(r => r.name.toLowerCase());

  const duplicates = items.filter(i => existingNames.includes(i.name.toLowerCase())).map(i => i.name);
  if (duplicates.length > 0) {
    res.status(409).json({ error: 'Duplicate dishes found', duplicates });
    return;
  }

  const insert = db.prepare(
    `INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const importAll = db.transaction((rows: typeof items) => {
    for (const r of rows) {
      insert.run(r.name, JSON.stringify(r.tags ?? []), r.takeout ? 1 : 0, JSON.stringify(r.ingredients ?? []), r.instructions ?? '', r.notes ?? '');
    }
  });
  importAll(items);
  res.json({ imported: items.length });
});
