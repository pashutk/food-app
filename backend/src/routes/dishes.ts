import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listDishes, createDish, updateDish, deleteDish, importDishes } from '../services/dishes';

export const dishesRouter = Router();
dishesRouter.use(requireAuth);

dishesRouter.get('/', (_req, res) => {
  res.json(listDishes());
});

dishesRouter.post('/', (req, res) => {
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  try {
    const dish = createDish({ name, tags, takeout, ingredients, instructions, notes });
    res.status(201).json(dish);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

dishesRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) { res.status(404).json({ error: 'Not found' }); return; }
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  try {
    const dish = updateDish(id, { name, tags, takeout, ingredients, instructions, notes });
    if (!dish) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(dish);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

dishesRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  deleteDish(id);
  res.json({ success: true });
});

dishesRouter.post('/import', (req, res) => {
  const items = req.body;
  const result = importDishes(items);
  if (!result.ok) {
    const errResult = result as { ok: false; error: string; duplicates: string[] };
    const status = errResult.error === 'Duplicate dishes found' ? 409 : 400;
    res.status(status).json({ error: errResult.error, duplicates: errResult.duplicates });
    return;
  }
  res.json({ imported: result.imported });
});
