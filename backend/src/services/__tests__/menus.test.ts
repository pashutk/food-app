import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../db';
import * as menusService from '../menus';

describe('menus service', () => {
  beforeEach(() => {
    // Clear menus table before each test
    db.exec('DELETE FROM menus');
  });

  describe('getMenu', () => {
    it('returns empty entries for missing date', () => {
      const result = menusService.getMenu('2024-01-01');
      expect(result).toEqual({ date: '2024-01-01', entries: [] });
    });

    it('returns parsed entries for existing date', () => {
      db.prepare(
        'INSERT INTO menus (date, entries) VALUES (?, ?)',
      ).run('2024-01-01', JSON.stringify([{ dish: 'Test' }]));

      const result = menusService.getMenu('2024-01-01');
      expect(result.date).toBe('2024-01-01');
      expect(result.entries).toEqual([{ dish: 'Test' }]);
    });
  });

  describe('upsertMenu', () => {
    it('persists entries and returns the same domain shape', () => {
      const entries = [{ dish: 'A' }, { dish: 'B' }];
      const result = menusService.upsertMenu('2024-01-01', entries);
      expect(result.date).toBe('2024-01-01');
      expect(result.entries).toEqual(entries);

      // Verify it was persisted
      const retrieved = menusService.getMenu('2024-01-01');
      expect(retrieved.entries).toEqual(entries);
    });

    it('updates existing menu on conflict', () => {
      db.prepare(
        'INSERT INTO menus (date, entries) VALUES (?, ?)',
      ).run('2024-01-01', JSON.stringify([{ dish: 'Old' }]));

      const result = menusService.upsertMenu('2024-01-01', [{ dish: 'New' }]);
      expect(result.entries).toEqual([{ dish: 'New' }]);

      const retrieved = menusService.getMenu('2024-01-01');
      expect(retrieved.entries).toEqual([{ dish: 'New' }]);
    });
  });
});
