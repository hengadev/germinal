import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'path';
import postgres from 'postgres';
import { config, env } from '../env';
import { logger } from '../logger';
import * as schema from './schema';

// Query performance tracking. Only a bounded window of recent query times
// is kept for the average: per-query state must never grow with traffic.
export const QUERY_TIME_SAMPLE_CAP = 1000;

const queryStats = {
	totalQueries: 0,
	slowQueries: 0,
	queryTimes: [] as number[],
};

/** Record one query's duration, dropping the oldest sample past the cap. */
export function recordQueryTime(durationMs: number) {
	queryStats.queryTimes.push(durationMs);
	if (queryStats.queryTimes.length > QUERY_TIME_SAMPLE_CAP) {
		queryStats.queryTimes.shift();
	}
}

// Export function to get query statistics
export function getQueryStats() {
	return {
		totalQueries: queryStats.totalQueries,
		slowQueries: queryStats.slowQueries,
		sampleCount: queryStats.queryTimes.length,
		avgQueryTime: queryStats.queryTimes.length > 0
			? queryStats.queryTimes.reduce((a, b) => a + b, 0) / queryStats.queryTimes.length
			: 0,
	};
}

/**
 * Options of the app's connection pool, from the config block. The
 * statement timeout is a connection parameter, so Postgres bounds every
 * query on every pooled connection.
 */
export function poolOptions(database = config.database) {
	return {
		max: database.maxConnections,
		idle_timeout: database.idleTimeoutSeconds,
		connect_timeout: database.connectionTimeoutSeconds,
		prepare: false,
		connection: { statement_timeout: database.statementTimeoutSeconds * 1000 },
	};
}

/** Options of withTimeout's dedicated connection: the timeout it was given. */
export function timeoutConnectionOptions(timeoutMs: number, database = config.database) {
	return {
		max: 1,
		connect_timeout: database.connectionTimeoutSeconds,
		prepare: false,
		connection: { statement_timeout: timeoutMs },
	};
}

// Lazy database connection - only created when first accessed in non-mock mode
let _client: postgres.Sql | null = null;
let _db: any = null;

function initDb() {
	if (!_db) {
		_client = postgres(env.DATABASE_URL, poolOptions()) as any;

		// Wrap all drizzle operations to track timing
		_db = drizzle(_client!, { schema });

		// Store original execute method
		const originalExecute = (_db as any).execute.bind(_db);

		// Override execute to track query duration
		(_db as any).execute = async (query: any, params?: any[]) => {
			const startTime = Date.now();
			const queryId = Date.now();
			queryStats.totalQueries++;

			try {
				const result = await originalExecute(query, params);
				const duration = Date.now() - startTime;
				recordQueryTime(duration);

				if (duration > config.database.slowQueryThresholdMs) {
					queryStats.slowQueries++;
					const queryStr = query?.sql || query?.toString?.() || String(query);
					logger.warn(
						{
							duration,
							queryId,
							query: queryStr.slice(0, 100),
							params: params?.slice(0, 3),
						},
						'Slow database query detected'
					);
				}

				return result;
			} catch (error: any) {
				const duration = Date.now() - startTime;
				logger.error(
					{
						duration,
						queryId,
						query: query?.sql || query?.toString?.() || String(query),
						params: params?.slice(0, 3),
						error: error?.message || error,
					},
					'Database query failed'
				);
				throw error;
			}
		};
	}

	return _db;
}

// Export db as a getter that lazily initializes
export const db = new Proxy({} as any, {
	get(_target, prop) {
		if (env.USE_MOCK_DATA) {
			throw new Error('Database access attempted in mock mode');
		}
		return initDb()[prop];
	},
	set(_target, prop, value) {
		if (env.USE_MOCK_DATA) {
			throw new Error('Database access attempted in mock mode');
		}
		initDb()[prop] = value;
		return true;
	},
});

/**
 * Run pending database migrations at startup.
 * Uses a dedicated short-lived connection separate from the main pool.
 */
export async function runMigrations() {
	if (env.USE_MOCK_DATA) {
		logger.info('[DB] Skipping migrations in mock mode');
		return;
	}

	const migrationsFolder = resolve(process.cwd(), 'drizzle/migrations');
	const migrationClient = postgres(env.DATABASE_URL, { max: 1, prepare: false }) as any;
	const migrationDb = drizzle(migrationClient);

	try {
		logger.info('[DB] Running database migrations...');
		await migrate(migrationDb, { migrationsFolder });
		logger.info('✅ Database migrations completed');
	} finally {
		await migrationClient.end({ timeout: 5 });
	}
}

/**
 * Execute a function with a custom statement timeout
 * Use this for operations that may take longer than the default timeout
 * (config.database.statementTimeoutSeconds)
 */
export async function withTimeout<T>(
	timeoutMs: number,
	fn: (db: any) => Promise<T>
): Promise<T> {
	if (env.USE_MOCK_DATA) {
		throw new Error('Database access attempted in mock mode');
	}

	// A dedicated connection whose statement timeout is the one asked for
	const timeoutClient = postgres(env.DATABASE_URL, timeoutConnectionOptions(timeoutMs)) as any;

	const timeoutDb = drizzle(timeoutClient, { schema });

	try {
		return await fn(timeoutDb);
	} finally {
		await timeoutClient.end({ timeout: 5 });
	}
}
