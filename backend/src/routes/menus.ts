import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMenu, setMenu } from '../services/menus';

export const menusRouter = Router();
menusRouter.use(requireAuth);

menusRouter.get('/:date', (req, res) => {
  res.json(getMenu(req.params.date));
});

menusRouter.put('/:date', (req, res) => {
  res.json(setMenu(req.params.date, req.body.entries));
});