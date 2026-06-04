/**
 * Shared enum values for MCP tool schema descriptions.
 * These mirror the frontend types (MealTag, MealSlot) so that
 * MCP clients can see the valid values in tool parameter descriptions.
 */

export const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'];

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Description text for dish tag fields — lists all valid MealTag values.
 */
export const TAGS_DESCRIPTION =
  'Tags for the dish. Valid values: breakfast, lunch, dinner, snack, dessert, drink';

/**
 * Description text for menu slot fields — lists all valid MealSlot values.
 */
export const SLOT_DESCRIPTION =
  'Meal slot. Valid values: breakfast, lunch, dinner, snack';

/**
 * Description text for menu entries array — documents the full shape.
 */
export const MENU_ENTRIES_DESCRIPTION =
  'Menu entries to upsert. Each entry: { slot: string (breakfast|lunch|dinner|snack), dishId: number, servings: number }';
