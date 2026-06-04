import { z } from 'zod';

/**
 * Ingredient schema — mirrors the frontend Ingredient interface.
 * Validates that each ingredient has name (string), quantity (number), and unit (string).
 */
export const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

/**
 * Type derived from the schema — use instead of unknown[] in service interfaces.
 */
export type Ingredient = z.infer<typeof IngredientSchema>;

/**
 * Validate and coerce an ingredients array.
 * Returns { ok: true, data } on success, or { ok: false, message } on failure.
 */
export function validateIngredients(
  input: unknown,
): { ok: true; data: Ingredient[] } | { ok: false; message: string } {
  if (input === undefined || input === null) {
    return { ok: true, data: [] };
  }

  if (!Array.isArray(input)) {
    return { ok: false, message: 'Ingredients must be an array' };
  }

  const results = input.map((item) => {
    const result = IngredientSchema.safeParse(item);
    return result.success ? { ok: true, data: result.data } : { ok: false as const };
  });

  const failures = results.filter((r) => !('ok' in r) || !r.ok);
  if (failures.length > 0) {
    const badIndices = results
      .map((r, i) => (!r.ok ? String(i) : null))
      .filter(Boolean)
      .join(', ');
    return {
      ok: false,
      message: `Invalid ingredient(s) at index ${badIndices} — expected { name: string, quantity: number, unit: string }`,
    };
  }

  return {
    ok: true,
    data: results.map((r) => (r as { ok: true; data: Ingredient }).data),
  };
}

/**
 * Validate and coerce a tags array.
 */
export function validateTags(
  input: unknown,
): { ok: true; data: string[] } | { ok: false; message: string } {
  if (input === undefined || input === null) {
    return { ok: true, data: [] };
  }

  if (!Array.isArray(input)) {
    return { ok: false, message: 'Tags must be an array' };
  }

  const nonStrings = input.filter((t) => typeof t !== 'string');
  if (nonStrings.length > 0) {
    return { ok: false, message: 'All tags must be strings' };
  }

  return { ok: true, data: input as string[] };
}
