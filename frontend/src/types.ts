export type MealTag = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'drink';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Dish {
  id: number;
  name: string;
  tags: MealTag[];
  takeout: boolean;
  ingredients: Ingredient[];
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MenuEntry {
  slot: MealSlot;
  dishId: number;
  servings: number;
}

export interface DailyMenu {
  date: string;
  entries: MenuEntry[];
}

export interface MealLog {
  id: number;
  date: string;
  dishId: number;
  slot: MealSlot | null;
  created_at: string;
  updated_at: string;
}

export interface MealLogWithDish extends MealLog {
  dish: Pick<Dish, 'id' | 'name'>;
}
