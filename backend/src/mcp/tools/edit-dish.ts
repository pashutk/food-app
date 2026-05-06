import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { updateDish } from '../../services/dishes';

/**
 * MCP edit_dish tool — update an existing dish (authenticated).
 */
export function registerEditDishTool(server: McpServer) {
  server.tool(
    'edit_dish',
    'Update an existing dish',
    {
      auth: z.object({
        token: z.string().describe('JWT token for authentication'),
      }).describe('Authentication token'),
      id: z.string().describe('ID of the dish to update'),
      name: z.string().describe('Dish name'),
      tags: z.array(z.string()).optional().describe('Tags'),
      takeout: z.boolean().optional().describe('Takeout flag'),
      ingredients: z.array(z.unknown()).optional().describe('Ingredients'),
      instructions: z.string().optional().describe('Instructions'),
      notes: z.string().optional().describe('Notes'),
    },
    async (params: {
      auth: { token: string };
      id: string;
      name: string;
      tags?: string[];
      takeout?: boolean;
      ingredients?: unknown[];
      instructions?: string;
      notes?: string;
    }) => {
      try {
        verifyToken(params.auth.token);
        const result = updateDish(params.id, {
          name: params.name,
          tags: params.tags,
          takeout: params.takeout,
          ingredients: params.ingredients,
          instructions: params.instructions,
          notes: params.notes,
        });
        if (!result.found) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'Dish not found' }),
            }],
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ dish: result.dish }),
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
