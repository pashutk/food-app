import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { importDishes } from '../../services/dishes';

/**
 * MCP import_dishes tool — bulk import dishes (authenticated write).
 */
export function registerImportDishesTool(server: McpServer) {
  server.tool(
    'import_dishes',
    'Bulk import dishes. Fails if any dish name already exists (case-insensitive).',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      items: z.array(
        z.object({
          name: z.string().describe('Name of the dish'),
          tags: z.array(z.string()).optional().describe('Tags for the dish'),
          takeout: z.boolean().optional().describe('Whether the dish is takeout'),
          ingredients: z.array(z.unknown()).optional().describe('Ingredients for the dish'),
          instructions: z.string().optional().describe('Cooking instructions'),
          notes: z.string().optional().describe('Additional notes'),
        }),
      ).describe('Array of dishes to import'),
    },
    async (params: {
      auth: { token: string };
      items: Array<{
        name: string;
        tags?: string[];
        takeout?: boolean;
        ingredients?: unknown[];
        instructions?: string;
        notes?: string;
      }>;
    }) => {
      try {
        verifyToken(params.auth.token);
        const result = importDishes(params.items);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result),
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
