import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'path';
import postgres from 'postgres';
import { env } from '../env';
import { logger } from '../logger';
import * as schema from './schema';

// Query performance tracking
const queryStats = {
	totalQueries: 0,
	slowQueries: 0,
	queryTimes: [] as number[],
};

// Export function to get query statistics
export function getQueryStats() {
	return {
		...queryStats,
		avgQueryTime: queryStats.queryTimes.length > 0
			? queryStats.queryTimes.reduce((a, b) => a + b, 0) / queryStats.queryTimes.length
			: 0,
	};
}

// Lazy database connection - only created when first accessed in non-mock mode
let _client: postgres.Sql | null = null;
let _db: any = null;

function initDb() {
	if (!_db) {
		const queryStartTimes = new Map<number, number>();

		_client = postgres(env.DATABASE_URL, {
			max: 10,
			idle_timeout: 20,
			connect_timeout: 10,
			debug: (connectionId, query, parameters) => {
				const startTime = Date.now();
				queryStartTimes.set(startTime, connectionId);
			},
			onnotice: (notice) => {
				// This doesn't work for query timing, so we'll use a different approach
			},
		}) as any;

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
				queryStats.queryTimes.push(duration);

				// Log slow queries (>100ms)
				if (duration > 100) {
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
	const migrationClient = postgres(env.DATABASE_URL, { max: 1 }) as any;
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
 * Use this for operations that may take longer than the default 10s timeout
 */
export async function withTimeout<T>(
	timeoutMs: number,
	fn: (db: any) => Promise<T>
): Promise<T> {
	if (env.USE_MOCK_DATA) {
		throw new Error('Database access attempted in mock mode');
	}

	// Create a new connection with custom timeout for this operation
	const timeoutClient = postgres(env.DATABASE_URL, {
		max: 1,
		connect_timeout: 10,
	}) as any;

	const timeoutDb = drizzle(timeoutClient, { schema });

	try {
		return await fn(timeoutDb);
	} finally {
		await timeoutClient.end({ timeout: 5 });
	}
}
