import { verifyCredentials, issueToken } from '../../services/auth';

/**
 * MCP login tool — returns a JWT token for authenticated tool access.
 * Uses the same shared auth service as REST login.
 */
export function registerLoginTool(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const z = require('zod');

  server.tool(
    'login',
    'Authenticate and obtain a JWT token for protected tool access',
    {
      username: z.string().describe('Username for authentication'),
      password: z.string().describe('Password for authentication'),
    },
    async (params: { username: string; password: string }) => {
      if (verifyCredentials({ username: params.username, password: params.password })) {
        const token = issueToken(params.username);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                token,
                message: 'Authentication successful',
              }),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: 'Invalid credentials',
              }),
            },
          ],
        };
      }
    }
  );
}
