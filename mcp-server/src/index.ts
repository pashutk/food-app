#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE_URL = process.env.API_BASE_URL;
const AUTH_EMAIL = process.env.AUTH_EMAIL;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

if (!API_BASE_URL) {
  process.stderr.write("Error: API_BASE_URL environment variable is required\n");
  process.exit(1);
}

// Stored JWT token (populated on first auth_login or auto-login)
let jwtToken: string | null = null;

// ── Types ──────────────────────────────────────────────────────────────────

type MealTag = "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "drink";
type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

interface Dish {
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

interface MenuEntry {
  slot: MealSlot;
  dishId: number;
  servings: number;
}

interface DailyMenu {
  date: string;
  entries: MenuEntry[];
}

interface ShoppingItem {
  name: string;
  quantity: number;
  unit: string;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function baseUrl(): string {
  return API_BASE_URL!.replace(/\/$/, "");
}

async function apiFetch(
  path: string,
  options: RequestInit & { requiresAuth?: boolean } = {}
): Promise<unknown> {
  const { requiresAuth = true, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  if (requiresAuth) {
    if (!jwtToken) {
      throw new Error("Not authenticated. Call auth_login first.");
    }
    headers["Authorization"] = `Bearer ${jwtToken}`;
  }

  const url = `${baseUrl()}${path}`;
  const response = await fetch(url, { ...fetchOptions, headers });

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error: string }).error
        : text || `HTTP ${response.status}`;
    throw new Error(`API error ${response.status}: ${message}`);
  }

  return body;
}

// ── Shopping list aggregation (replicates frontend logic) ──────────────────

function aggregateShoppingList(
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

// ── MCP server setup ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "food-app-mcp",
  version: "1.0.0",
});

// ── Tool: auth_login ───────────────────────────────────────────────────────

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

    try {
      const data = (await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: user, password: pass }),
        requiresAuth: false,
      })) as { token: string };

      jwtToken = data.token;
      return {
        content: [
          {
            type: "text",
            text: `Authentication successful. JWT token stored. Token preview: ${jwtToken.slice(0, 20)}...`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Authentication failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: list_dishes ──────────────────────────────────────────────────────

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
      let dishes = (await apiFetch("/api/dishes")) as Dish[];

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

// ── Tool: create_dish ──────────────────────────────────────────────────────

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
      const dish = (await apiFetch("/api/dishes", {
        method: "POST",
        body: JSON.stringify(params),
      })) as Dish;

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

// ── Tool: update_dish ──────────────────────────────────────────────────────

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
      const dish = (await apiFetch(`/api/dishes/${id}`, {
        method: "PUT",
        body: JSON.stringify(rest),
      })) as Dish;

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

// ── Tool: delete_dish ──────────────────────────────────────────────────────

server.tool(
  "delete_dish",
  "Delete a dish by ID.",
  {
    id: z.number().describe("Dish ID to delete."),
  },
  async ({ id }) => {
    try {
      const result = (await apiFetch(`/api/dishes/${id}`, {
        method: "DELETE",
      })) as { success: boolean };

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

// ── Tool: import_dishes ────────────────────────────────────────────────────

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
      const result = (await apiFetch("/api/dishes/import", {
        method: "POST",
        body: JSON.stringify(dishes),
      })) as { imported: number };

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

// ── Tool: get_menu ─────────────────────────────────────────────────────────

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
      const menu = (await apiFetch(`/api/menus/${date}`)) as DailyMenu;
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

// ── Tool: set_menu ─────────────────────────────────────────────────────────

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
      const menu = (await apiFetch(`/api/menus/${date}`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      })) as DailyMenu;

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

// ── Tool: add_dish_to_menu ─────────────────────────────────────────────────

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
      const current = (await apiFetch(`/api/menus/${date}`)) as DailyMenu;

      // Replace existing entry for the same slot, or append
      const entries = current.entries.filter((e) => e.slot !== slot);
      entries.push({ slot, dishId, servings });

      const menu = (await apiFetch(`/api/menus/${date}`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      })) as DailyMenu;

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

// ── Tool: remove_dish_from_menu ────────────────────────────────────────────

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
      const current = (await apiFetch(`/api/menus/${date}`)) as DailyMenu;
      const entries = current.entries.filter((e) => e.slot !== slot);

      const menu = (await apiFetch(`/api/menus/${date}`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      })) as DailyMenu;

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

// ── Tool: get_shopping_list ────────────────────────────────────────────────

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
      const [menu, allDishes] = await Promise.all([
        apiFetch(`/api/menus/${date}`) as Promise<DailyMenu>,
        apiFetch("/api/dishes") as Promise<Dish[]>,
      ]);

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

// ── Start ──────────────────────────────────────────────────────────────────

async function main() {
  // Auto-login if credentials are provided via env vars
  if (AUTH_EMAIL && AUTH_PASSWORD && !jwtToken) {
    try {
      const data = (await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: AUTH_EMAIL, password: AUTH_PASSWORD }),
        requiresAuth: false,
      })) as { token: string };
      jwtToken = data.token;
      process.stderr.write("Auto-login successful.\n");
    } catch (err) {
      process.stderr.write(
        `Auto-login failed: ${(err as Error).message}. Use the auth_login tool to authenticate manually.\n`
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("food-app MCP server running on stdio.\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
