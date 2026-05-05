import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth';
import { dishesRouter } from './routes/dishes';
import { menusRouter } from './routes/menus';
import { mountMCP } from './mcp/http';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Existing REST routes
  app.use('/api/auth', authRouter);
  app.use('/api/dishes', dishesRouter);
  app.use('/api/menus', menusRouter);

  // MCP endpoint
  mountMCP(app);

  // Serve frontend in production
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
