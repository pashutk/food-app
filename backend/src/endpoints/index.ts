import type { Request } from 'express';
import { z } from 'zod';
import { verifyCredentials, issueToken } from '../services/auth';
import * as dishesService from '../services/dishes';
import * as menusService from '../services/menus';
import { tagsDescription } from './tags';

export type EndpointAuth = 'public' | 'protected';
export type RestMethod = 'get' | 'post' | 'put' | 'delete';

type InputSchema = z.ZodObject<any>;

export interface RestEndpointMetadata<Output> {
  method: RestMethod;
  path: string;
  successStatus?: number;
  getInput(req: Request): unknown;
  presentSuccess?: (output: Output) => unknown;
}

export interface McpEndpointMetadata<Output> {
  presentSuccess?: (output: Output) => unknown;
}

export interface AppEndpoint {
  name: string;
  description: string;
  auth: EndpointAuth;
  inputSchema: InputSchema;
  outputSchema: z.ZodType;
  handle: (input: any) => unknown | Promise<unknown>;
  rest?: RestEndpointMetadata<any>;
  mcp?: McpEndpointMetadata<any>;
}

interface EndpointErrorOptions {
  status: number;
  message: string;
  restBody?: unknown;
  mcpBody?: unknown;
}

export class EndpointError extends Error {
  readonly status: number;
  readonly restBody?: unknown;
  readonly mcpBody?: unknown;

  constructor(options: EndpointErrorOptions) {
    super(options.message);
    this.name = 'EndpointError';
    this.status = options.status;
    this.restBody = options.restBody;
    this.mcpBody = options.mcpBody;
  }
}

export function isEndpointError(error: unknown): error is EndpointError {
  return error instanceof EndpointError;
}

function defineEndpoint(endpoint: AppEndpoint): AppEndpoint {
  return endpoint;
}

export async function executeEndpoint(endpoint: AppEndpoint, input: unknown) {
  const output = await endpoint.handle(input);
  return endpoint.outputSchema.parse(output);
}

const authCredentialsSchema = z.object({
  username: z.string().describe('Username for authentication'),
  password: z.string().describe('Password for authentication'),
});

const dishFieldsSchema = {
  name: z.string().describe('Name of the dish'),
  tags: z.array(z.string()).optional().describe(tagsDescription()),
  takeout: z.boolean().optional().describe('Whether the dish is takeout'),
  ingredients: z.array(z.unknown()).optional().describe('Ingredients for the dish'),
  instructions: z.string().optional().describe('Cooking instructions'),
  notes: z.string().optional().describe('Additional notes'),
};

const dishIdSchema = z.object({
  id: z.string().describe('ID of the dish'),
});

const createDishInputSchema = z.object(dishFieldsSchema);

const updateDishInputSchema = dishIdSchema.extend({
  ...dishFieldsSchema,
});

const importDishItemSchema = z.object(dishFieldsSchema);

const importDishesInputSchema = z.object({
  items: z
    .array(importDishItemSchema)
    .describe('Array of dishes to import'),
});

const menuDateSchema = z.object({
  date: z.string().describe('Menu date in YYYY-MM-DD format'),
});

const updateMenuInputSchema = menuDateSchema.extend({
  entries: z.array(z.unknown()).describe('Menu entries to upsert'),
});

const dishSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    tags: z.array(z.string()),
    takeout: z.boolean(),
    ingredients: z.array(z.unknown()),
    instructions: z.string(),
    notes: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

const loginOutputSchema = z.object({
  status: z.literal('ok'),
  token: z.string(),
  message: z.string(),
});

const browseDishesOutputSchema = z.object({
  dishes: z.array(dishSchema),
});

const dishOutputSchema = z.object({
  dish: dishSchema,
});

const removeDishOutputSchema = z.object({
  success: z.literal(true),
});

const importDishesOutputSchema = z.object({
  imported: z.number(),
});

const menuOutputSchema = z
  .object({
    date: z.string(),
    entries: z.array(z.unknown()),
  })
  .passthrough();

export const endpointRegistry = [
  defineEndpoint({
    name: 'login',
    description: 'Authenticate and obtain a JWT token for protected tool access',
    auth: 'public',
    inputSchema: authCredentialsSchema,
    outputSchema: loginOutputSchema,
    handle: ({ username, password }) => {
      if (!verifyCredentials({ username, password })) {
        throw new EndpointError({
          status: 401,
          message: 'Invalid credentials',
          restBody: { error: 'Invalid credentials' },
          mcpBody: { status: 'error', error: 'Invalid credentials' },
        });
      }

      return {
        status: 'ok' as const,
        token: issueToken(username),
        message: 'Authentication successful',
      };
    },
    rest: {
      method: 'post',
      path: '/api/auth/login',
      getInput: (req) => req.body,
      presentSuccess: (output) => ({ token: output.token }),
    },
  }),
  defineEndpoint({
    name: 'browse_dishes',
    description: 'List all dishes',
    auth: 'protected',
    inputSchema: z.object({}),
    outputSchema: browseDishesOutputSchema,
    handle: () => ({ dishes: dishesService.listDishes() }),
    rest: {
      method: 'get',
      path: '/api/dishes',
      getInput: () => ({}),
      presentSuccess: (output) => output.dishes,
    },
  }),
  defineEndpoint({
    name: 'add_dish',
    description: 'Create a new dish',
    auth: 'protected',
    inputSchema: createDishInputSchema,
    outputSchema: dishOutputSchema,
    handle: (input) => ({ dish: dishesService.createDish(input) }),
    rest: {
      method: 'post',
      path: '/api/dishes',
      successStatus: 201,
      getInput: (req) => req.body,
      presentSuccess: (output) => output.dish,
    },
  }),
  defineEndpoint({
    name: 'edit_dish',
    description: 'Update an existing dish',
    auth: 'protected',
    inputSchema: updateDishInputSchema,
    outputSchema: dishOutputSchema,
    handle: ({ id, ...input }) => {
      const result = dishesService.updateDish(id, input);
      if (!result.found) {
        throw new EndpointError({
          status: 404,
          message: 'Dish not found',
          restBody: { error: 'Not found' },
          mcpBody: { error: 'Dish not found' },
        });
      }

      return { dish: result.dish };
    },
    rest: {
      method: 'put',
      path: '/api/dishes/:id',
      getInput: (req) => ({ id: req.params.id, ...req.body }),
      presentSuccess: (output) => output.dish,
    },
  }),
  defineEndpoint({
    name: 'remove_dish',
    description: 'Delete a dish by id',
    auth: 'protected',
    inputSchema: dishIdSchema,
    outputSchema: removeDishOutputSchema,
    handle: ({ id }) => {
      const result = dishesService.deleteDish(id);
      if (!result.found) {
        const error = `Dish with id ${id} not found`;
        throw new EndpointError({
          status: 404,
          message: error,
          restBody: { error },
          mcpBody: { error },
        });
      }

      return { success: true as const };
    },
    rest: {
      method: 'delete',
      path: '/api/dishes/:id',
      getInput: (req) => ({ id: req.params.id }),
    },
  }),
  defineEndpoint({
    name: 'import_dishes',
    description: 'Bulk import dishes. Fails if any dish name already exists (case-insensitive).',
    auth: 'protected',
    inputSchema: importDishesInputSchema,
    outputSchema: importDishesOutputSchema,
    handle: ({ items }) => {
      const result = dishesService.importDishes(items);
      if ('duplicates' in result) {
        throw new EndpointError({
          status: 409,
          message: 'Duplicate dishes found',
          restBody: { error: 'Duplicate dishes found', duplicates: result.duplicates },
          mcpBody: result,
        });
      }

      return result;
    },
    rest: {
      method: 'post',
      path: '/api/dishes/import',
      getInput: (req) => {
        if (!Array.isArray(req.body)) {
          throw new EndpointError({
            status: 400,
            message: 'Expected an array',
            restBody: { error: 'Expected an array' },
          });
        }

        return { items: req.body };
      },
    },
  }),
  defineEndpoint({
    name: 'view_menu',
    description: 'View the menu for a specific date',
    auth: 'protected',
    inputSchema: menuDateSchema,
    outputSchema: menuOutputSchema,
    handle: ({ date }) => menusService.getMenu(date),
    rest: {
      method: 'get',
      path: '/api/menus/:date',
      getInput: (req) => ({ date: req.params.date }),
    },
  }),
  defineEndpoint({
    name: 'update_menu',
    description: 'Update or create a menu for a specific date',
    auth: 'protected',
    inputSchema: updateMenuInputSchema,
    outputSchema: menuOutputSchema,
    handle: ({ date, entries }) =>
      menusService.upsertMenu(date, entries as menusService.MenuEntry[]),
    rest: {
      method: 'put',
      path: '/api/menus/:date',
      getInput: (req) => ({ date: req.params.date, entries: req.body?.entries }),
    },
  }),
] as const satisfies readonly AppEndpoint[];

export function getRestEndpoints() {
  return endpointRegistry.filter((endpoint) => endpoint.rest);
}

export function getMcpEndpoints() {
  return endpointRegistry;
}
