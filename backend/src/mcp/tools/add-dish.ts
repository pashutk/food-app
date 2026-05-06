import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { createDish } from '../../services/dishes';

/**
 * MCP add_dish tool — create a new dish (authenticated write).
 */
export function registerAddDishTool(server: McpServer) {
  server.tool(
    'add_dish',
    'Create a new dish',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      name: z.string().describe('Name of the dish'),
      tags: z.array(z.string()).optional().describe('Tags for the dish'),
      takeout: z.boolean().optional().describe('Whether the dish is takeout'),
      ingredients: z.array(z.unknown()).optional().describe('Ingredients for the dish'),
      instructions: z.string().optional().describe('Cooking instructions'),
      notes: z.string().optional().describe('Additional notes'),
    },
    async (params: {
      auth: { token: string };
      name: string;
      tags?: string[];
      takeout?: boolean;
      ingredients?: unknown[];
      instructions?: string;
      notes?: string;
    }) => {
      try {
        verifyToken(params.auth.token);
        const dish = createDish({
          name: params.name,
          tags: params.tags,
          takeout: params.takeout,
          ingredients: params.ingredients,
          instructions: params.instructions,
          notes: params.notes,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ dish }),
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
