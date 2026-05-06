import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

// Use a unique port for the test server
const PORT = 3996;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;
let client: Client;
let transport: StreamableHTTPClientTransport;
let token: string;

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

describe('MCP view_menu tool', () => {
  beforeAll(async () => {
    await startServer();

    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    // Login to get a valid token
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginText = (loginResult.content as any[])[0].text;
    const loginData = JSON.parse(loginText);
    token = loginData.token;
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('view_menu tool is listed', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('view_menu');
  });

  it('view_menu fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'view_menu',
      arguments: { date: '2024-01-01' },
    });

    const textContent = (result.content as any[])[0].text;
    // SDK-level schema validation error (not our JSON response)
    expect(textContent).toContain('error');
  });

  it('view_menu fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'view_menu',
      arguments: { auth: { token: 'invalid-token' }, date: '2024-01-01' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toBeDefined();
  });

  it('view_menu returns menu with valid token and date', async () => {
    const result = await client.callTool({
      name: 'view_menu',
      arguments: { auth: { token }, date: '2024-01-01' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.date).toBe('2024-01-01');
    expect(parsed.entries).toBeDefined();
    expect(Array.isArray(parsed.entries)).toBe(true);
  });

  it('view_menu returns empty entries for date without menu', async () => {
    const result = await client.callTool({
      name: 'view_menu',
      arguments: { auth: { token }, date: '2024-06-15' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.date).toBe('2024-06-15');
    expect(parsed.entries).toEqual([]);
  });
});
