import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBrowseDishesTool } from './browse-dishes';
import { registerViewMenuTool } from './view-menu';

/**
 * Register all read-only MCP tools.
 */
export function registerReadTools(server: McpServer) {
  registerBrowseDishesTool(server);
  registerViewMenuTool(server);
}
