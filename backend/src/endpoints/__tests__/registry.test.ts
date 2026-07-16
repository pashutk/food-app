import { describe, expect, it } from 'vitest';
import { getMcpEndpoints, getRestEndpoints } from '../index';

describe('endpoint registry parity', () => {
  it('exposes every REST endpoint as an MCP tool', () => {
    const restNames = getRestEndpoints().map((endpoint) => endpoint.name);
    const mcpNames = new Set(getMcpEndpoints().map((endpoint) => endpoint.name));

    expect(restNames.every((name) => mcpNames.has(name))).toBe(true);
  });

  it('covers the current v1 REST surface', () => {
    expect(getRestEndpoints().map((endpoint) => endpoint.name)).toEqual([
      'login',
      'browse_dishes',
      'add_dish',
      'edit_dish',
      'remove_dish',
      'import_dishes',
      'recommend_dishes',
      'view_menu',
      'update_menu',
      'log_meal',
      'view_meal_logs',
      'remove_meal_log',
    ]);
  });

  it('documents input and output schemas for every endpoint', () => {
    for (const endpoint of getMcpEndpoints()) {
      expect(endpoint.inputSchema).toBeDefined();
      expect(endpoint.outputSchema).toBeDefined();
    }
  });
});
