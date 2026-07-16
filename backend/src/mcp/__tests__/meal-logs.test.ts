import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../app';

const PORT = 4013;
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

async function addDish(name: string) {
  const result = await client.callTool({
    name: 'add_dish',
    arguments: {
      auth: { token },
      name,
      tags: ['dinner'],
    },
  });

  return JSON.parse((result.content as any[])[0].text).dish as { id: number; name: string };
}

describe('MCP meal log tools', () => {
  beforeAll(async () => {
    await startServer();

    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'meal-logs-test-client', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);

    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    token = loginData.token;
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('lists log_meal, view_meal_logs, and remove_meal_log', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    expect(toolNames).toContain('log_meal');
    expect(toolNames).toContain('view_meal_logs');
    expect(toolNames).toContain('remove_meal_log');
  });

  it('requires auth for each protected meal log tool', async () => {
    const cases = [
      { name: 'log_meal', arguments: { date: '2026-07-10', dishId: 1 } },
      { name: 'view_meal_logs', arguments: { date: '2026-07-10' } },
      { name: 'remove_meal_log', arguments: { id: '1' } },
    ];

    for (const testCase of cases) {
      const result = await client.callTool(testCase as any);
      expect((result.content as any[])[0].text).toContain('error');
    }
  });

  it('creates, views, and removes a meal log', async () => {
    const dish = await addDish(`Meal Log MCP Dish ${Date.now()}`);

    const createResult = await client.callTool({
      name: 'log_meal',
      arguments: {
        auth: { token },
        date: '2026-07-20',
        dishId: dish.id,
        slot: 'dinner',
      },
    });
    const created = JSON.parse((createResult.content as any[])[0].text);

    expect(created.mealLog.dishId).toBe(dish.id);
    expect(created.mealLog.slot).toBe('dinner');

    const viewResult = await client.callTool({
      name: 'view_meal_logs',
      arguments: {
        auth: { token },
        date: '2026-07-20',
      },
    });
    const viewed = JSON.parse((viewResult.content as any[])[0].text);

    expect(viewed.mealLogs).toEqual([
      expect.objectContaining({
        id: created.mealLog.id,
        dishId: dish.id,
        slot: 'dinner',
        dish: {
          id: dish.id,
          name: dish.name,
        },
      }),
    ]);

    const removeResult = await client.callTool({
      name: 'remove_meal_log',
      arguments: {
        auth: { token },
        id: String(created.mealLog.id),
      },
    });

    expect(JSON.parse((removeResult.content as any[])[0].text)).toEqual({ success: true });

    const afterRemove = await client.callTool({
      name: 'view_meal_logs',
      arguments: {
        auth: { token },
        date: '2026-07-20',
      },
    });
    expect(JSON.parse((afterRemove.content as any[])[0].text)).toEqual({ mealLogs: [] });
  });

  it('returns clean validation and duplicate conflict errors', async () => {
    const dish = await addDish(`Meal Log MCP Duplicate Dish ${Date.now()}`);

    const invalidDishResult = await client.callTool({
      name: 'log_meal',
      arguments: {
        auth: { token },
        date: '2026-07-21',
        dishId: 999999,
        slot: 'dinner',
      },
    });
    expect(JSON.parse((invalidDishResult.content as any[])[0].text)).toEqual({
      error: 'Dish not found',
    });

    await client.callTool({
      name: 'log_meal',
      arguments: {
        auth: { token },
        date: '2026-07-21',
        dishId: dish.id,
        slot: 'dinner',
      },
    });

    const duplicateResult = await client.callTool({
      name: 'log_meal',
      arguments: {
        auth: { token },
        date: '2026-07-21',
        dishId: dish.id,
        slot: 'dinner',
      },
    });
    expect(JSON.parse((duplicateResult.content as any[])[0].text)).toEqual({
      error: 'Meal log already exists for that date, slot, and dish',
    });
  });

  it('returns clean errors for invalid dates and missing meal logs', async () => {
    const invalidDateResult = await client.callTool({
      name: 'view_meal_logs',
      arguments: {
        auth: { token },
        date: '2026-02-31',
      },
    });
    expect(JSON.parse((invalidDateResult.content as any[])[0].text).error).toBe(
      'Invalid date',
    );

    const missingDeleteResult = await client.callTool({
      name: 'remove_meal_log',
      arguments: {
        auth: { token },
        id: '999999',
      },
    });
    expect(JSON.parse((missingDeleteResult.content as any[])[0].text)).toEqual({
      error: 'Meal log with id 999999 not found',
    });
  });
});
