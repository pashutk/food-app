import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Use a unique port for the test server
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: any;
let client: Client;
let transport: StreamableHTTPClientTransport;
let token: string;
let createdDishId: string;

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

describe('MCP edit_dish tool', () => {
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

    // Create a dish to use for editing
    const addResult = await client.callTool({
      name: 'add_dish',
      arguments: { auth: { token }, name: 'Test Dish', tags: ['test'] },
    });
    const addText = (addResult.content as any[])[0].text;
    const addData = JSON.parse(addText);
    createdDishId = String(addData.dish.id);
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('edit_dish tool is listed by tools/list', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('edit_dish');
  });

  it('edit_dish fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'edit_dish',
      arguments: { id: createdDishId, name: 'Updated Dish' },
    });

    const textContent = (result.content as any[])[0].text;
    expect(textContent).toContain('error');
  });

  it('edit_dish fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'edit_dish',
      arguments: { auth: { token: 'invalid-token' }, id: createdDishId, name: 'Updated Dish' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toBeDefined();
  });

  it('edit_dish updates a dish with valid input and returns { dish }', async () => {
    const result = await client.callTool({
      name: 'edit_dish',
      arguments: { auth: { token }, id: createdDishId, name: 'Updated Dish Name', tags: ['updated'] },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.dish).toBeDefined();
    expect(parsed.dish.name).toBe('Updated Dish Name');
    expect(parsed.dish.tags).toEqual(['updated']);
  });

  it('edit_dish returns { error: "Dish not found" } for a non-existent id', async () => {
    const result = await client.callTool({
      name: 'edit_dish',
      arguments: { auth: { token }, id: '99999', name: 'Ghost Dish' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toBe('Dish not found');
  });
});
