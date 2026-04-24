/**
 * Debug script to understand StreamableHTTPServerTransport behavior
 * Run with: node debug-mcp-http.mjs
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

const PORT = 3002;

// Create our own server instance for testing
const server = new McpServer({
  name: "food-app-mcp",
  version: "1.0.0",
});

// Add a simple tool
server.tool(
  "test_tool",
  "A test tool",
  { input: z.string().optional() },
  async ({ input }) => {
    return { content: [{ type: "text", text: `Hello ${input ?? 'world'}!` }] };
  }
);

import { z } from 'zod';

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Create transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  console.log('Created transport, connecting...');
  
  try {
    await server.connect(transport);
    console.log('Connected successfully');
  } catch (err) {
    console.error('Connect error:', err.message);
    process.exit(1);
  }

  app.post('/mcp', async (req, res) => {
    console.log('POST /mcp received, sessionId:', transport.sessionId);
    try {
      await transport.handleRequest(req, res, req.body);
      console.log('handleRequest completed');
    } catch (err) {
      console.error('handleRequest error:', err.message);
    }
  });

  const httpServer = app.listen(PORT);
  console.log(`Server listening on ${PORT}`);

  // Give server time to start
  await new Promise((r) => setTimeout(r, 500));

  // Send initialize request
  console.log('\n--- Sending initialize request ---');
  try {
    const initRes = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });
    console.log('Initialize status:', initRes.status);
    const initBody = await initRes.json();
    console.log('Initialize response:', JSON.stringify(initBody, null, 2));
  } catch (err) {
    console.error('Initialize fetch error:', err.message);
  }

  // Send initialized notification
  console.log('\n--- Sending notifications/initialized ---');
  try {
    const notifRes = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    console.log('Notification status:', notifRes.status);
    const notifBody = await notifRes.text();
    console.log('Notification response:', notifBody);
  } catch (err) {
    console.error('Notification fetch error:', err.message);
  }

  // Send tools/list request
  console.log('\n--- Sending tools/list request ---');
  try {
    const toolsRes = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    console.log('Tools list status:', toolsRes.status);
    const toolsBody = await toolsRes.json();
    console.log('Tools list response:', JSON.stringify(toolsBody, null, 2));
  } catch (err) {
    console.error('Tools list fetch error:', err.message);
  }

  // Send a tool call
  console.log('\n--- Sending tools/call request ---');
  try {
    const toolRes = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'test_tool', arguments: { input: 'debug' } },
      }),
    });
    console.log('Tool call status:', toolRes.status);
    const toolBody = await toolRes.json();
    console.log('Tool call response:', JSON.stringify(toolBody, null, 2));
  } catch (err) {
    console.error('Tool call fetch error:', err.message);
  }

  // Cleanup
  console.log('\n--- Cleaning up ---');
  await transport.close();
  await new Promise((resolve) => httpServer.close(() => resolve()));
  console.log('Done');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
