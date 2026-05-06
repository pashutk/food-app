import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerLoginTool } from './tools/login';
import { registerReadTools } from './tools/index';

export const mcpServer = new McpServer(
  {
    name: 'food-app-mcp',
    version: '0.1.0',
  }
);

// Register a trivial ping tool
mcpServer.tool(
  'ping',
  'Ping the server to check if it is alive',
  { message: z.string().optional().describe('Optional message to echo back') },
  async (params) => {
    const msg = params?.message ?? 'pong';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            reply: msg,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
  }
);

// Register login tool
registerLoginTool(mcpServer);

// Register read tools
registerReadTools(mcpServer);
