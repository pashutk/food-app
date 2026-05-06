import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../db';
import * as dishesService from '../dishes';

describe('dishes service', () => {
  beforeEach(() => {
    // Clear dishes table before each test
    db.exec('DELETE FROM dishes');
    // Reset AUTOINCREMENT counter
    db.exec('DELETE FROM sqlite_sequence WHERE name = \'dishes\'');
  });

  describe('listDishes', () => {
    it('returns empty array when no dishes exist', () => {
      const result = dishesService.listDishes();
      expect(result).toEqual([]);
    });

    it('returns dishes in stable name order', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Zucchini', '[]', 0, '[]', '', '');
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Apple', '[]', 0, '[]', '', '');
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Banana', '[]', 0, '[]', '', '');

      const result = dishesService.listDishes();
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('Banana');
      expect(result[2].name).toBe('Zucchini');
    });

    it('parses JSON fields correctly', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Test', '["tag1","tag2"]', 1, '["ing1"]', 'instructions', 'notes');

      const result = dishesService.listDishes();
      expect(result[0].tags).toEqual(['tag1', 'tag2']);
      expect(result[0].takeout).toBe(true);
      expect(result[0].ingredients).toEqual(['ing1']);
      expect(result[0].instructions).toBe('instructions');
      expect(result[0].notes).toBe('notes');
    });
  });

  describe('createDish', () => {
    it('creates a dish with defaults', () => {
      const result = dishesService.createDish({ name: 'Test' });
      expect(result.name).toBe('Test');
      expect(result.tags).toEqual([]);
      expect(result.takeout).toBe(false);
      expect(result.ingredients).toEqual([]);
      expect(result.instructions).toBe('');
      expect(result.notes).toBe('');
    });

    it('creates a dish with all fields', () => {
      const result = dishesService.createDish({
        name: 'Test',
        tags: ['tag1'],
        takeout: true,
        ingredients: ['ing1'],
        instructions: 'do things',
        notes: 'some notes',
      });
      expect(result.name).toBe('Test');
      expect(result.tags).toEqual(['tag1']);
      expect(result.takeout).toBe(true);
      expect(result.ingredients).toEqual(['ing1']);
      expect(result.instructions).toBe('do things');
      expect(result.notes).toBe('some notes');
    });
  });

  describe('updateDish', () => {
    it('returns not found when dish does not exist', () => {
      const result = dishesService.updateDish('999', { name: 'Test' });
      expect(result).toEqual({ found: false });
    });

    it('updates an existing dish', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Original', '[]', 0, '[]', '', '');

      const result = dishesService.updateDish('1', {
        name: 'Updated',
        tags: ['new'],
        takeout: true,
      });
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.dish.name).toBe('Updated');
        expect(result.dish.tags).toEqual(['new']);
        expect(result.dish.takeout).toBe(true);
      }
    });
  });

  describe('deleteDish', () => {
    it('deletes a dish and reports found', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('To Delete', '[]', 0, '[]', '', '');

      const result = dishesService.deleteDish('1');
      expect(result).toEqual({ found: true });
      expect(dishesService.listDishes()).toHaveLength(0);
    });

    it('returns not found when dish does not exist', () => {
      const result = dishesService.deleteDish('999');
      expect(result).toEqual({ found: false });
    });
  });

  describe('importDishes', () => {
    it('rejects duplicates against existing dishes', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('Existing', '[]', 0, '[]', '', '');

      const result = dishesService.importDishes([
        { name: 'Existing' },
        { name: 'New' },
      ]);
      expect('duplicates' in result).toBe(true);
      expect((result as { duplicates: string[] }).duplicates).toContain('Existing');
    });

    it('rejects case-insensitive duplicates', () => {
      db.prepare(
        'INSERT INTO dishes (name, tags, takeout, ingredients, instructions, notes) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('existing', '[]', 0, '[]', '', '');

      const result = dishesService.importDishes([{ name: 'EXISTING' }]);
      expect('duplicates' in result).toBe(true);
      expect((result as { duplicates: string[] }).duplicates).toContain('EXISTING');
    });

    it('imports all dishes transactionally when no duplicates', () => {
      const result = dishesService.importDishes([
        { name: 'A', tags: ['a'] },
        { name: 'B', tags: ['b'] },
        { name: 'C', tags: ['c'] },
      ]);
      expect('imported' in result).toBe(true);
      if ('imported' in result) {
        expect(result.imported).toBe(3);
      }
      expect(dishesService.listDishes()).toHaveLength(3);
    });
  });
});
