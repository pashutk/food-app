import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as menusService from '../services/menus';

export const menusRouter = Router();
menusRouter.use(requireAuth);

menusRouter.get('/:date', (req, res) => {
  res.json(menusService.getMenu(req.params.date));
});

menusRouter.put('/:date', (req, res) => {
  const { entries } = req.body;
  res.json(menusService.upsertMenu(req.params.date, entries));
});
