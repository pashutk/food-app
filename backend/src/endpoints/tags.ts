export const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'] as const;

export function tagsDescription() {
  return `Tags for the dish. Valid values: ${MEAL_TAGS.join(', ')}`;
}
