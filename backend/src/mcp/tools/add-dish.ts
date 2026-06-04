import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { createDish } from '../../services/dishes';
import { MEAL_TAGS, tagsDescription } from './consts';
import { IngredientSchema, ingredientsDescription } from './schemas';

type Ingredient = { name: string; quantity: number; unit: string };

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
      tags: z.array(z.string()).optional().describe(tagsDescription()),
      takeout: z.boolean().optional().describe('Whether the dish is takeout'),
      ingredients: z.array(IngredientSchema).optional().describe(ingredientsDescription()),
      instructions: z.string().optional().describe('Cooking instructions'),
      notes: z.string().optional().describe('Additional notes'),
    },
    async (params) => {
      try {
        verifyToken(params.auth.token);
        const dish = createDish({
          name: params.name,
          tags: params.tags,
          takeout: params.takeout,
          ingredients: params.ingredients as Ingredient[] | undefined,
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
