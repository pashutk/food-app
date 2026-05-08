import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerLoginTool } from './tools/login';
import { registerReadTools, registerMutationTools } from './tools/index';

/**
 * Factory that creates a fresh McpServer instance.
 *
 * Each call returns an independent server with all tools registered.
 * This is required because McpServer.connect(transport) assumes
 * exclusive ownership of the transport — reusing one McpServer across
 * multiple transports (or one transport across multiple clients)
 * violates the SDK contract and causes "Server already initialized"
 * errors when a second client connects.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'food-app-mcp',
    version: '0.1.0',
  });

  // Ping tool
  server.tool(
    'ping',
    'Ping the server to check if it is alive',
    { message: z.string().optional().describe('Optional message to echo back') },
    async (params) => {
      const msg = params?.message ?? 'pong';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              reply: msg,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    }
  );

  // Login tool
  registerLoginTool(server);

  // Read tools
  registerReadTools(server);

  // Mutation tools
  registerMutationTools(server);

  return server;
}

/**
 * @deprecated Kept for backward compatibility during migration.
 * Use createMcpServer() for new code. This singleton is NOT safe
 * for multi-client scenarios — it will reject the second client
 * with "Server already initialized".
 */
export const mcpServer = createMcpServer();
