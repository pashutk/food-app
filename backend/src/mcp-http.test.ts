/**
 * HTTP-based MCP Endpoint Tests
 *
 * Architecture:
 * - Transport: StreamableHTTPServerTransport (MCP SDK)
 * - Routes: POST /mcp (JSON-RPC requests), GET /mcp (SSE stream)
 * - Auth: JWT stored in MCP server state (via auth_login tool)
 * - Session: Stateful with UUID session IDs for multiple concurrent clients
 *
 * Key insights about StreamableHTTPServerTransport:
 * 1. In stateful mode (sessionIdGenerator set), the transport creates a session on initialize
 * 2. After initialization, ALL subsequent requests MUST include the MCP-Session-Id header
 * 3. The session ID is available via transport.sessionId AFTER the first request
 * 4. The transport handles one session at a time - use one transport per test
 * 5. The server.connect() should be called ONCE per transport lifetime
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import express, { Express } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { StreamableHTTPServerTransport } from '/opt/data/projects/food-app/backend/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js';
import { server } from './mcp-server';

process.env.AUTH_USERNAME = 'test@example.com';
process.env.AUTH_PASSWORD = 'password123';
process.env.JWT_SECRET = 'test-secret';

const TEST_DB_PATH = './data/test-mcp.db';

let testCounter = 0;

async function createTestServer(): Promise<{
  app: Express;
  server: Server;
  baseUrl: string;
  transport: StreamableHTTPServerTransport;
  sessionId: () => string | undefined;
}> {
  process.env.DB_PATH = TEST_DB_PATH;

  const port = 3001 + (++testCounter);
  const app = express();
  app.use(cors());
  app.use(express.json());

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });

  let currentSessionId: string | undefined;

  app.post('/mcp', async (req, res) => {
    await transport.handleRequest(req, res, req.body);
    if (!currentSessionId && transport.sessionId) {
      currentSessionId = transport.sessionId;
    }
  });

  app.get('/mcp', async (req, res) => {
    await transport.handleRequest(req, res);
    if (!currentSessionId && transport.sessionId) {
      currentSessionId = transport.sessionId;
    }
  });

  await server.connect(transport);

  const httpServer = app.listen(port);

  return {
    app,
    server: httpServer,
    baseUrl: `http://localhost:${port}`,
    transport,
    sessionId: () => currentSessionId ?? transport.sessionId,
  };
}

function mcpHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['MCP-Session-Id'] = sessionId;
  }
  return headers;
}

async function mcpInitialize(baseUrl: string, sessionId?: string): Promise<string> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Initialize failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const newSessionId = response.headers.get('MCP-Session-Id') ?? sessionId;
  return newSessionId ?? '';
}

async function mcpInitialized(baseUrl: string, sessionId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Initialized notification failed: ${response.status}`);
  }
}

describe('MCP HTTP Endpoint', () => {
  let testServer: {
    app: Express;
    server: Server;
    baseUrl: string;
    transport: StreamableHTTPServerTransport;
    sessionId: () => string | undefined;
  };

  beforeEach(async () => {
    testServer = await createTestServer();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    if (testServer.transport) {
      try {
        await testServer.transport.close();
      } catch {
        // Ignore close errors
      }
    }
    await new Promise<void>((resolve) => {
      testServer.server.close(() => resolve());
    });
  });

  it('completes MCP protocol initialization via HTTP POST', async () => {
    const response = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.serverInfo).toEqual({ name: 'food-app-mcp', version: '1.0.0' });
    const sessionId = response.headers.get('MCP-Session-Id');
    expect(sessionId).toBeTruthy();
  });

  it('rejects requests without valid JSON-RPC body', async () => {
    const response = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: 'not valid json',
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('calls auth_login tool via HTTP POST', async () => {
    const sessionId = await mcpInitialize(testServer.baseUrl);
    await mcpInitialized(testServer.baseUrl, sessionId);

    const resp = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'auth_login',
          arguments: { username: 'test@example.com', password: 'password123' },
        },
      }),
    });

    expect(resp.status).toBe(200);
    const result = await resp.json() as any;
    expect(result.result.content[0].text).toContain('Authentication successful');
  });

  it('returns error when calling tool without authentication', async () => {
    const sessionId = await mcpInitialize(testServer.baseUrl);
    await mcpInitialized(testServer.baseUrl, sessionId);

    const resp = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_dishes', arguments: {} },
      }),
    });

    const result = await resp.json() as any;
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('Not authenticated');
  });

  it('lists available tools', async () => {
    const sessionId = await mcpInitialize(testServer.baseUrl);
    await mcpInitialized(testServer.baseUrl, sessionId);

    const resp = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });

    const result = await resp.json() as any;
    const toolNames = result.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('auth_login');
    expect(toolNames).toContain('list_dishes');
    expect(toolNames).toContain('get_shopping_list');
  });

  it('calls list_dishes after authentication', async () => {
    const sessionId = await mcpInitialize(testServer.baseUrl);
    await mcpInitialized(testServer.baseUrl, sessionId);

    const loginResp = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'auth_login', arguments: {} },
      }),
    });
    expect(loginResp.status).toBe(200);

    const dishesResp = await fetch(`${testServer.baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_dishes', arguments: {} },
      }),
    });

expect(dishesResp.status).toBe(200);
    const result = await dishesResp.json() as any;
    const dishes = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(dishes)).toBe(true);
  });
});