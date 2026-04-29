import { describe, it, expect, beforeEach } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
import { getMenu, setMenu, setTestDb } from '../menus';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDb: any;

beforeEach(() => {
  // Create a fresh in-memory DB for each test with schema pre-created
  mockDb = new Database(':memory:');
  mockDb.exec(`
    CREATE TABLE IF NOT EXISTS menus (
      date TEXT PRIMARY KEY,
      entries TEXT NOT NULL DEFAULT '[]'
    );
  `);
  setTestDb(mockDb);
});

describe('getMenu', () => {
  it('returns empty entries for date with no row', () => {
    const result = getMenu('2024-01-01');
    expect(result).toEqual({ date: '2024-01-01', entries: [] });
  });

  it('returns parsed entries for date with existing row', () => {
    const testEntries = [{ dishId: 1, name: 'Pizza' }];
    mockDb.prepare(`INSERT INTO menus (date, entries) VALUES (?, ?)`).run(
      '2024-01-01',
      JSON.stringify(testEntries),
    );
    const result = getMenu('2024-01-01');
    expect(result).toEqual({ date: '2024-01-01', entries: testEntries });
  });
});

describe('setMenu', () => {
  it('round-trips: setMenu then getMenu returns same entries', () => {
    const testEntries = [{ dishId: 2, name: 'Pasta' }];
    setMenu('2024-01-02', testEntries);
    const result = getMenu('2024-01-02');
    expect(result).toEqual({ date: '2024-01-02', entries: testEntries });
  });

  it('setMenu overwrites existing entries for same date', () => {
    setMenu('2024-01-03', [{ dishId: 1, name: 'Soup' }]);
    setMenu('2024-01-03', [{ dishId: 2, name: 'Salad' }]);
    const result = getMenu('2024-01-03');
    expect(result.entries).toEqual([{ dishId: 2, name: 'Salad' }]);
  });
});
