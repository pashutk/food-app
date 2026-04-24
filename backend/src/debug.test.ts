import { describe, expect, it, afterEach } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import nock from 'nock';
import { z } from 'zod';

const API_BASE = 'http://localhost:3000';

function buildServer(jwtToken?: string | null) {
  const server = new McpServer({ name: 'food-app-mcp', version: '1.0.0' });
  let token = jwtToken;

  async function apiFetch(path: string, options: RequestInit & { requiresAuth?: boolean } = {}) {
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
    console.log('API fetch:', url, JSON.stringify(fetchOptions));
    const response = await fetch(url, { ...fetchOptions, headers });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error: string }).error
        : text || `HTTP ${response.status}`;
      throw new Error(`API error ${response.status}: ${message}`);
    }
    return body;
  }

  server.tool('get_shopping_list', 'Get shopping list', {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date'),
  }, async ({ date }) => {
    try {
      const [menu, allDishes] = await Promise.all([
        apiFetch(`/api/menus/${date}`) as Promise<{ date: string; entries: any[] }>,
        apiFetch('/api/dishes') as Promise<any[]>,
      ]);
      console.log('menu.entries.length:', menu.entries.length);
      if (menu.entries.length === 0) {
        return { content: [{ type: 'text', text: `No menu entries found for ${date}. Shopping list is empty.` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify([]) }] };
    } catch (err) {
      console.log('tool error:', (err as Error).message);
      return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
    }
  });

  return { server };
}

describe('debug', () => {
  afterEach(() => nock.cleanAll());

  it('returns message when menu has no entries', async () => {
    nock(API_BASE).get('/api/menus/2025-01-20').reply(200, { date: '2025-01-20', entries: [] });
    nock(API_BASE).get('/api/dishes').reply(200, []);

    const { server } = buildServer('fake-token');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'get_shopping_list', arguments: { date: '2025-01-20' } });
    console.log('isError:', result.isError);
    console.log('content:', JSON.stringify(result.content));

    await client.close();
  });
});
