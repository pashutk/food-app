import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { upsertMenu } from '../../services/menus';

/**
 * MCP update_menu tool — upsert a menu for a date (authenticated write).
 */
export function registerUpdateMenuTool(server: McpServer) {
  server.tool(
    'update_menu',
    'Update or create a menu for a specific date',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      date: z.string().describe('Date of the menu (YYYY-MM-DD)'),
      entries: z.array(z.any()).describe('Menu entries to upsert'),
    },
    async (params: {
      auth: { token: string };
      date: string;
      entries: unknown[];
    }) => {
      try {
        verifyToken(params.auth.token);
        const menu = upsertMenu(params.date, params.entries as Record<string, unknown>[]);
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
