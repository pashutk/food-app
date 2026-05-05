import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Use a unique port for the test server
const PORT = 3997;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: any;
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

describe('MCP browse_dishes tool', () => {
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

  it('browse_dishes tool is listed', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('browse_dishes');
  });

  it('browse_dishes fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: {},
    });

    const textContent = (result.content as any[])[0].text;
    // SDK-level schema validation error (not our JSON response)
    expect(textContent).toContain('error');
  });

  it('browse_dishes fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token: 'invalid-token' } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toBeDefined();
  });

  it('browse_dishes returns dishes with valid token', async () => {
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.dishes).toBeDefined();
    expect(Array.isArray(parsed.dishes)).toBe(true);
  });

  it('browse_dishes returns dishes in domain shape', async () => {
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    // Verify dishes array structure matches service shape
    if (parsed.dishes.length > 0) {
      const dish = parsed.dishes[0];
      expect(dish).toHaveProperty('id');
      expect(dish).toHaveProperty('name');
      expect(dish).toHaveProperty('tags');
      expect(dish).toHaveProperty('takeout');
    }
  });
});
