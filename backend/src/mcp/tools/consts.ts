/**
 * Shared enum values for MCP tool schema descriptions.
 * These mirror the frontend types (MealTag, MealSlot) so that
 * MCP clients can see the valid values in tool parameter descriptions.
 */

export const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'];

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Description text for dish tag fields — dynamically generated from MEAL_TAGS.
 * Use MEAL_TAGS as the single source of truth — descriptions will stay in sync.
 */
export const TAGS_DESCRIPTION =
  `Tags for the dish. Valid values: ${MEAL_TAGS.join(', ')}`;

/**
 * Description text for menu entries array — documents the full shape.
 */
export const MENU_ENTRIES_DESCRIPTION =
  'Menu entries to upsert. Each entry: { slot: string (breakfast|lunch|dinner|snack), dishId: number, servings: number }';
