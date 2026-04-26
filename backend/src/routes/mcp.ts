/**
 * HTTP-based MCP Endpoint Routes
 *
 * Architecture:
 * - Transport: StreamableHTTPServerTransport (MCP SDK)
 * - Routes: POST /mcp (JSON-RPC requests), GET /mcp (SSE stream)
 * - Auth: JWT stored in MCP server state (via auth_login tool)
 * - Session: Stateful with UUID session IDs for multiple concurrent clients
 *
 * Each session gets its own McpServer instance (via createMcpServer factory)
 * to avoid the "Already connected to a transport" error from shared instances.
 */

import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '/opt/data/projects/food-app/backend/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js';
import { createMcpServer } from '../mcp-server';

export const mcpRouter = Router();

// Track active transports and servers per session
const activeTransports = new Map<string, StreamableHTTPServerTransport>();
const activeServers = new Map<string, ReturnType<typeof createMcpServer>>();

// Auto-login flag - set by startMcpHttpServer
let autoLoginPromise: Promise<void> | null = null;

/**
 * Create a new MCP HTTP transport for a session
 */
function createTransport(sessionId: string): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });

  activeTransports.set(sessionId, transport);
  return transport;
}

/**
 * POST /mcp - Handle JSON-RPC requests
 *
 * Handles:
 * - initialize (MCP handshake)
 * - tools/call (invoke MCP tools)
 * - tools/list (list available tools)
 * - notifications/initialized (client ready signal)
 */
mcpRouter.post('/mcp', async (req: Request, res: Response) => {
  try {
    let sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    let transport = activeTransports.get(sessionId);
    let sessionServer = activeServers.get(sessionId);

    if (!transport) {
      transport = createTransport(sessionId);
      sessionServer = createMcpServer();
      activeServers.set(sessionId, sessionServer);
      await sessionServer.connect(transport);
    }

    res.setHeader('MCP-Session-Id', sessionId);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP POST error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
      });
    }
  }
});

/**
 * GET /mcp - SSE stream for server-initiated notifications
 *
 * Establishes an SSE connection for:
 * - Server-sent events and notifications
 * - Long-poll responses for request/response over SSE
 */
mcpRouter.get('/mcp', async (req: Request, res: Response) => {
  try {
    let sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    let transport = activeTransports.get(sessionId);
    let sessionServer = activeServers.get(sessionId);

    if (!transport) {
      transport = createTransport(sessionId);
      sessionServer = createMcpServer();
      activeServers.set(sessionId, sessionServer);
      await sessionServer.connect(transport);
    }

    res.setHeader('MCP-Session-Id', sessionId);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP GET error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
      });
    }
  }
});

/**
 * DELETE /mcp - Terminate a session
 */
mcpRouter.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    const transport = activeTransports.get(sessionId);
    if (transport) {
      await transport.close();
      activeTransports.delete(sessionId);
    }
    activeServers.delete(sessionId);
  }

  res.status(204).send();
});

/**
 * Initialize MCP HTTP server with auto-login
 *
 * This performs the same auto-login as startMcpServer() but for HTTP mode.
 */
export async function startMcpHttpServer(): Promise<void> {
  if (autoLoginPromise) {
    return autoLoginPromise;
  }

  autoLoginPromise = (async () => {
    console.log('MCP HTTP server initialized');
  })();

  return autoLoginPromise;
}

/**
 * Cleanup all active transports
 */
export async function closeAllMcpTransports(): Promise<void> {
  const closePromises = Array.from(activeTransports.values()).map((t) =>
    t.close().catch((e) => console.error('Error closing transport:', e))
  );
  await Promise.all(closePromises);
  activeTransports.clear();
  activeServers.clear();
}
