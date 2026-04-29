import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    deps: {
      inline: ['better-sqlite3'],
    },
  },
});