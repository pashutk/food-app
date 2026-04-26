import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = 'http://localhost:3001';
const MCP_URL = `${BASE_URL}/mcp`;
const AUTH_USERNAME = 'testuser';
const AUTH_PASSWORD = 'testpass';

async function createMcpClient() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({
    name: 'e2e-test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return client;
}

test.describe('MCP HTTP Endpoint', () => {
  let client: Client;

  test.beforeEach(async () => {
    client = await createMcpClient();
    await client.callTool({
      name: 'auth_login',
      arguments: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
    });
    const listResult = await client.callTool({ name: 'list_dishes', arguments: {} });
    const dishes = JSON.parse((listResult.content[0] as { text: string }).text);
    for (const dish of dishes) {
      await client.callTool({ name: 'delete_dish', arguments: { id: dish.id } });
    }
  });

  test.afterEach(async () => {
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  test('initialize - completes MCP handshake', async () => {
    client = await createMcpClient();

    const capabilities = client.getServerCapabilities();
    expect(capabilities).toBeDefined();

    const serverVersion = client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion?.name).toBe('food-app-mcp');
  });

  test('list_tools - returns all available MCP tools', async () => {
    client = await createMcpClient();

    const toolsResult = await client.listTools();
    expect(toolsResult.tools).toBeDefined();
    expect(toolsResult.tools.length).toBeGreaterThan(0);

    const toolNames = toolsResult.tools.map(t => t.name);
    expect(toolNames).toContain('auth_login');
    expect(toolNames).toContain('list_dishes');
    expect(toolNames).toContain('create_dish');
    expect(toolNames).toContain('delete_dish');
    expect(toolNames).toContain('get_menu');
    expect(toolNames).toContain('get_shopping_list');
  });

  test('auth_login - authenticates and stores JWT token', async () => {
    client = await createMcpClient();

    const result = await client.callTool({
      name: 'auth_login',
      arguments: {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
      },
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Authentication successful');
  });

  test('list_dishes - returns empty list initially', async () => {
    client = await createMcpClient();

    await client.callTool({
      name: 'auth_login',
      arguments: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
    });

    const result = await client.callTool({
      name: 'list_dishes',
      arguments: {},
    });

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { text: string }).text;
    const dishes = JSON.parse(text);
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes.length).toBe(0);
  });

  test('create_dish - creates a new dish', async () => {
    const dishId = crypto.randomUUID();
    const result = await client.callTool({
      name: 'create_dish',
      arguments: {
        name: `Test Pancakes ${dishId}`,
        tags: ['breakfast'],
        ingredients: [
          { name: 'flour', quantity: 200, unit: 'g' },
          { name: 'eggs', quantity: 2, unit: 'count' },
        ],
        instructions: 'Mix and cook on pan',
        notes: 'Test dish',
      },
    });

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { text: string }).text;
    expect(result.isError).toBeFalsy();

    const dish = JSON.parse(text);
    expect(dish.id).toBeDefined();
    expect(dish.name).toBe(`Test Pancakes ${dishId}`);
    expect(dish.tags).toContain('breakfast');

    await client.callTool({ name: 'delete_dish', arguments: { id: dish.id } });
  });

  test('menu - get_menu returns empty entries for new date', async () => {
    client = await createMcpClient();

    await client.callTool({
      name: 'auth_login',
      arguments: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
    });

    const result = await client.callTool({
      name: 'get_menu',
      arguments: { date: '2026-04-27' },
    });

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { text: string }).text;
    const menu = JSON.parse(text);
    expect(menu.date).toBe('2026-04-27');
    expect(menu.entries).toEqual([]);
  });

  test('shopping list - returns empty when menu has no dishes', async () => {
    client = await createMcpClient();

    await client.callTool({
      name: 'auth_login',
      arguments: { username: AUTH_USERNAME, password: AUTH_PASSWORD },
    });

    const result = await client.callTool({
      name: 'get_shopping_list',
      arguments: { date: '2026-04-27' },
    });

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No menu entries found');
  });

  test('delete_dish - removes a dish by ID', async () => {
    const createResult = await client.callTool({
      name: 'create_dish',
      arguments: {
        name: `Dish To Delete ${crypto.randomUUID()}`,
        tags: ['lunch'],
      },
    });

    const dish = JSON.parse((createResult.content[0] as { text: string }).text);
    const dishId = dish.id;

    const deleteResult = await client.callTool({
      name: 'delete_dish',
      arguments: { id: dishId },
    });

    expect(deleteResult.content).toBeDefined();
    const deleteText = (deleteResult.content[0] as { text: string }).text;
    expect(deleteText).toContain('deleted successfully');
  });

  test('full workflow - auth, create dish, list, delete', async () => {
    const createResult = await client.callTool({
      name: 'create_dish',
      arguments: {
        name: `Workflow Test Dish ${crypto.randomUUID()}`,
        tags: ['dinner'],
        ingredients: [{ name: 'pasta', quantity: 500, unit: 'g' }],
      },
    });
    const dish = JSON.parse((createResult.content[0] as { text: string }).text);
    expect(dish.id).toBeDefined();

    const listResult = await client.callTool({
      name: 'list_dishes',
      arguments: {},
    });
    const dishes = JSON.parse((listResult.content[0] as { text: string }).text);
    expect(dishes.length).toBe(1);
    expect(dishes[0].name).toBe(dish.name);

    const deleteResult = await client.callTool({
      name: 'delete_dish',
      arguments: { id: dish.id },
    });
    expect((deleteResult.content[0] as { text: string }).text).toContain('deleted successfully');
  });
});