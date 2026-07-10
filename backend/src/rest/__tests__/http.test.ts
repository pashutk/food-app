import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import db from '../../db';
import { createApp } from '../../app';

const PORT = 4011;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server: Server | null = null;

async function startServer() {
  const app = createApp();
  return new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', reject);
  });
}

async function stopServer() {
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else {
      resolve();
    }
  });
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
  });

  return {
    status: response.status,
    body: (await response.json()) as any,
  };
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

describe('REST endpoint adapter', () => {
  beforeAll(async () => {
    await startServer();
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  beforeEach(() => {
    db.exec('DELETE FROM dishes');
    db.exec('DELETE FROM menus');
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'dishes'");
  });

  it('preserves login success and invalid-credential failure', async () => {
    const ok = await login();
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');

    const invalid = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpass' }),
    });

    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: 'Invalid credentials' });
  });

  it('serves protected dish operations through bearer-auth REST adapters', async () => {
    const { body } = await login();
    const token = body.token as string;

    const createResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'REST Adapter Dish',
        tags: ['adapter'],
        takeout: true,
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdDish = (await createResponse.json()) as any;
    expect(createdDish.name).toBe('REST Adapter Dish');
    expect(createdDish.tags).toEqual(['adapter']);
    expect(createdDish.takeout).toBe(true);

    const listResponse = await fetch(`${BASE_URL}/api/dishes`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listResponse.status).toBe(200);
    const dishes = (await listResponse.json()) as any[];
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes).toHaveLength(1);
    expect(dishes[0].id).toBe(createdDish.id);
  });

  it('returns a canonical 404 when deleting a missing dish', async () => {
    const { body } = await login();
    const token = body.token as string;

    const response = await fetch(`${BASE_URL}/api/dishes/99999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Dish with id 99999 not found' });
  });

  it('preserves the legacy import error for non-array bodies', async () => {
    const { body } = await login();
    const token = body.token as string;

    const response = await fetch(`${BASE_URL}/api/dishes/import`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Not An Array' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Expected an array' });
  });

  it('accepts and returns primitive menu entries without failing output validation', async () => {
    const { body } = await login();
    const token = body.token as string;
    const entries = ['breakfast-note', 42, true, null];

    const updateResponse = await fetch(`${BASE_URL}/api/menus/2026-07-09`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ entries }),
    });

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      date: '2026-07-09',
      entries,
    });

    const viewResponse = await fetch(`${BASE_URL}/api/menus/2026-07-09`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(viewResponse.status).toBe(200);
    expect(await viewResponse.json()).toEqual({
      date: '2026-07-09',
      entries,
    });
  });
});
