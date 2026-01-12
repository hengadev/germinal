import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

// Configure postgres client with timeouts to prevent long-running queries
const client = postgres(env.DATABASE_URL, {
	max: 10, // Maximum number of connections
	idle_timeout: 20, // Close idle connections after 20 seconds
	connect_timeout: 10, // Connection timeout in seconds
	// Apply statement timeout to all connections in the pool
	onconnect: async (connection) => {
		await connection.unsafe('SET statement_timeout = 10000'); // 10 seconds in milliseconds
	},
});

export const db = drizzle(client, { schema });

/**
 * Execute a function with a custom statement timeout
 * Use this for operations that may take longer than the default 10s timeout
 */
export async function withTimeout<T>(
	timeoutMs: number,
	fn: (db: typeof db) => Promise<T>
): Promise<T> {
	// Create a new connection with custom timeout for this operation
	const timeoutClient = postgres(env.DATABASE_URL, {
		max: 1,
		connect_timeout: 10,
		onconnect: async (connection) => {
			await connection.unsafe(`SET statement_timeout = ${timeoutMs}`);
		},
	});

	const timeoutDb = drizzle(timeoutClient, { schema });

	try {
		return await fn(timeoutDb);
	} finally {
		await timeoutClient.end({ timeout: 5 });
	}
}
