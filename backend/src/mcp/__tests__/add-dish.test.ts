import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Use a unique port for the test server
const PORT = 3998;
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

describe('MCP add_dish tool', () => {
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

  it('add_dish tool is listed', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('add_dish');
  });

  it('add_dish fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'add_dish',
      arguments: { name: 'Test Dish Phase5' },
    });

    const textContent = (result.content as any[])[0].text;
    // SDK-level schema validation error (not our JSON response)
    expect(textContent).toContain('error');
  });

  it('add_dish fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'add_dish',
      arguments: { auth: { token: 'invalid-token' }, name: 'Test Dish Phase5' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toBeDefined();
  });

  it('add_dish creates a dish with valid input and returns { dish }', async () => {
    const result = await client.callTool({
      name: 'add_dish',
      arguments: {
        auth: { token },
        name: 'Test Dish Phase5',
      },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.dish).toBeDefined();
    expect(parsed.dish.name).toBe('Test Dish Phase5');
  });

  it('created dish has correct shape', async () => {
    const result = await client.callTool({
      name: 'add_dish',
      arguments: {
        auth: { token },
        name: 'Test Dish Phase5',
      },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    const dish = parsed.dish;

    expect(dish).toHaveProperty('id');
    expect(dish).toHaveProperty('name');
    expect(dish).toHaveProperty('tags');
    expect(dish).toHaveProperty('takeout');
  });
});
