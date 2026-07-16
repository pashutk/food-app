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
    db.exec('DELETE FROM meal_logs');
    db.exec('DELETE FROM dishes');
    db.exec('DELETE FROM menus');
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'meal_logs'");
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

  it('creates a meal log through POST /api/meal-logs', async () => {
    const { body } = await login();
    const token = body.token as string;

    const dishResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Meal Log REST Dish', tags: ['dinner'] }),
    });
    const dish = (await dishResponse.json()) as any;

    const response = await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-10',
        dishId: dish.id,
        slot: 'dinner',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      date: '2026-07-10',
      dishId: dish.id,
      slot: 'dinner',
    });
  });

  it('lists meal logs through GET /api/meal-logs?date=...', async () => {
    const { body } = await login();
    const token = body.token as string;

    const dishResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Listed Meal Log Dish', tags: ['lunch'] }),
    });
    const dish = (await dishResponse.json()) as any;

    await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-11',
        dishId: dish.id,
        slot: 'lunch',
      }),
    });

    const response = await fetch(`${BASE_URL}/api/meal-logs?date=2026-07-11`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        date: '2026-07-11',
        dishId: dish.id,
        slot: 'lunch',
        dish: {
          id: dish.id,
          name: 'Listed Meal Log Dish',
        },
      }),
    ]);
  });

  it('deletes a meal log through DELETE /api/meal-logs/:id', async () => {
    const { body } = await login();
    const token = body.token as string;

    const dishResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Deleted Meal Log Dish', tags: ['breakfast'] }),
    });
    const dish = (await dishResponse.json()) as any;

    const createResponse = await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-12',
        dishId: dish.id,
        slot: 'breakfast',
      }),
    });
    const mealLog = (await createResponse.json()) as any;

    const response = await fetch(`${BASE_URL}/api/meal-logs/${mealLog.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const listResponse = await fetch(`${BASE_URL}/api/meal-logs?date=2026-07-12`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await listResponse.json()).toEqual([]);
  });

  it('returns not found when deleting a missing meal log', async () => {
    const { body } = await login();
    const token = body.token as string;

    const response = await fetch(`${BASE_URL}/api/meal-logs/999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Meal log with id 999 not found' });
  });

  it('requires auth for protected meal log routes', async () => {
    const response = await fetch(`${BASE_URL}/api/meal-logs?date=2026-07-10`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns validation errors for invalid meal log input', async () => {
    const { body } = await login();
    const token = body.token as string;

    const response = await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-10',
        dishId: 123,
        slot: 'brunch',
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as any;
    expect(payload.error).toBe('Invalid request');
  });

  it('returns validation errors for invalid meal log dates', async () => {
    const { body } = await login();
    const token = body.token as string;

    const response = await fetch(`${BASE_URL}/api/meal-logs?date=2026-02-31`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as any;
    expect(payload.error).toBe('Invalid date');
  });

  it('returns a conflict for duplicate slotted meal logs', async () => {
    const { body } = await login();
    const token = body.token as string;

    const dishResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Duplicate Meal Log Dish', tags: ['dinner'] }),
    });
    const dish = (await dishResponse.json()) as any;

    await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-13',
        dishId: dish.id,
        slot: 'dinner',
      }),
    });

    const duplicateResponse = await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-13',
        dishId: dish.id,
        slot: 'dinner',
      }),
    });

    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toEqual({
      error: 'Meal log already exists for that date, slot, and dish',
    });
  });

  it('returns a clear conflict when deleting a dish with meal history', async () => {
    const { body } = await login();
    const token = body.token as string;

    const dishResponse = await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Protected From Delete', tags: ['dinner'] }),
    });
    const dish = (await dishResponse.json()) as any;

    await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-14',
        dishId: dish.id,
        slot: 'dinner',
      }),
    });

    const deleteResponse = await fetch(`${BASE_URL}/api/dishes/${dish.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deleteResponse.status).toBe(409);
    expect(await deleteResponse.json()).toEqual({
      error: 'Cannot delete dish with meal history',
    });
  });

  it('returns grouped, eligible, unique recommendations for several kinds', async () => {
    const { body } = await login();
    const token = body.token as string;
    const createDish = async (name: string, tags: string[]) => {
      const response = await fetch(`${BASE_URL}/api/dishes`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name, tags }),
      });
      return response.json() as Promise<any>;
    };

    await createDish('REST Breakfast 1', ['breakfast']);
    await createDish('REST Breakfast 2', ['breakfast']);
    await createDish('REST Lunch 1', ['lunch']);
    await createDish('REST Lunch 2', ['lunch']);
    await createDish('REST Dinner', ['dinner']);
    const coolingDown = await createDish('REST Recent Dinner', ['dinner']);

    await fetch(`${BASE_URL}/api/meal-logs`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-19',
        dishId: coolingDown.id,
        slot: 'breakfast',
      }),
    });

    const response = await fetch(`${BASE_URL}/api/recommendations`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-20',
        requests: [
          { kind: 'breakfast', count: 2 },
          { kind: 'lunch', count: 2 },
          { kind: 'dinner', count: 1 },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as any;
    expect(result.date).toBe('2026-07-20');
    expect(result.recommendations.map(({ kind }: any) => kind)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
    expect(result.recommendations.map(({ requested }: any) => requested)).toEqual([2, 2, 1]);
    expect(result.recommendations.map(({ dishes }: any) => dishes.length)).toEqual([2, 2, 1]);

    const returned = result.recommendations.flatMap(({ dishes }: any) => dishes);
    expect(new Set(returned.map(({ id }: any) => id)).size).toBe(returned.length);
    expect(returned.map(({ id }: any) => id)).not.toContain(coolingDown.id);
    expect(returned[0]).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
      tags: expect.any(Array),
      takeout: expect.any(Boolean),
      ingredients: expect.any(Array),
      instructions: expect.any(String),
      notes: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('requires authentication for recommendations', async () => {
    const response = await fetch(`${BASE_URL}/api/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-07-20',
        requests: [{ kind: 'dinner', count: 1 }],
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects invalid recommendation requests', async () => {
    const { body } = await login();
    const token = body.token as string;
    const invalidBodies = [
      { date: '2026-02-31', requests: [{ kind: 'dinner', count: 1 }] },
      { date: '2026-07-20', requests: [{ kind: 'brunch', count: 1 }] },
      { date: '2026-07-20', requests: [{ kind: 'dinner', count: 0 }] },
      { date: '2026-07-20', requests: [{ kind: 'dinner', count: 1.5 }] },
      { date: '2026-07-20', requests: [{ kind: 'dinner', count: 101 }] },
      { date: '2026-07-20', requests: [] },
      {
        date: '2026-07-20',
        requests: [
          { kind: 'lunch', count: 1 },
          { kind: 'lunch', count: 2 },
        ],
      },
    ];

    for (const invalidBody of invalidBodies) {
      const response = await fetch(`${BASE_URL}/api/recommendations`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(invalidBody),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'Invalid request' });
    }
  });

  it('returns HTTP 200 with a self-describing partial recommendation', async () => {
    const { body } = await login();
    const token = body.token as string;
    await fetch(`${BASE_URL}/api/dishes`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Only REST Snack', tags: ['snack'] }),
    });

    const response = await fetch(`${BASE_URL}/api/recommendations`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        date: '2026-07-20',
        requests: [{ kind: 'snack', count: 2 }],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recommendations: [{ kind: 'snack', requested: 2, dishes: [{ name: 'Only REST Snack' }] }],
    });
  });
});
