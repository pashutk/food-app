import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpServer } from './server';

/**
 * MCP HTTP Transport Adapter
 *
 * Singleton transport pattern: one transport, one server connection.
 * All MCP requests route through this single transport.
 * This is the SDK-required pattern — mcpServer.connect() can only be called once.
 */

let transport: StreamableHTTPServerTransport | null = null;

export function mountMCP(app: Express) {
  // Create the transport once
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => require('crypto').randomUUID(),
  });

  // Connect the MCP server to the transport once
  mcpServer.connect(transport);

  // POST: MCP request handling
  app.post('/mcp', async (req: Request, res: Response) => {
    if (!transport) {
      res.status(500).json({ error: 'Transport not initialized' });
      return;
    }
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // GET: SSE notifications
  app.get('/mcp', async (req: Request, res: Response) => {
    if (!transport) {
      res.status(500).json({ error: 'Transport not initialized' });
      return;
    }
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
}