// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbExecute = vi.fn();
const getQueryStats = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: { execute: dbExecute },
	getQueryStats,
}));

vi.mock('$lib/server/env', () => ({
	isSMTPEnabled: () => false,
	isS3Enabled: () => false,
	env: { USE_SCHEDULER: false },
}));

vi.mock('$lib/server/logger', () => ({
	logger: { info: vi.fn(), error: vi.fn() },
}));

function makeEvent() {
	// GET ignores the event; it only needs to satisfy the RequestHandler type
	return { url: new URL('http://x/api/health') } as any;
}

describe('GET /api/health — build SHA reporting', () => {
	const originalCommitSha = process.env.COMMIT_SHA;

	beforeEach(() => {
		vi.clearAllMocks();
		dbExecute.mockResolvedValue({ rows: [{ '?column?': 1 }] });
		getQueryStats.mockReturnValue({ totalQueries: 0, slowQueries: 0, avgQueryTime: 0 });
	});

	afterEach(() => {
		// Never leak a COMMIT_SHA into other test files' process.env
		if (originalCommitSha === undefined) {
			delete process.env.COMMIT_SHA;
		} else {
			process.env.COMMIT_SHA = originalCommitSha;
		}
	});

	it('reports the exact commit SHA when COMMIT_SHA is set', async () => {
		process.env.COMMIT_SHA = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b';
		const { GET } = await import('../../../src/routes/api/health/+server');

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.sha).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b');
	});

	it('reports the "dev" sentinel when COMMIT_SHA is unset, with the rest of the response unchanged', async () => {
		delete process.env.COMMIT_SHA;
		const { GET } = await import('../../../src/routes/api/health/+server');

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.sha).toBe('dev');
		// Everything except the SHA reporting keeps its existing shape
		expect(body).toEqual({
			status: 'healthy',
			timestamp: expect.any(String),
			sha: 'dev',
			checks: {
				database: { status: 'healthy', latency: expect.any(Number) },
				smtp: { status: 'disabled', message: 'SMTP not configured' },
				storage: { status: 'disabled', message: 'S3 not configured' },
				scheduler: { status: 'disabled', message: 'Scheduler not enabled' },
			},
			metrics: {
				totalQueries: 0,
				slowQueries: 0,
				avgQueryTime: 0,
			},
		});
	});

	it('reports the "dev" sentinel when COMMIT_SHA is set to an empty string', async () => {
		process.env.COMMIT_SHA = '';
		const { GET } = await import('../../../src/routes/api/health/+server');

		const response = await GET(makeEvent());

		const body = await response.json();
		expect(body.sha).toBe('dev');
	});
});
