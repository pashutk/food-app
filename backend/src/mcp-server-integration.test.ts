import { describe, expect, it, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import nock from 'nock';
import { z } from 'zod';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:3000';

// ── Test server factory ──────────────────────────────────────────────────────
// Re-implements the same tool logic from mcp-server.ts using the same apiFetch
// pattern, so we test the real code path with nock intercepting HTTP.

function buildIntegrationServer(jwtToken?: string | null) {
  const server = new McpServer({ name: 'food-app-mcp', version: '1.0.0' });
  let token = jwtToken;

  async function apiFetch(
    path: string,
    options: RequestInit & { requiresAuth?: boolean } = {}
  ): Promise<unknown> {
    const { requiresAuth = true, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string> | undefined),
    };

    if (requiresAuth) {
      if (!token) throw new Error('Not authenticated. Call auth_login first.');
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${API_BASE}${path}`;
    const response = await fetch(url, { ...fetchOptions, headers });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? (body as { error: string }).error
          : text || `HTTP ${response.status}`;
      throw new Error(`API error ${response.status}: ${message}`);
    }

    return body;
  }

  // ── auth_login ─────────────────────────────────────────────────────────
  server.tool(
    'auth_login',
    'Authenticate with the food-app and obtain a JWT token.',
    {
      username: z.string().optional().describe('Username to authenticate with.'),
      password: z.string().optional().describe('Password to authenticate with.'),
    },
    async ({ username, password }) => {
      const user = username ?? 'test@example.com';
      const pass = password ?? 'password123';

      try {
        const data = (await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: user, password: pass }),
          requiresAuth: false,
        })) as { token: string };

        token = data.token;
        return {
          content: [
            {
              type: 'text',
              text: `Authentication successful. JWT token stored. Token preview: ${token.slice(0, 20)}...`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Authentication failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── list_dishes ─────────────────────────────────────────────────────────
  server.tool(
    'list_dishes',
    'List all dishes. Optionally filter by tag or takeout status.',
    {
      tag: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink']).optional(),
      takeout: z.boolean().optional(),
    },
    async ({ tag, takeout }) => {
      try {
        let dishes = (await apiFetch('/api/dishes')) as Array<{
          id: number;
          name: string;
          tags: string[];
          takeout: boolean;
          ingredients: Array<{ name: string; quantity: number; unit: string }>;
          instructions: string;
          notes: string;
          created_at: string;
          updated_at: string;
        }>;

        if (tag !== undefined) dishes = dishes.filter((d) => d.tags.includes(tag));
        if (takeout !== undefined) dishes = dishes.filter((d) => d.takeout === takeout);

        return { content: [{ type: 'text', text: JSON.stringify(dishes, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
      }
    }
  );

  // ── get_menu ────────────────────────────────────────────────────────────
  server.tool(
    'get_menu',
    'Get the menu for a specific date.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format.'),
    },
    async ({ date }) => {
      try {
        const menu = (await apiFetch(`/api/menus/${date}`)) as {
          date: string;
          entries: Array<{ slot: string; dishId: number; servings: number }>;
        };
        return { content: [{ type: 'text', text: JSON.stringify(menu, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
      }
    }
  );

  // ── get_shopping_list ──────────────────────────────────────────────────
  function aggregateShoppingList(
    menu: { entries: Array<{ slot: string; dishId: number; servings: number }> },
    dishMap: Map<
      number,
      {
        id: number;
        name: string;
        tags: string[];
        takeout: boolean;
        ingredients: Array<{ name: string; quantity: number; unit: string }>;
        instructions: string;
        notes: string;
        created_at: string;
        updated_at: string;
      }
    >
  ) {
    const aggregated = new Map<string, { name: string; quantity: number; unit: string }>();

    for (const entry of menu.entries) {
      const dish = dishMap.get(entry.dishId);
      if (!dish || dish.takeout) continue;
      for (const ing of dish.ingredients) {
        const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
        const scaledQty = ing.quantity * entry.servings;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity = Math.round((existing.quantity + scaledQty) * 1000) / 1000;
        } else {
          aggregated.set(key, { name: ing.name, quantity: scaledQty, unit: ing.unit });
        }
      }
    }

    return Array.from(aggregated.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  server.tool(
    'get_shopping_list',
    'Generate a shopping list for a given date.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format.'),
    },
    async ({ date }) => {
      try {
        const [menu, allDishes] = await Promise.all([
          apiFetch(`/api/menus/${date}`) as Promise<{
            date: string;
            entries: Array<{ slot: string; dishId: number; servings: number }>;
          }>,
          apiFetch('/api/dishes') as Promise<
            Array<{
              id: number;
              name: string;
              tags: string[];
              takeout: boolean;
              ingredients: Array<{ name: string; quantity: number; unit: string }>;
              instructions: string;
              notes: string;
              created_at: string;
              updated_at: string;
            }>
          >,
        ]);

        if (menu.entries.length === 0) {
          return {
            content: [{ type: 'text', text: `No menu entries found for ${date}. Shopping list is empty.` }],
          };
        }

        const dishMap = new Map<number, (typeof allDishes)[0]>(allDishes.map((d) => [d.id, d]));
        const shoppingList = aggregateShoppingList(menu, dishMap);

        if (shoppingList.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `All dishes on ${date} are takeout — no ingredients to shop for.`,
              },
            ],
          };
        }

        return { content: [{ type: 'text', text: JSON.stringify(shoppingList, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
      }
    }
  );

  return { server, getToken: () => token };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TEST_DISHES = [
  {
    id: 1,
    name: 'Oatmeal',
    tags: ['breakfast'],
    takeout: false,
    ingredients: [
      { name: 'Oats', quantity: 100, unit: 'g' },
      { name: 'Milk', quantity: 200, unit: 'ml' },
    ],
    instructions: 'Cook oats in milk.',
    notes: '',
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    name: 'Pizza',
    tags: ['dinner'],
    takeout: true,
    ingredients: [
      { name: 'Cheese', quantity: 150, unit: 'g' },
      { name: 'Dough', quantity: 1, unit: 'pcs' },
    ],
    instructions: 'Bake pizza.',
    notes: '',
    created_at: '',
    updated_at: '',
  },
  {
    id: 3,
    name: 'Salad',
    tags: ['lunch'],
    takeout: false,
    ingredients: [
      { name: 'Lettuce', quantity: 50, unit: 'g' },
      { name: 'Tomato', quantity: 100, unit: 'g' },
    ],
    instructions: 'Mix vegetables.',
    notes: '',
    created_at: '',
    updated_at: '',
  },
];

const TEST_MENU = {
  date: '2025-01-15',
  entries: [
    { slot: 'breakfast', dishId: 1, servings: 2 },
    { slot: 'lunch', dishId: 3, servings: 1 },
    { slot: 'dinner', dishId: 2, servings: 1 },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MCP server integration tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── auth_login ──────────────────────────────────────────────────────────────

  describe('auth_login', () => {
    it('returns success with JWT token on valid credentials', async () => {
      nock(API_BASE)
        .post('/api/auth/login', { username: 'test@example.com', password: 'password123' })
        .reply(200, { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test' });

      const { server } = buildIntegrationServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'auth_login',
        arguments: { username: 'test@example.com', password: 'password123' },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text as string).toContain('Authentication successful');
      expect(result.content[0].text as string).toContain('JWT token stored');

      await client.close();
    });

    it('returns error on invalid credentials', async () => {
      nock(API_BASE)
        .post('/api/auth/login', { username: 'bad', password: 'wrong' })
        .reply(401, { error: 'Invalid credentials' });

      const { server } = buildIntegrationServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'auth_login',
        arguments: { username: 'bad', password: 'wrong' },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('Authentication failed');

      await client.close();
    });

    it('uses default credentials when username/password omitted', async () => {
      nock(API_BASE)
        .post('/api/auth/login', { username: 'test@example.com', password: 'password123' })
        .reply(200, { token: 'default-token' });

      const { server } = buildIntegrationServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'auth_login',
        arguments: {},
      });

      expect(result.isError ?? false).toBe(false);
      expect(result.content[0].text as string).toContain('Authentication successful');

      await client.close();
    });
  });

  // ── list_dishes ─────────────────────────────────────────────────────────────

  describe('list_dishes', () => {
    it('returns all dishes without filters', async () => {
      nock(API_BASE).get('/api/dishes').reply(200, TEST_DISHES);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({ name: 'list_dishes', arguments: {} });

      expect(result.isError ?? false).toBe(false);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(3);

      await client.close();
    });

    it('filters dishes by tag', async () => {
      nock(API_BASE).get('/api/dishes').reply(200, TEST_DISHES);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'list_dishes',
        arguments: { tag: 'breakfast' },
      });

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Oatmeal');

      await client.close();
    });

    it('filters dishes by takeout status', async () => {
      nock(API_BASE).get('/api/dishes').reply(200, TEST_DISHES);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'list_dishes',
        arguments: { takeout: true },
      });

      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Pizza');

      await client.close();
    });

    it('returns error when not authenticated', async () => {
      const { server } = buildIntegrationServer(null);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({ name: 'list_dishes', arguments: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('Not authenticated');

      await client.close();
    });
  });

  // ── get_menu ─────────────────────────────────────────────────────────────────

  describe('get_menu', () => {
    it('returns menu for a valid date', async () => {
      nock(API_BASE).get('/api/menus/2025-01-15').reply(200, TEST_MENU);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_menu',
        arguments: { date: '2025-01-15' },
      });

      expect(result.isError ?? false).toBe(false);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.date).toBe('2025-01-15');
      expect(parsed.entries).toHaveLength(3);

      await client.close();
    });

    it('returns empty entries for a date with no menu', async () => {
      nock(API_BASE)
        .get('/api/menus/2025-01-20')
        .reply(200, { date: '2025-01-20', entries: [] });

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_menu',
        arguments: { date: '2025-01-20' },
      });

      expect(result.isError ?? false).toBe(false);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.entries).toHaveLength(0);

      await client.close();
    });

    it('returns error for 404 on menu', async () => {
      nock(API_BASE).get('/api/menus/2099-01-01').reply(404, { error: 'Not found' });

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_menu',
        arguments: { date: '2099-01-01' },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('API error 404');

      await client.close();
    });
  });

  // ── get_shopping_list ───────────────────────────────────────────────────────

  describe('get_shopping_list', () => {
    it('aggregates ingredients from menu dishes', async () => {
      nock(API_BASE).get('/api/dishes').reply(200, TEST_DISHES);
      nock(API_BASE).get('/api/menus/2025-01-15').reply(200, TEST_MENU);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_shopping_list',
        arguments: { date: '2025-01-15' },
      });

      expect(result.isError ?? false).toBe(false);
      const parsed = JSON.parse(result.content[0].text as string);

      // Oatmeal (2 servings): Oats 200g, Milk 400ml
      // Salad (1 serving): Lettuce 50g, Tomato 100g
      // Pizza is takeout → excluded
      // Alphabetically: Lettuce, Milk, Oats, Tomato
      expect(parsed).toHaveLength(4);
      expect(parsed[0].name).toBe('Lettuce');
      expect(parsed[1].name).toBe('Milk');
      expect(parsed[2].name).toBe('Oats');
      expect(parsed[3].name).toBe('Tomato');

      const oats = parsed.find((r: { name: string }) => r.name === 'Oats');
      expect(oats?.quantity).toBe(200);
      expect(oats?.unit).toBe('g');

      const milk = parsed.find((r: { name: string }) => r.name === 'Milk');
      expect(milk?.quantity).toBe(400);
      expect(milk?.unit).toBe('ml');

      await client.close();
    });

    it('returns message when menu has no entries', async () => {
      nock(API_BASE)
        .get('/api/menus/2025-01-20')
        .reply(200, { date: '2025-01-20', entries: [] });
      nock(API_BASE)
        .get('/api/dishes')
        .reply(200, []);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_shopping_list',
        arguments: { date: '2025-01-20' },
      });

      expect(result.isError ?? false).toBe(false);
      expect(result.content[0].text as string).toContain('No menu entries found');

      await client.close();
    });

    it('returns message when all menu dishes are takeout', async () => {
      const takeoutMenu = { date: '2025-01-16', entries: [{ slot: 'dinner', dishId: 2, servings: 1 }] };
      nock(API_BASE).get('/api/dishes').reply(200, TEST_DISHES);
      nock(API_BASE).get('/api/menus/2025-01-16').reply(200, takeoutMenu);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_shopping_list',
        arguments: { date: '2025-01-16' },
      });

      expect(result.isError ?? false).toBe(false);
      expect(result.content[0].text as string).toContain('takeout');

      await client.close();
    });

    it('merges duplicate ingredients case-insensitively', async () => {
      const dishesWithDupes = [
        {
          id: 1,
          name: 'Dish A',
          tags: ['lunch'],
          takeout: false,
          ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }],
          instructions: '',
          notes: '',
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          name: 'Dish B',
          tags: ['dinner'],
          takeout: false,
          ingredients: [{ name: 'rice', quantity: 50, unit: 'g' }],
          instructions: '',
          notes: '',
          created_at: '',
          updated_at: '',
        },
      ];
      const menuWithDupes = {
        date: '2025-01-17',
        entries: [
          { slot: 'lunch', dishId: 1, servings: 1 },
          { slot: 'dinner', dishId: 2, servings: 1 },
        ],
      };

      nock(API_BASE).get('/api/dishes').reply(200, dishesWithDupes);
      nock(API_BASE).get('/api/menus/2025-01-17').reply(200, menuWithDupes);

      const { server } = buildIntegrationServer('fake-token');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const result = await client.callTool({
        name: 'get_shopping_list',
        arguments: { date: '2025-01-17' },
      });

      expect(result.isError ?? false).toBe(false);
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].quantity).toBe(150); // 100 + 50
      expect(parsed[0].name).toBe('Rice');

      await client.close();
    });
  });
});
