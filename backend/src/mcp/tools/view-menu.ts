import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { getMenu } from '../../services/menus';

/**
 * MCP view_menu tool — view the menu for a specific date (authenticated read).
 */
export function registerViewMenuTool(server: McpServer) {
  server.tool(
    'view_menu',
    'View the menu for a specific date',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      date: z.string().describe('Menu date in YYYY-MM-DD format'),
    },
    async (params: { auth: { token: string }; date: string }) => {
      try {
        verifyToken(params.auth.token);
        const menu = getMenu(params.date);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(menu),
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
