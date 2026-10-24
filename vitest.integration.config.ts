import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		// Never call DeepL from tests, whatever the developer's .env holds
		// (dotenv does not override a variable that is already set).
		env: { DEEPL_API_KEY: '' },
		globals: true,
		// Integration tests hit a real database — no jsdom needed
		environment: 'node',
		setupFiles: [],
		include: ['tests/integration/**/*.test.ts'],
		exclude: [
			'tests/e2e/**',
			'node_modules/**',
			'.svelte-kit/**',
			'.opencode/**',
			'.claude/**',
		],
		// All integration tests share the same test database;
		// running files in parallel causes TRUNCATE deadlocks.
		fileParallelism: false,
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
			$server: path.resolve('./src/lib/server'),
		},
	},
});
