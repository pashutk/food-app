import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { deleteDish } from '../../services/dishes';

/**
 * MCP remove_dish tool — delete a dish by id (authenticated).
 */
export function registerRemoveDishTool(server: McpServer) {
  server.tool(
    'remove_dish',
    'Delete a dish by id',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      id: z.string().describe('ID of the dish to delete'),
    },
    async (params: { auth: { token: string }; id: string }) => {
      try {
        verifyToken(params.auth.token);
        const result = deleteDish(params.id);
        if (!result.found) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Dish with id ${params.id} not found` }),
            }],
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true }),
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
