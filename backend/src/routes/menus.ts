import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const menusRouter = Router();
menusRouter.use(requireAuth);

menusRouter.get('/:date', (req, res) => {
  const row = db.prepare('SELECT * FROM menus WHERE date = ?').get(req.params.date) as { date: string; entries: string } | undefined;
  res.json({ date: req.params.date, entries: row ? JSON.parse(row.entries) : [] });
});

menusRouter.put('/:date', (req, res) => {
  const { entries } = req.body;
  db.prepare(
    `INSERT INTO menus (date, entries) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET entries = excluded.entries`
  ).run(req.params.date, JSON.stringify(entries));
  res.json({ date: req.params.date, entries });
});
