import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		// `.claude/**` covers git worktrees the Claude Code harness sometimes
		// creates inside the repo (e.g. .claude/worktrees/<issue>/) — without
		// this, vitest's default include glob picks up that worktree's own
		// tests/ directory too, double-running (and double-counting failures
		// from) the whole suite.
		exclude: ['tests/e2e/**', 'node_modules/**', '.svelte-kit/**', '.opencode/**', '.claude/**'],
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
				'.claude/**',
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
