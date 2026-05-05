import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { verifyToken } from '../../services/auth';

// Use a unique port for the test server
const PORT = 3998;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: any;
let client: Client;
let transport: StreamableHTTPClientTransport;

async function startServer() {
  const app = createApp();
  return new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', reject);
  });
}

async function stopServer() {
  if (client) {
    try {
      await client.close();
    } catch (_) {
      // ignore
    }
  }
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else {
      resolve();
    }
  });
}

describe('MCP login tool', () => {
  beforeAll(async () => {
    await startServer();

    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('login tool is listed', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('login');
  });

  it('login succeeds with valid credentials', async () => {
    const result = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.status).toBe('ok');
    expect(parsed.token).toBeDefined();
    expect(typeof parsed.token).toBe('string');
  });

  it('login returns a JWT that verifies with shared primitive', async () => {
    const result = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    const payload = verifyToken(parsed.token);
    expect(payload.username).toBe('testuser');
  });

  it('login rejects invalid credentials', async () => {
    const result = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'wrongpass' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.status).toBe('error');
    expect(parsed.error).toBe('Invalid credentials');
  });
});
