import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

/**
 * Multi-client lifecycle tests.
 *
 * Proves that the MCP HTTP adapter correctly handles multiple independent
 * client sessions without singleton transport state leakage.
 *
 * Before the fix: a second client would get "Server already initialized"
 * because the singleton transport rejected re-initialization.
 */

const PORT = 4012;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;

async function startServer() {
  const app = createApp();
  return new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', reject);
  });
}

async function stopServer() {
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else {
      resolve();
    }
  });
}

async function connectClient(name: string) {
  const transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
  const client = new Client(
    { name, version: '0.1.0' },
    { capabilities: {} }
  );
  await client.connect(transport);
  return { transport, client };
}

describe('MCP multi-client lifecycle', () => {
  beforeAll(async () => {
    await startServer();
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  it('allows a second fresh client to initialize after the first client lifecycle ends', async () => {
    // Client A: initialize, use tools, close
    const { client: clientA } = await connectClient('client-a');

    const toolsA = await clientA.listTools();
    expect(toolsA.tools.length).toBeGreaterThan(0);
    expect(toolsA.tools.some((t: any) => t.name === 'ping')).toBe(true);

    await clientA.close();

    // Client B: initialize fresh — this previously failed with "Server already initialized"
    const { client: clientB } = await connectClient('client-b');

    const toolsB = await clientB.listTools();
    expect(toolsB.tools.length).toBeGreaterThan(0);
    expect(toolsB.tools.some((t: any) => t.name === 'ping')).toBe(true);

    await clientB.close();
  });

  it('allows three sequential clients without degradation', async () => {
    for (let i = 1; i <= 3; i++) {
      const { client } = await connectClient(`seq-client-${i}`);

      const result = await client.callTool({ name: 'ping', arguments: { message: `client-${i}` } });
      const textContent = (result.content as any[])[0].text;
      const parsed = JSON.parse(textContent);
      expect(parsed.reply).toBe(`client-${i}`);

      await client.close();
    }
  });

  it('allows concurrent clients to initialize independently', async () => {
    // Create and connect 3 clients concurrently
    const connectedClients = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => {
        return connectClient(`concurrent-client-${i}`);
      })
    );

    // Each client should be able to use tools independently
    const toolResults = await Promise.all(
      connectedClients.map(async ({ client }, i) => {
        const result = await client.callTool({
          name: 'ping',
          arguments: { message: `concurrent-${i}` },
        });
        const textContent = (result.content as any[])[0].text;
        const parsed = JSON.parse(textContent);
        return parsed.reply;
      })
    );

    // Verify each client got its own response
    for (let i = 0; i < 3; i++) {
      expect(toolResults[i]).toBe(`concurrent-${i}`);
    }

    // Clean up
    for (const { client } of connectedClients) {
      await client.close();
    }
  });

  it('isolates sessions between concurrent clients', async () => {
    const { client: clientA } = await connectClient('isolation-client-a');
    const { client: clientB } = await connectClient('isolation-client-b');

    // Both clients should see the same tools (proves both sessions are valid)
    const toolsA = await clientA.listTools();
    const toolsB = await clientB.listTools();

    expect(toolsA.tools.map((t: any) => t.name)).toEqual(
      toolsB.tools.map((t: any) => t.name)
    );

    await clientA.close();
    await clientB.close();
  });
});
