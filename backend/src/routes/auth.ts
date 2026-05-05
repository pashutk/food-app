import { Router } from 'express';
import { verifyCredentials, issueToken } from '../services/auth';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (verifyCredentials({ username, password })) {
    const token = issueToken(username);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
