import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;
let client: Client;
let transport: StreamableHTTPClientTransport;
let token: string;
let createdDishId: number;

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

describe('MCP remove_dish tool', () => {
  beforeAll(async () => {
    await startServer();

    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginText = (loginResult.content as any[])[0].text;
    const loginData = JSON.parse(loginText);
    token = loginData.token;

    const addResult = await client.callTool({
      name: 'add_dish',
      arguments: {
        auth: { token },
        name: 'Test Dish For Removal',
        tags: ['test'],
        takeout: false,
      },
    });
    const addText = (addResult.content as any[])[0].text;
    const addData = JSON.parse(addText);
    createdDishId = addData.dish.id;
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('remove_dish tool is listed by tools/list', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('remove_dish');
  });

  it('remove_dish fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'remove_dish',
      arguments: { id: String(createdDishId) },
    });

    const textContent = (result.content as any[])[0].text;
    expect(textContent).toContain('error');
  });

  it('remove_dish fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'remove_dish',
      arguments: { auth: { token: 'invalid-token' }, id: String(createdDishId) },
    });

    const textContent = (result.content as any[])[0].text;
    // SDK-level schema validation error (not our JSON response)
    expect(textContent).toContain('error');
  });

  it('remove_dish deletes a dish with valid input and returns { success: true }', async () => {
    const result = await client.callTool({
      name: 'remove_dish',
      arguments: { auth: { token }, id: String(createdDishId) },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.success).toBe(true);
  });

  it('the dish is actually removed from subsequent reads', async () => {
    const browseResult = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });

    const textContent = (browseResult.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    const dishIds = parsed.dishes.map((d: { id: string }) => d.id);
    expect(dishIds).not.toContain(createdDishId);
  });

  it('remove_dish returns not-found error for non-existent dish', async () => {
    const result = await client.callTool({
      name: 'remove_dish',
      arguments: { auth: { token }, id: '99999' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.error).toContain('not found');
  });
});
