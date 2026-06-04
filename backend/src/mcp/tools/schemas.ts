import { z } from 'zod';

/**
 * Ingredient schema for MCP tool inputs.
 * Matches the frontend Ingredient interface: { name, quantity, unit }.
 */
export const IngredientSchema = z.object({
  name: z.string().describe('Ingredient name (e.g. "flour", "eggs")'),
  quantity: z.number().describe('Quantity amount (e.g. 2, 0.5, 300)'),
  unit: z.string().describe('Unit of measurement (e.g. "g", "ml", "pieces", "cups")'),
});

/**
 * Description string for the ingredients field.
 */
export function ingredientsDescription() {
  return 'Ingredients for the dish. Each ingredient: { name: string, quantity: number, unit: string }';
}