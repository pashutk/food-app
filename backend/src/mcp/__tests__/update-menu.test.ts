import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = 4002;
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
    try { await client.close(); } catch (_) {}
  }
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else { resolve(); }
  });
}

describe('MCP update_menu tool', () => {
  beforeAll(async () => {
    await startServer();
    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(transport);
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    token = loginData.token;
  }, 10000);

  afterAll(async () => { await stopServer(); }, 5000);

  it('update_menu tool is listed by tools/list', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('update_menu');
  });

  it('update_menu fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'update_menu',
      arguments: { date: '2026-05-06', entries: [{ dish: 'Test' }] },
    });
    expect((result.content as any[])[0].text).toContain('error');
  });

  it('update_menu fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'update_menu',
      arguments: { auth: { token: 'invalid' }, date: '2026-05-06', entries: [{ dish: 'Test' }] },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.error).toBeDefined();
  });

  it('update_menu returns { date, entries } for valid input', async () => {
    const testDate = '2026-05-06';
    const testEntries = [{ dish: 'Breakfast' }, { dish: 'Lunch' }];
    const result = await client.callTool({
      name: 'update_menu',
      arguments: { auth: { token }, date: testDate, entries: testEntries },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.date).toBe(testDate);
    expect(parsed.entries).toEqual(testEntries);
  });

  it('subsequent view_menu sees the updated entries', async () => {
    const testDate = '2026-05-06';
    await client.callTool({
      name: 'update_menu',
      arguments: { auth: { token }, date: testDate, entries: [{ dish: 'Dinner' }] },
    });
    const result = await client.callTool({
      name: 'view_menu',
      arguments: { auth: { token }, date: testDate },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.date).toBe(testDate);
    expect(parsed.entries[0].dish).toBe('Dinner');
  });
});
