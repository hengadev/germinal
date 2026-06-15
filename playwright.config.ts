import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		['html', { outputFolder: 'playwright-report', open: 'never' }],
		['list'],
	],
	use: {
		trace: 'on-first-retry',
		baseURL: 'http://localhost:5173',
		// Lock tests to English so translated text assertions are predictable.
		locale: 'en-US',
		// Disable reveal animations so intersection-observer-gated elements are
		// always visible without waiting for scroll/intersection triggers.
		reducedMotion: 'reduce',
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},
	],

	webServer: {
		command: 'pnpm dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		env: {
			USE_MOCK_DATA: 'true',
			MOCK_ADMIN_EMAIL: process.env.MOCK_ADMIN_EMAIL || 'playwright@test.dev',
			MOCK_ADMIN_PASSWORD: process.env.MOCK_ADMIN_PASSWORD || 'playwright123',
		},
	},
});
