import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as dishesService from '../services/dishes';

export const dishesRouter = Router();
dishesRouter.use(requireAuth);

dishesRouter.get('/', (_req, res) => {
  res.json(dishesService.listDishes());
});

dishesRouter.post('/', (req, res) => {
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  const dish = dishesService.createDish({
    name,
    tags,
    takeout,
    ingredients,
    instructions,
    notes,
  });
  res.status(201).json(dish);
});

dishesRouter.put('/:id', (req, res) => {
  const { name, tags, takeout, ingredients, instructions, notes } = req.body;
  const result = dishesService.updateDish(req.params.id, {
    name,
    tags,
    takeout,
    ingredients,
    instructions,
    notes,
  });
  if (!result.found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(result.dish);
});

dishesRouter.delete('/:id', (req, res) => {
  dishesService.deleteDish(req.params.id);
  res.json({ success: true });
});

// Bulk import — fails if any dish name already exists (case-insensitive)
dishesRouter.post('/import', (req, res) => {
  const items = req.body as dishesService.ImportDishInput[];
  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'Expected an array' });
    return;
  }

  const result = dishesService.importDishes(items);
  if ('duplicates' in result) {
    res.status(409).json({ error: 'Duplicate dishes found', duplicates: result.duplicates });
    return;
  }
  res.json({ imported: result.imported });
});
