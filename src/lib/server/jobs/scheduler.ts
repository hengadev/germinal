import * as PgBossModule from 'pg-boss';
const PgBoss = (PgBossModule as any).default || PgBossModule;
import { env } from '../env';
import { cleanupExpiredReservations } from './cleanup-expired-reservations';
import { processEmailQueue } from './process-email-queue';
import { deleteExpiredSessions } from '../session';

let boss: InstanceType<typeof PgBoss> | null = null;

/**
 * Initialize the job scheduler using pg-boss
 * Uses PostgreSQL as the job queue backend
 */
export async function initJobScheduler() {
	if (boss) {
		console.log('⚠️  Job scheduler already initialized');
		return boss;
	}

	boss = new PgBoss({
		connectionString: env.DATABASE_URL,
		schema: 'pgboss', // Separate schema for job tables
		retryLimit: 3,
		retryDelay: 60, // 1 minute
		expireInHours: 24,
		archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // 7 days
	});

	boss.on('error', (error) => {
		console.error('[Job Scheduler] Error:', error);
	});

	await boss.start();
	console.log('✅ Job scheduler started');

	// Register job handlers
	await boss.work('cleanup-expired-reservations', { teamSize: 1 }, async () => {
		console.log('[Job] Running cleanup-expired-reservations');
		const result = await cleanupExpiredReservations();
		return { cleaned: result.cleaned };
	});

	await boss.work('cleanup-expired-sessions', { teamSize: 1 }, async () => {
		console.log('[Job] Running cleanup-expired-sessions');
		const deleted = await deleteExpiredSessions();
		return { deleted };
	});

	await boss.work('process-email-queue', { teamSize: 2 }, async () => {
		console.log('[Job] Running process-email-queue');
		const result = await processEmailQueue();
		return { processed: result.processed, sent: result.sent, failed: result.failed };
	});

	// Schedule recurring jobs using cron syntax
	// Every 5 minutes
	await boss.schedule('cleanup-expired-reservations', '*/5 * * * *');
	// Every hour
	await boss.schedule('cleanup-expired-sessions', '0 * * * *');
	// Every 2 minutes
	await boss.schedule('process-email-queue', '*/2 * * * *');

	console.log('✅ Jobs scheduled');

	return boss;
}

/**
 * Stop the job scheduler gracefully
 */
export async function stopJobScheduler() {
	if (boss) {
		await boss.stop();
		boss = null;
		console.log('✅ Job scheduler stopped');
	}
}

/**
 * Schedule a one-off job to run immediately
 */
export async function scheduleJob<T>(name: string, data?: T) {
	if (!boss) {
		throw new Error('Job scheduler not initialized. Call initJobScheduler() first.');
	}

	await boss.send(name, data);
	console.log(`[Job Scheduler] Scheduled job: ${name}`);
}

/**
 * Get the pg-boss instance for advanced usage
 */
export function getJobScheduler(): InstanceType<typeof PgBoss> | null {
	return boss;
}
