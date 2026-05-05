import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
