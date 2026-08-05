import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /personal-driver-quality\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/personal-driver' }]],
  use: {
    baseURL: 'http://localhost:3103',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'personal-driver-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'personal-driver-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'personal-driver-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npx next dev --turbopack -p 3103',
    env: {
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyDemoApiKeyForPlaywrightTesting123',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'medjira-service.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'medjira-service',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'medjira-service.appspot.com',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:123456789',
    },
    url: 'http://localhost:3103/personal-driver',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
