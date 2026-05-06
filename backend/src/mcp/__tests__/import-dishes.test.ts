import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

const PORT = 4001;
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
    try { await client.close(); } catch (_) {}
  }
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else { resolve(); }
  });
}

describe('MCP import_dishes tool', () => {
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

  it('import_dishes tool is listed by tools/list', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('import_dishes');
  });

  it('import_dishes fails without auth.token', async () => {
    const result = await client.callTool({
      name: 'import_dishes',
      arguments: { items: [{ name: 'Test' }] },
    });
    expect((result.content as any[])[0].text).toContain('error');
  });

  it('import_dishes fails with invalid token', async () => {
    const result = await client.callTool({
      name: 'import_dishes',
      arguments: { auth: { token: 'invalid' }, items: [{ name: 'Test' }] },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.error).toBeDefined();
  });

  it('import_dishes rejects case-insensitive duplicates', async () => {
    // First create a dish to conflict with
    await client.callTool({
      name: 'add_dish',
      arguments: { auth: { token }, name: 'UniqueDishForImport' },
    });
    const result = await client.callTool({
      name: 'import_dishes',
      arguments: { auth: { token }, items: [{ name: 'uniquedishforimport' }] },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.duplicates).toBeDefined();
    expect(parsed.duplicates.length).toBeGreaterThan(0);
  });

  it('import_dishes reports number imported for valid input', async () => {
    // Use unique names with timestamp to avoid conflicts
    const ts = Date.now();
    const result = await client.callTool({
      name: 'import_dishes',
      arguments: {
        auth: { token },
        items: [
          { name: `ImportedDish${ts}A`, tags: ['imported'] },
          { name: `ImportedDish${ts}B`, takeout: true },
        ],
      },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.imported).toBe(2);
  });

  it('imported dishes are visible in subsequent reads', async () => {
    // Import dishes with unique names
    const ts = Date.now();
    await client.callTool({
      name: 'import_dishes',
      arguments: {
        auth: { token },
        items: [
          { name: `ImportedDish${ts}C`, tags: ['imported'] },
        ],
      },
    });
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });
    const parsed = JSON.parse((result.content as any[])[0].text);
    const names = parsed.dishes.map((d: { name: string }) => d.name);
    expect(names).toContain(`ImportedDish${ts}C`);
  });
});
