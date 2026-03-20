import { Router } from 'express';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
