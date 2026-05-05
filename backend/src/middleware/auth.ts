import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
