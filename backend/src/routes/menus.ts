import { Router } from 'express';
import { getMenu, setMenu } from '../services/menus';
import { requireAuth } from '../middleware/auth';

export const menusRouter = Router();
menusRouter.use(requireAuth);

menusRouter.get('/:date', (req, res) => {
  res.json(getMenu(req.params.date));
});

menusRouter.put('/:date', (req, res) => {
  const { entries } = req.body;
  res.json(setMenu(req.params.date, entries));
});