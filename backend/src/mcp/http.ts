import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server';

/**
 * MCP HTTP Transport Adapter — per-session transport lifecycle.
 *
 * Each client session gets its own StreamableHTTPServerTransport +
 * McpServer pair, registered in a session map. This avoids the
 * singleton-transport bug where one shared transport would reject
 * a second client with "Server already initialized".
 *
 * The SDK contract (McpServer.connect docs) states that the server
 * "assumes ownership of the Transport, replacing any callbacks that
 * have already been set, and expects that it is the only user of the
 * Transport instance going forward." A singleton violates this.
 *
 * Session lifecycle:
 * - Incoming request without Mcp-Session-Id → create new transport+server
 * - Incoming request with Mcp-Session-Id → route to existing transport
 * - Session cleanup on transport close (onclose callback)
 */

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
}

const sessions = new Map<string, SessionEntry>();

function getSessionIdFromRequest(req: Request): string | undefined {
  // The MCP SDK uses the Mcp-Session-Id header
  return (
    req.headers['mcp-session-id'] as string | undefined
  ) || undefined;
}

function cleanupSession(sessionId: string) {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.server.close().catch(() => {});
    entry.transport.close().catch(() => {});
    sessions.delete(sessionId);
  }
}

export function mountMCP(app: Express) {
  async function handleMCPRequest(
    req: Request,
    res: Response,
    parsedBody?: unknown
  ) {
    const sessionId = getSessionIdFromRequest(req);

    if (sessionId) {
      // Route to existing session
      const entry = sessions.get(sessionId);
      if (!entry) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      try {
        await entry.transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
      return;
    }

    // No session ID — create a new transport+server pair
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => require('crypto').randomUUID(),
    });

    const server = createMcpServer();
    await server.connect(transport);

    // Register onclose to clean up when the session ends
    transport.onclose = () => {
      // The sessionId is set after the first request (initialize)
      // We'll clean up based on the transport's sessionId
      const sid = transport.sessionId;
      if (sid) {
        cleanupSession(sid);
      }
    };

    // Store before handling — the initialize response will set the sessionId
    try {
      await transport.handleRequest(req, res, parsedBody);

      // After initialize, the transport has a sessionId. Register it.
      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { transport, server });
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
      // Clean up on error
      server.close().catch(() => {});
      transport.close().catch(() => {});
    }
  }

  // POST: MCP request handling
  app.post('/mcp', async (req: Request, res: Response) => {
    await handleMCPRequest(req, res, req.body);
  });

  // GET: SSE notifications
  app.get('/mcp', async (req: Request, res: Response) => {
    await handleMCPRequest(req, res);
  });

  // DELETE: session termination
  app.delete('/mcp', async (req: Request, res: Response) => {
    await handleMCPRequest(req, res);
  });
}
