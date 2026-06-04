/**
 * Shared enum values for MCP tool schema descriptions.
 * Single source of truth — descriptions are derived from this array.
 */

export const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'] as const;

/**
 * Description text derived from the array — always in sync.
 */
export function tagsDescription() {
  return `Tags for the dish. Valid values: ${MEAL_TAGS.join(', ')}`;
}
