import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, ZodError } from 'zod';
import { executeEndpoint, getMcpEndpoints, isEndpointError } from '../endpoints';
import { verifyToken } from '../services/auth';

const authTokenSchema = z
  .object({
    token: z.string().describe('JWT token for authentication'),
  })
  .describe('Authentication token');

function toToolResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function formatMcpError(error: unknown) {
  if (error instanceof ZodError) {
    return { error: 'Invalid arguments', details: error.issues };
  }

  if (isEndpointError(error)) {
    return error.mcpBody ?? { error: error.message };
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return { error: message };
}

function stripAuth<T extends { auth: unknown }>(params: T): Omit<T, 'auth'> {
  const { auth: _auth, ...rest } = params;
  return rest;
}

function registerEndpointTools(server: McpServer) {
  for (const endpoint of getMcpEndpoints()) {
    const toolSchema =
      endpoint.auth === 'protected'
        ? endpoint.inputSchema.extend({ auth: authTokenSchema })
        : endpoint.inputSchema;

    server.tool(endpoint.name, endpoint.description, toolSchema.shape, async (rawParams: any) => {
      try {
        const params = toolSchema.parse(rawParams) as any;

        if (endpoint.auth === 'protected') {
          verifyToken(params.auth.token);
        }

        const rawInput = endpoint.auth === 'protected' ? stripAuth(params) : params;
        const input = endpoint.inputSchema.parse(rawInput);
        const output = await executeEndpoint(endpoint, input);
        const body = endpoint.mcp?.presentSuccess ? endpoint.mcp.presentSuccess(output) : output;
        return toToolResult(body);
      } catch (error) {
        return toToolResult(formatMcpError(error));
      }
    });
  }
}

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

  registerEndpointTools(server);

  return server;
}

/**
 * @deprecated Kept for backward compatibility during migration.
 * Use createMcpServer() for new code. This singleton is NOT safe
 * for multi-client scenarios — it will reject the second client
 * with "Server already initialized".
 */
export const mcpServer = createMcpServer();
