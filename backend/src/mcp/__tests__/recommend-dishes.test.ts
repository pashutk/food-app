import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  startAuthenticatedMcpTestClient,
  type AuthenticatedMcpTestClient,
} from '../../test/mcpClient';
import { resetDatabase } from '../../test/resetDatabase';

const PORT = 4014;

let client: Client;
let token: string;
let testClient: AuthenticatedMcpTestClient;

async function addDish(name: string, tags: string[]) {
  const result = await client.callTool({
    name: 'add_dish',
    arguments: { auth: { token }, name, tags },
  });
  return JSON.parse((result.content as any[])[0].text).dish as {
    id: number;
    name: string;
    tags: string[];
  };
}

describe('MCP recommend_dishes tool', () => {
  beforeAll(async () => {
    testClient = await startAuthenticatedMcpTestClient({
      port: PORT,
      clientName: 'recommend-dishes-test-client',
    });
    client = testClient.client;
    token = testClient.token;
  }, 10000);

  afterAll(async () => {
    await testClient.close();
  }, 5000);

  beforeEach(() => {
    resetDatabase();
  });

  it('is listed and requires auth.token', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toContain('recommend_dishes');

    const result = await client.callTool({
      name: 'recommend_dishes',
      arguments: {
        date: '2026-07-20',
        requests: [{ kind: 'dinner', count: 1 }],
      },
    });

    expect((result.content as any[])[0].text).toContain('error');
  });

  it('returns eligible unique dishes for several kinds', async () => {
    const breakfastOnly = await addDish('MCP Breakfast', ['breakfast']);
    const flexible = await addDish('MCP Flexible', ['breakfast', 'lunch']);
    const dinner = await addDish('MCP Dinner', ['dinner']);
    const coolingDown = await addDish('MCP Recent Dinner', ['dinner']);
    await client.callTool({
      name: 'log_meal',
      arguments: {
        auth: { token },
        date: '2026-07-19',
        dishId: coolingDown.id,
        slot: 'breakfast',
      },
    });

    const result = await client.callTool({
      name: 'recommend_dishes',
      arguments: {
        auth: { token },
        date: '2026-07-20',
        requests: [
          { kind: 'breakfast', count: 1 },
          { kind: 'lunch', count: 1 },
          { kind: 'dinner', count: 1 },
        ],
      },
    });
    const payload = JSON.parse((result.content as any[])[0].text);

    expect(payload.date).toBe('2026-07-20');
    expect(payload.recommendations.map(({ kind }: any) => kind)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
    expect(payload.recommendations.map(({ dishes }: any) => dishes.length)).toEqual([1, 1, 1]);

    const returnedIds = payload.recommendations.flatMap(({ dishes }: any) =>
      dishes.map(({ id }: any) => id),
    );
    expect(new Set(returnedIds).size).toBe(3);
    expect(returnedIds).toEqual(
      expect.arrayContaining([breakfastOnly.id, flexible.id, dinner.id]),
    );
    expect(returnedIds).not.toContain(coolingDown.id);
  });

  it('presents recommendation validation errors consistently', async () => {
    const invalidCases = [
      {
        date: '2026-02-31',
        requests: [{ kind: 'dinner', count: 1 }],
      },
      {
        date: '2026-07-20',
        requests: [
          { kind: 'lunch', count: 1 },
          { kind: 'lunch', count: 1 },
        ],
      },
    ];

    for (const invalidCase of invalidCases) {
      const result = await client.callTool({
        name: 'recommend_dishes',
        arguments: { auth: { token }, ...invalidCase },
      });
      const text = (result.content as any[])[0].text;
      expect(text.toLowerCase()).toContain('invalid');
    }
  });
});
