import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpServer } from './server';

let transport: StreamableHTTPServerTransport | null = null;

export function mountMCP(app: Express) {
  // Create the transport once
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => require('crypto').randomUUID(),
  });

  // Connect the MCP server to the transport once
  mcpServer.connect(transport);

  // All MCP requests go through the single transport
  app.post('/mcp', async (req: Request, res: Response) => {
    if (!transport) {
      res.status(500).json({ error: 'Transport not initialized' });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  });

  // GET for SSE notifications
  app.get('/mcp', async (req: Request, res: Response) => {
    if (!transport) {
      res.status(500).json({ error: 'Transport not initialized' });
      return;
    }
    await transport.handleRequest(req, res);
  });
}
