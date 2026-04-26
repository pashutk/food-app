import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { login, verifyToken } from "./services/auth";
import { getMenu, setMenu, type MenuEntry, type DailyMenu } from "./services/menus";
import { listDishes, createDish, updateDish, deleteDish, importDishes, type DishData, type Dish } from "./routes/dishes";
export type { DailyMenu } from './services/menus';
export type { Dish } from './routes/dishes';

const AUTH_EMAIL = process.env.AUTH_EMAIL!;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD!;

let jwtToken: string | null = null;

type MealTag = "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "drink";
type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface ShoppingItem {
  name: string;
  quantity: number;
  unit: string;
}

export function aggregateShoppingList(
  menu: DailyMenu,
  dishMap: Map<number, Dish>
): ShoppingItem[] {
  const aggregated = new Map<string, ShoppingItem>();

  for (const entry of menu.entries) {
    const dish = dishMap.get(entry.dishId);
    if (!dish || dish.takeout) continue;

    for (const ing of dish.ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
      const scaledQty = ing.quantity * entry.servings;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + scaledQty) * 1000) / 1000;
      } else {
        aggregated.set(key, { name: ing.name, quantity: scaledQty, unit: ing.unit });
      }
    }
  }

  return Array.from(aggregated.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function requireAuth(): void {
  if (!jwtToken) {
    throw new Error("Not authenticated. Call auth_login first.");
  }
  const username = verifyToken(jwtToken);
  if (!username) {
    jwtToken = null;
    throw new Error("Invalid or expired token. Call auth_login again.");
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "food-app-mcp",
    version: "1.0.0",
  });

  server.tool(
    "auth_login",
    "Authenticate with the food-app and obtain a JWT token. The token is stored internally and used for all subsequent requests. Uses AUTH_EMAIL and AUTH_PASSWORD env vars if username/password are omitted.",
    {
      username: z
        .string()
        .optional()
        .describe(
          "Username to authenticate with. Falls back to AUTH_EMAIL env var."
        ),
      password: z
        .string()
        .optional()
        .describe(
          "Password to authenticate with. Falls back to AUTH_PASSWORD env var."
        ),
    },
    async ({ username, password }) => {
      const user = username ?? AUTH_EMAIL;
      const pass = password ?? AUTH_PASSWORD;

      if (!user || !pass) {
        return {
          content: [
            {
              type: "text",
              text: "Error: username and password are required (or set AUTH_EMAIL / AUTH_PASSWORD env vars).",
            },
          ],
          isError: true,
        };
      }

      const token = login(user, pass);
      if (token) {
        jwtToken = token;
        return {
          content: [
            {
              type: "text",
              text: `Authentication successful. JWT token stored. Token preview: ${jwtToken.slice(0, 20)}...`,
            },
          ],
        };
      } else {
        return {
          content: [{ type: "text", text: "Authentication failed: Invalid credentials." }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_dishes",
    "List all dishes. Optionally filter by tag or takeout status.",
    {
      tag: z
        .enum(["breakfast", "lunch", "dinner", "snack", "dessert", "drink"])
        .optional()
        .describe("Filter dishes by meal tag."),
      takeout: z
        .boolean()
        .optional()
        .describe("Filter by takeout status. Omit to return all."),
    },
    async ({ tag, takeout }) => {
      try {
        requireAuth();
        let dishes = listDishes();

        if (tag !== undefined) {
          dishes = dishes.filter((d) => d.tags.includes(tag));
        }
        if (takeout !== undefined) {
          dishes = dishes.filter((d) => d.takeout === takeout);
        }

        return {
          content: [{ type: "text", text: JSON.stringify(dishes, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  const ingredientSchema = z.object({
    name: z.string().describe("Ingredient name."),
    quantity: z.number().describe("Quantity."),
    unit: z.string().describe("Unit of measurement (e.g. g, ml, count)."),
  });

  server.tool(
    "create_dish",
    "Create a new dish.",
    {
      name: z.string().describe("Name of the dish."),
      tags: z
        .array(z.enum(["breakfast", "lunch", "dinner", "snack", "dessert", "drink"]))
        .optional()
        .describe("Meal tags for this dish."),
      takeout: z
        .boolean()
        .optional()
        .describe("Whether this is a takeout dish (ingredients excluded from shopping list)."),
      ingredients: z
        .array(ingredientSchema)
        .optional()
        .describe("List of ingredients."),
      instructions: z.string().optional().describe("Cooking instructions."),
      notes: z.string().optional().describe("Additional notes."),
    },
    async (params) => {
      try {
        requireAuth();
        const dishData: DishData = {
          name: params.name,
          tags: params.tags,
          takeout: params.takeout,
          ingredients: params.ingredients,
          instructions: params.instructions,
          notes: params.notes,
        };
        const dish = createDish(dishData);

        return {
          content: [{ type: "text", text: JSON.stringify(dish, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update_dish",
    "Update an existing dish by ID.",
    {
      id: z.number().describe("Dish ID to update."),
      name: z.string().describe("New name for the dish."),
      tags: z
        .array(z.enum(["breakfast", "lunch", "dinner", "snack", "dessert", "drink"]))
        .optional()
        .describe("Meal tags."),
      takeout: z.boolean().optional().describe("Takeout status."),
      ingredients: z.array(ingredientSchema).optional().describe("Ingredients."),
      instructions: z.string().optional().describe("Cooking instructions."),
      notes: z.string().optional().describe("Additional notes."),
    },
    async ({ id, ...rest }) => {
      try {
        requireAuth();
        const dishData: DishData = {
          name: rest.name,
          tags: rest.tags,
          takeout: rest.takeout,
          ingredients: rest.ingredients,
          instructions: rest.instructions,
          notes: rest.notes,
        };
        const dish = updateDish(id, dishData);

        if (!dish) {
          return {
            content: [{ type: "text", text: `Dish ${id} not found.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(dish, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "delete_dish",
    "Delete a dish by ID.",
    {
      id: z.number().describe("Dish ID to delete."),
    },
    async ({ id }) => {
      try {
        requireAuth();
        const result = deleteDish(id);

        return {
          content: [
            { type: "text", text: result.success ? `Dish ${id} deleted successfully.` : `Failed to delete dish ${id}.` },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "import_dishes",
    "Bulk import dishes from a JSON array. The entire import is transactional — it fails if any dish name already exists (case-insensitive).",
    {
      dishes: z
        .array(
          z.object({
            name: z.string(),
            tags: z
              .array(z.enum(["breakfast", "lunch", "dinner", "snack", "dessert", "drink"]))
              .optional(),
            takeout: z.boolean().optional(),
            ingredients: z.array(ingredientSchema).optional(),
            instructions: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .describe("Array of dish objects to import."),
    },
    async ({ dishes }) => {
      try {
        requireAuth();
        const dishData: DishData[] = dishes.map((d) => ({
          name: d.name,
          tags: d.tags,
          takeout: d.takeout,
          ingredients: d.ingredients,
          instructions: d.instructions,
          notes: d.notes,
        }));
        const result = importDishes(dishData);

        if ('error' in result) {
          return {
            content: [{ type: "text", text: `Import failed: ${result.error}. Duplicates: ${result.duplicates.join(", ")}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Successfully imported ${result.imported} dish(es).` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_menu",
    "Get the menu for a specific date. Returns an empty entries array if no menu has been set for that date.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date in YYYY-MM-DD format."),
    },
    async ({ date }) => {
      try {
        requireAuth();
        const menu = getMenu(date);
        return {
          content: [{ type: "text", text: JSON.stringify(menu, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "set_menu",
    "Set (replace) the entire menu for a date. This overwrites any existing menu entries for that date.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date in YYYY-MM-DD format."),
      entries: z
        .array(
          z.object({
            slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).describe("Meal slot."),
            dishId: z.number().describe("ID of the dish."),
            servings: z.number().positive().describe("Number of servings."),
          })
        )
        .describe("Menu entries to set."),
    },
    async ({ date, entries }) => {
      try {
        requireAuth();
        const menu = setMenu(date, entries);

        return {
          content: [{ type: "text", text: JSON.stringify(menu, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "add_dish_to_menu",
    "Add a dish to a specific meal slot on a date. If a dish already exists in that slot it is replaced.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date in YYYY-MM-DD format."),
      slot: z
        .enum(["breakfast", "lunch", "dinner", "snack"])
        .describe("Meal slot to add the dish to."),
      dishId: z.number().describe("ID of the dish to add."),
      servings: z.number().positive().default(1).describe("Number of servings (default: 1)."),
    },
    async ({ date, slot, dishId, servings }) => {
      try {
        requireAuth();
        const current = getMenu(date);

        const entries = current.entries.filter((e) => e.slot !== slot);
        entries.push({ slot, dishId, servings });

        const menu = setMenu(date, entries);

        return {
          content: [{ type: "text", text: JSON.stringify(menu, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "remove_dish_from_menu",
    "Remove a dish from a specific meal slot on a date.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date in YYYY-MM-DD format."),
      slot: z
        .enum(["breakfast", "lunch", "dinner", "snack"])
        .describe("Meal slot to remove the dish from."),
    },
    async ({ date, slot }) => {
      try {
        requireAuth();
        const current = getMenu(date);
        const entries = current.entries.filter((e) => e.slot !== slot);

        const menu = setMenu(date, entries);

        return {
          content: [{ type: "text", text: JSON.stringify(menu, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_shopping_list",
    "Generate a shopping list for a given date by aggregating ingredients from all non-takeout dishes in the menu. Quantities are scaled by servings and merged for duplicate ingredients (case-insensitive name + unit key). Takeout dishes are excluded.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date in YYYY-MM-DD format."),
    },
    async ({ date }) => {
      try {
        requireAuth();
        const menu = getMenu(date);
        const allDishes = listDishes();

        if (menu.entries.length === 0) {
          return {
            content: [{ type: "text", text: `No menu entries found for ${date}. Shopping list is empty.` }],
          };
        }

        const dishMap = new Map<number, Dish>(allDishes.map((d) => [d.id, d]));
        const shoppingList = aggregateShoppingList(menu, dishMap);

        if (shoppingList.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `All dishes on ${date} are takeout — no ingredients to shop for.`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(shoppingList, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export const server = createMcpServer();

export async function startMcpServer(): Promise<void> {
  if (AUTH_EMAIL && AUTH_PASSWORD && !jwtToken) {
    const token = login(AUTH_EMAIL, AUTH_PASSWORD);
    if (token) {
      jwtToken = token;
      process.stderr.write("Auto-login successful.\n");
    } else {
      process.stderr.write(
        `Auto-login failed: Invalid credentials. Use the auth_login tool to authenticate manually.\n`
      );
    }
  }

  const transport = new StdioServerTransport();
  const srv = createMcpServer();
  await srv.connect(transport);
  process.stderr.write("food-app MCP server running on stdio.\n");
}