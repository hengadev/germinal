import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
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
		],
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
			$server: path.resolve('./src/lib/server'),
		},
	},
});
