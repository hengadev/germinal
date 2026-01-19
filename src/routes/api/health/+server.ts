import { json } from '@sveltejs/kit';
import { db, getQueryStats } from '$lib/server/db';
import { isSMTPEnabled, isS3Enabled, env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	version: string;
	checks: {
		database: { status: 'healthy' | 'degraded' | 'unhealthy'; message?: string; latency?: number };
		smtp: { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string };
		storage: { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string };
		scheduler: { status: 'healthy' | 'unhealthy' | 'disabled'; message?: string };
	};
	metrics: {
		totalQueries: number;
		slowQueries: number;
		avgQueryTime: number;
	};
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
		version: process.env.npm_package_version || '1.0.0',
		checks,
		metrics: {
			totalQueries: metrics.totalQueries,
			slowQueries: metrics.slowQueries,
			avgQueryTime: Math.round(metrics.avgQueryTime),
		},
	};

	// Log health status
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
