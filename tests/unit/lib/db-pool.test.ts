// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the options every postgres.js client is created with; no real
// connection is made.
const postgresMock = vi.hoisted(() =>
	vi.fn((_url: string, _options: object) => ({ end: vi.fn().mockResolvedValue(undefined) }))
);
vi.mock('postgres', () => ({ default: postgresMock }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => ({ execute: vi.fn() })) }));

import {
	poolOptions,
	timeoutConnectionOptions,
	withTimeout,
	recordQueryTime,
	getQueryStats,
	QUERY_TIME_SAMPLE_CAP,
} from '../../../src/lib/server/db';
import { config } from '../../../src/lib/server/env';

describe('database pool', () => {
	it('takes pool size, timeouts and the statement timeout from config', () => {
		expect(poolOptions()).toEqual({
			max: config.database.maxConnections,
			idle_timeout: config.database.idleTimeoutSeconds,
			connect_timeout: config.database.connectionTimeoutSeconds,
			prepare: false,
			connection: { statement_timeout: config.database.statementTimeoutSeconds * 1000 },
		});
		expect(poolOptions().connection.statement_timeout).toBe(10_000);
	});

	it('installs no per-query debug or notice hook', () => {
		expect(poolOptions()).not.toHaveProperty('debug');
		expect(poolOptions()).not.toHaveProperty('onnotice');
	});
});

describe('withTimeout', () => {
	beforeEach(() => postgresMock.mockClear());

	it('opens its dedicated connection with the timeout it was given', async () => {
		expect(timeoutConnectionOptions(60_000).connection).toEqual({ statement_timeout: 60_000 });

		const result = await withTimeout(45_000, async () => 'done');

		expect(result).toBe('done');
		expect(postgresMock).toHaveBeenCalledOnce();
		expect(postgresMock.mock.calls[0][1]).toMatchObject({
			max: 1,
			connection: { statement_timeout: 45_000 },
		});
	});
});

describe('query-time samples', () => {
	it('keeps at most QUERY_TIME_SAMPLE_CAP samples and averages the recent ones', () => {
		for (let i = 0; i < QUERY_TIME_SAMPLE_CAP + 500; i++) recordQueryTime(1000);
		for (let i = 0; i < QUERY_TIME_SAMPLE_CAP; i++) recordQueryTime(4);

		const stats = getQueryStats();
		expect(stats.sampleCount).toBe(QUERY_TIME_SAMPLE_CAP);
		expect(stats.avgQueryTime).toBe(4);
	});
});
