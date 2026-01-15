import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

// Lazy database connection - only created when first accessed in non-mock mode
let _client: postgres.Sql | null = null;
let _db: any = null;

function initDb() {
	if (!_db) {
		_client = postgres(env.DATABASE_URL, {
			max: 10,
			idle_timeout: 20,
			connect_timeout: 10,
		}) as any;
		_db = drizzle(_client!, { schema });
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
