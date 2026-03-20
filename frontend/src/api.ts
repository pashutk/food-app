import type { Dish, DailyMenu } from './types';

function token() { return localStorage.getItem('token'); }
export function isAuthenticated() { return !!token(); }
export function logout() { localStorage.removeItem('token'); }

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) { logout(); location.reload(); throw new Error('Unauthorized'); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

export async function login(username: string, password: string) {
  const { token: t } = await req<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem('token', t);
}

export const dishes = {
  list: () => req<Dish[]>('/dishes'),
  create: (data: Omit<Dish, 'id' | 'created_at' | 'updated_at'>) =>
    req<Dish>('/dishes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Omit<Dish, 'id' | 'created_at' | 'updated_at'>) =>
    req<Dish>(`/dishes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<{ success: boolean }>(`/dishes/${id}`, { method: 'DELETE' }),
  import: (items: unknown[]) =>
    req<{ imported: number }>('/dishes/import', { method: 'POST', body: JSON.stringify(items) }),
};

export const menus = {
  get: (date: string) => req<DailyMenu>(`/menus/${date}`),
  save: (date: string, entries: DailyMenu['entries']) =>
    req<DailyMenu>(`/menus/${date}`, { method: 'PUT', body: JSON.stringify({ entries }) }),
};
