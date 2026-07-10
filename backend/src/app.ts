import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { mountMCP } from './mcp/http';
import { mountRestEndpoints } from './rest/http';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  mountRestEndpoints(app);

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
