import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const username = process.env.E2E_USERNAME ?? 'testuser';
const password = process.env.E2E_PASSWORD ?? 'testpass';

const webServer = [
  {
    command: `PORT=3001 DB_PATH=./data/test.db AUTH_USERNAME=${username} AUTH_PASSWORD=${password} JWT_SECRET=${process.env.JWT_SECRET ?? 'test-secret-32chars-minimum'} npm run dev`,
    cwd: path.resolve(__dirname, '../backend'),
    port: 3001,
    reuseExistingServer: true,
  },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3001',
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
