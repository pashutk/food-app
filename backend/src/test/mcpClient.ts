import type { Server } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../app';

export interface AuthenticatedMcpTestClient {
  client: Client;
  token: string;
  close(): Promise<void>;
}

interface StartAuthenticatedMcpTestClientOptions {
  port: number;
  clientName: string;
}

export async function startAuthenticatedMcpTestClient(
  options: StartAuthenticatedMcpTestClientOptions,
): Promise<AuthenticatedMcpTestClient> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = createApp().listen(options.port, () => resolve(listeningServer));
    listeningServer.on('error', reject);
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${options.port}/mcp`),
  );
  const client = new Client(
    { name: options.clientName, version: '0.1.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const token = JSON.parse((loginResult.content as any[])[0].text).token as string;

    return {
      client,
      token,
      async close() {
        try {
          await client.close();
        } finally {
          await closeServer(server);
        }
      },
    };
  } catch (error) {
    await closeServer(server);
    throw error;
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
