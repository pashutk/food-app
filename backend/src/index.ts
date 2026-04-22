import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth';
import { dishesRouter } from './routes/dishes';
import { menusRouter } from './routes/menus';
import { startMcpServer } from './mcp-server';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!process.env.AUTH_USERNAME) throw new Error('AUTH_USERNAME is required');
if (!process.env.AUTH_PASSWORD) throw new Error('AUTH_PASSWORD is required');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/dishes', dishesRouter);
app.use('/api/menus', menusRouter);

// Serve frontend in production
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
startMcpServer().then(() => {
  app.listen(port, () => console.log(`HTTP server listening on :${port} | MCP server running on stdio`));
});
