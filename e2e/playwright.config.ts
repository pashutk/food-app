import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const username = process.env.E2E_USERNAME ?? 'testuser';
const password = process.env.E2E_PASSWORD ?? 'testpass';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  globalSetup: './global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `PORT=3001 DB_PATH=./data/test.db AUTH_USERNAME=${username} AUTH_PASSWORD=${password} JWT_SECRET=test-e2e-secret npm run dev`,
      cwd: path.resolve(__dirname, '../backend'),
      port: 3001,
      reuseExistingServer: false,
    },
    {
      command: 'VITE_BACKEND_PORT=3001 npm run dev',
      cwd: path.resolve(__dirname, '../frontend'),
      port: 5174,
      reuseExistingServer: false,
    },
  ],
});
