import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { listDishes } from '../../services/dishes';

/**
 * MCP browse_dishes tool — list all dishes (authenticated read).
 */
export function registerBrowseDishesTool(server: McpServer) {
  server.tool(
    'browse_dishes',
    'List all dishes',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
    },
    async (params: { auth: { token: string } }) => {
      try {
        verifyToken(params.auth.token);
        const dishes = listDishes();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ dishes }),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: message }),
          }],
        };
      }
    }
  );
}
