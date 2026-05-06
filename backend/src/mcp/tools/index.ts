import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBrowseDishesTool } from './browse-dishes';
import { registerViewMenuTool } from './view-menu';
import { registerAddDishTool } from './add-dish';
import { registerEditDishTool } from './edit-dish';
import { registerRemoveDishTool } from './remove-dish';
import { registerImportDishesTool } from './import-dishes';
import { registerUpdateMenuTool } from './update-menu';

/**
 * Register all read-only MCP tools.
 */
export function registerReadTools(server: McpServer) {
  registerBrowseDishesTool(server);
  registerViewMenuTool(server);
}

/**
 * Register all mutation MCP tools.
 */
export function registerMutationTools(server: McpServer) {
  registerAddDishTool(server);
  registerEditDishTool(server);
  registerRemoveDishTool(server);
  registerImportDishesTool(server);
  registerUpdateMenuTool(server);
}
