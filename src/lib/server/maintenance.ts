import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { getCachedSiteSettings } from '$lib/server/services/site-settings';

/**
 * Maintenance mode resolution.
 *
 * Effective state = environment force OR database toggle.
 *
 * - `MAINTENANCE_MODE=true` forces maintenance on *before any database read*,
 *   so it holds with an empty, fresh or unreachable database, and in
 *   mock-data mode (where there is no database to read from at all).
 * - Any other value (unset, `false`) leaves the database toggle — flipped
 *   from the admin settings page — in charge. If the settings read fails,
 *   maintenance stays off (fail open), as before.
 */

export interface MaintenanceState {
	/** True when MAINTENANCE_MODE=true forces maintenance regardless of the database. */
	forcedByEnv: boolean;
	/** The state the site should run in: env force OR database toggle. */
	effective: boolean;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
	// Env check first, so a forced state never depends on (or waits for) a
	// database round-trip.
	if (env.MAINTENANCE_MODE) {
		return { forcedByEnv: true, effective: true };
	}

	// In mock-data mode there is no DB to read from, so the database toggle
	// cannot apply; maintenance is off unless forced above.
	if (env.USE_MOCK_DATA) {
		return { forcedByEnv: false, effective: false };
	}

	try {
		const effective = (await getCachedSiteSettings())?.maintenanceMode === true;
		return { forcedByEnv: false, effective };
	} catch (err) {
		logger.error({ err }, '[Maintenance Mode] Failed to read site settings, failing open');
		return { forcedByEnv: false, effective: false };
	}
}

/** Paths that stay reachable while maintenance is on, on any domain. */
const MAINTENANCE_BYPASS_PATHS = new Set(['/maintenance', '/api/health']);

export function isMaintenanceBypassPath(pathname: string): boolean {
	return MAINTENANCE_BYPASS_PATHS.has(pathname);
}
