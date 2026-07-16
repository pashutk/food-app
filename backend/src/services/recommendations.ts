import db from '../db';
import { parse, type DishRow, type ParsedDish } from './dishes';
import type { MealSlot } from './mealLogs';

export interface RecommendationRequest {
  kind: MealSlot;
  count: number;
}

export interface RecommendDishesInput {
  date: string;
  requests: RecommendationRequest[];
}

export interface RecommendationGroup {
  kind: MealSlot;
  requested: number;
  dishes: ParsedDish[];
}

export interface RecommendationResult {
  date: string;
  recommendations: RecommendationGroup[];
}

interface RequestedPosition {
  groupIndex: number;
  kind: MealSlot;
}

function loadEligibleDishes(date: string): ParsedDish[] {
  const rows = db
    .prepare(
      `SELECT dishes.*
       FROM dishes
       WHERE NOT EXISTS (
         SELECT 1
         FROM meal_logs
         WHERE meal_logs.dish_id = dishes.id
           AND meal_logs.date BETWEEN date(?, '-2 days') AND ?
       )
       ORDER BY RANDOM()`,
    )
    .all(date, date) as DishRow[];

  return rows.map(parse);
}

function allocateDishes(
  dishes: ParsedDish[],
  requests: RecommendationRequest[],
): ParsedDish[][] {
  const positions: RequestedPosition[] = requests.flatMap((request, groupIndex) =>
    Array.from({ length: request.count }, () => ({
      groupIndex,
      kind: request.kind,
    })),
  );
  const candidatesByKind = new Map<MealSlot, number[]>();

  for (const position of positions) {
    if (!candidatesByKind.has(position.kind)) {
      candidatesByKind.set(
        position.kind,
        dishes.flatMap((dish, dishIndex) =>
          dish.tags.includes(position.kind) ? [dishIndex] : [],
        ),
      );
    }
  }

  const assignedPositionByDish = new Map<number, number>();

  function assign(positionIndex: number, visitedDishes: Set<number>): boolean {
    const position = positions[positionIndex];
    const candidates = candidatesByKind.get(position.kind) ?? [];

    for (const dishIndex of candidates) {
      if (visitedDishes.has(dishIndex)) {
        continue;
      }
      visitedDishes.add(dishIndex);

      const assignedPosition = assignedPositionByDish.get(dishIndex);
      if (
        assignedPosition === undefined
        || assign(assignedPosition, visitedDishes)
      ) {
        assignedPositionByDish.set(dishIndex, positionIndex);
        return true;
      }
    }

    return false;
  }

  for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
    assign(positionIndex, new Set());
  }

  const dishByPosition = new Map<number, ParsedDish>();
  for (const [dishIndex, positionIndex] of assignedPositionByDish) {
    dishByPosition.set(positionIndex, dishes[dishIndex]);
  }

  const groups = requests.map(() => [] as ParsedDish[]);
  positions.forEach((position, positionIndex) => {
    const dish = dishByPosition.get(positionIndex);
    if (dish) {
      groups[position.groupIndex].push(dish);
    }
  });

  return groups;
}

export function recommendDishes(input: RecommendDishesInput): RecommendationResult {
  const dishes = loadEligibleDishes(input.date);
  const allocated = allocateDishes(dishes, input.requests);

  return {
    date: input.date,
    recommendations: input.requests.map((request, index) => ({
      kind: request.kind,
      requested: request.count,
      dishes: allocated[index],
    })),
  };
}
