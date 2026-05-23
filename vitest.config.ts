import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		exclude: ['tests/e2e/**', 'node_modules/**', '.svelte-kit/**', '.opencode/**'],
		// Integration tests share a single germinal_test database — parallel file
		// execution causes TRUNCATE races.  Unit tests are fast enough that
		// sequential execution is not a meaningful slowdown.
		fileParallelism: false,

		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.{ts,tsx}'],
			exclude: [
				'node_modules/**',
				'src/**/*.d.ts',
				'src/**/*.test.ts',
				'src/**/*.spec.ts',
				'.svelte-kit/**',
			],
		},
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
			$server: path.resolve('./src/lib/server'),
		},
	},
});
