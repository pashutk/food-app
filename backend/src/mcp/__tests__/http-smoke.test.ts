import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

// Use a unique port for the test server to avoid conflicts
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;
let client: Client;
let transport: StreamableHTTPClientTransport;

async function startServer() {
  const app = createApp();
  return new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', reject);
  });
}

async function stopServer() {
  // Close client first
  if (client) {
    try {
      await client.close();
    } catch (_) {
      // ignore
    }
  }
  // Then close server
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      // Force close after 2s to avoid hanging
      setTimeout(() => resolve(), 2000);
    } else {
      resolve();
    }
  });
}

describe('MCP HTTP transport smoke test', () => {
  beforeAll(async () => {
    await startServer();

    // Create a single client connection for all tests
    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('initialize succeeds and returns server metadata', () => {
    // The connect() call performed initialize automatically
    expect(client.getServerVersion()).toBeDefined();
  });

  it('tools/list succeeds and includes ping tool', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('ping');
  });

  it('tools/call succeeds for ping tool', async () => {
    const result = await client.callTool({ name: 'ping', arguments: { message: 'hello' } });

    expect(result.content).toBeDefined();
    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.status).toBe('ok');
    expect(parsed.reply).toBe('hello');
    expect(parsed.timestamp).toBeDefined();
  });

  it('sequential operations succeed in same test run', async () => {
    // First call
    const result1 = await client.callTool({ name: 'ping', arguments: {} });
    expect(result1.content).toBeDefined();

    // Second call — proves no singleton/stale transport bug
    const result2 = await client.callTool({ name: 'ping', arguments: { message: 'second' } });
    const textContent = (result2.content as any[])[0].text;
    const parsed = JSON.parse(textContent);
    expect(parsed.reply).toBe('second');
  });
});
