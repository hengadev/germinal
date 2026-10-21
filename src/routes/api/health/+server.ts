import { json } from '@sveltejs/kit';
import { db, getQueryStats } from '$lib/server/db';
import { isSMTPEnabled, isS3Enabled, env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

/**
 * The public health answer: overall status, timestamp and commit SHA only
 * (issue 027). That is all the deploy script's SHA check, the container
 * healthcheck and the Promote workflow need; the detailed checks (database
 * latency, storage, scheduler, query statistics) and any error text are
 * logged, never returned.
 */
interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	// Commit SHA this build was made from, so deploys can verify what is
	// actually serving. Baked into the image as COMMIT_SHA at build time
	// (see Dockerfile); `dev` when no SHA was provided (pnpm dev, ad-hoc
	// builds) — never a fake version.
	sha: string;
}

export const GET: RequestHandler = async () => {
	const checks = {
		database: await checkDatabase(),
		smtp: checkSMTP(),
		storage: checkStorage(),
		scheduler: checkScheduler(),
	};

	// Determine overall status
	const isDegraded = Object.values(checks).some((check) => check.status === 'degraded');
	const isUnhealthy = Object.values(checks).some((check) => check.status === 'unhealthy');

	const overallStatus: 'healthy' | 'degraded' | 'unhealthy' = isUnhealthy
		? 'unhealthy'
		: isDegraded
			? 'degraded'
			: 'healthy';

	const metrics = getQueryStats();

	const health: HealthStatus = {
		status: overallStatus,
		timestamp: new Date().toISOString(),
		sha: process.env.COMMIT_SHA || 'dev',
	};

	// The details go to the log only
	logger.info(
		{
			status: overallStatus,
			checks,
			metrics,
		},
		'Health check performed'
	);

	// Return appropriate HTTP status code
	const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

	return json(health, { status: statusCode });
};

async function checkDatabase(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string; latency?: number }> {
	const startTime = Date.now();
	try {
		// Simple query to check database connection
		await db.execute('SELECT 1');
		const latency = Date.now() - startTime;

		if (latency > 1000) {
			return {
				status: 'unhealthy',
				message: `Database query slow (${latency}ms)`,
				latency,
			};
		}

		if (latency > 500) {
			return {
				status: 'degraded',
				message: `Database query slow (${latency}ms)`,
				latency,
			};
		}

		return { status: 'healthy', latency };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: errorMessage }, 'Database health check failed');
		return {
			status: 'unhealthy',
			message: errorMessage || 'Database connection failed',
		};
	}
}

function checkSMTP(): { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string } {
	if (!isSMTPEnabled()) {
		return { status: 'disabled', message: 'SMTP not configured' };
	}

	try {
		// SMTP configuration is validated on startup
		return { status: 'healthy' };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: errorMessage }, 'SMTP health check failed');
		return {
			status: 'unhealthy',
			message: errorMessage || 'SMTP configuration invalid',
		};
	}
}

function checkStorage(): { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string } {
	// Check if S3 is configured using the helper from env.ts
	if (!isS3Enabled()) {
		return { status: 'disabled', message: 'S3 not configured' };
	}

	try {
		// S3 configuration is validated on startup
		return { status: 'healthy' };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: errorMessage }, 'S3 health check failed');
		return {
			status: 'unhealthy',
			message: errorMessage || 'S3 configuration invalid',
		};
	}
}

function checkScheduler(): { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string } {
	// Check if scheduler is configured using env
	if (!env.USE_SCHEDULER) {
		return { status: 'disabled', message: 'Scheduler not enabled' };
	}

	try {
		// Scheduler status is checked via environment or runtime
		return { status: 'healthy' };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error({ error: errorMessage }, 'Scheduler health check failed');
		return {
			status: 'unhealthy',
			message: errorMessage || 'Scheduler status unknown',
		};
	}
}
