import { describe, it, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import type { Server } from 'http';

const PORT = 4003;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;

describe('MCP transport termination', () => {
  afterAll(() => {
    if (server) {
      server.close();
    }
  }, 5000);

  it('DELETE /mcp does not return 404', async () => {
    // Start a fresh server for this test
    const app = createApp();
    server = await new Promise<Server>((resolve, reject) => {
      const s = app.listen(PORT, () => resolve(s));
      s.on('error', reject);
    });

    // First POST to initialize a session
    const initRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.1.0' },
        },
      }),
    });
    expect(initRes.status).toBe(200);

    // Extract session ID from response headers
    const sessionId = initRes.headers.get('Mcp-Session-Id');
    expect(sessionId).not.toBeNull();

    // Now DELETE should NOT return 404
    const deleteRes = await fetch(BASE_URL, {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionId!,
      },
    });

    // DELETE should succeed (200) or return a meaningful error — NOT 404
    expect(deleteRes.status).not.toBe(404);
    expect(deleteRes.status).toBe(200);
  }, 15000);
});
