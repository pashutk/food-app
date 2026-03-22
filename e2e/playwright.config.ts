import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const username = process.env.E2E_USERNAME ?? 'testuser';
const password = process.env.E2E_PASSWORD ?? 'testpass';
const isCI = !!process.env.CI;

// In CI: single production server (backend serves built frontend).
// Locally: two dev servers so Vite HMR works during development.
const webServer = isCI
  ? [
      {
        command: `PORT=3001 DB_PATH=./data/test.db AUTH_USERNAME=${username} AUTH_PASSWORD=${password} JWT_SECRET=test-e2e-secret npm start`,
        cwd: path.resolve(__dirname, '../backend'),
        port: 3001,
        reuseExistingServer: false,
      },
    ]
  : [
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
    ];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  use: {
    baseURL: isCI ? 'http://localhost:3001' : 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  globalSetup: './global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer,
});
