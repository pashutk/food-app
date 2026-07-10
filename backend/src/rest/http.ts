import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { executeEndpoint, getRestEndpoints, isEndpointError } from '../endpoints';
import { verifyToken } from '../services/auth';

function authenticateRequest(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return { ok: false as const, status: 401, body: { error: 'Unauthorized' } };
  }

  try {
    verifyToken(header.slice(7));
    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 401, body: { error: 'Invalid token' } };
  }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      details: error.issues,
    });
    return;
  }

  if (isEndpointError(error)) {
    res.status(error.status).json(error.restBody ?? { error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function mountRestEndpoints(app: Express) {
  for (const endpoint of getRestEndpoints()) {
    const { rest } = endpoint;
    if (!rest) {
      continue;
    }

    const handler = async (req: Request, res: Response) => {
      try {
        if (endpoint.auth === 'protected') {
          const authResult = authenticateRequest(req);
          if (!authResult.ok) {
            res.status(authResult.status).json(authResult.body);
            return;
          }
        }

        const input = endpoint.inputSchema.parse(rest.getInput(req));
        const output = await executeEndpoint(endpoint, input);
        const body = rest.presentSuccess ? rest.presentSuccess(output) : output;
        res.status(rest.successStatus ?? 200).json(body);
      } catch (error) {
        sendError(res, error);
      }
    };

    switch (rest.method) {
      case 'get':
        app.get(rest.path, handler);
        break;
      case 'post':
        app.post(rest.path, handler);
        break;
      case 'put':
        app.put(rest.path, handler);
        break;
      case 'delete':
        app.delete(rest.path, handler);
        break;
    }
  }
}
