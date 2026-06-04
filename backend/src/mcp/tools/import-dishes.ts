import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifyToken } from '../../services/auth';
import { importDishes } from '../../services/dishes';
import { MEAL_TAGS, tagsDescription } from './consts';
import { IngredientSchema, ingredientsDescription } from './schemas';

type Ingredient = { name: string; quantity: number; unit: string };

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
          tags: z.array(z.string()).optional().describe(tagsDescription()),
          takeout: z.boolean().optional().describe('Whether the dish is takeout'),
          ingredients: z.array(IngredientSchema).optional().describe(ingredientsDescription()),
          instructions: z.string().optional().describe('Cooking instructions'),
          notes: z.string().optional().describe('Additional notes'),
        }),
      ).describe('Array of dishes to import'),
    },
    async (params) => {
      try {
        verifyToken(params.auth.token);
        const result = importDishes(
          params.items.map((item) => ({
            name: item.name,
            tags: item.tags,
            takeout: item.takeout,
            ingredients: item.ingredients as Ingredient[] | undefined,
            instructions: item.instructions,
            notes: item.notes,
          })),
        );
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
