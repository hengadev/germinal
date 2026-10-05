// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
//
// `env` and the cached site-settings read are mocked so the maintenance
// resolver can be exercised across every combination of environment force and
// database toggle — including a failing settings read — without any Postgres.
// ---------------------------------------------------------------------------

const envMock = vi.hoisted(() => ({
	MAINTENANCE_MODE: false,
	USE_MOCK_DATA: false,
}));

const getCachedSiteSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/env', () => ({
	env: envMock,
}));

vi.mock('$lib/server/services/site-settings', () => ({
	getCachedSiteSettings: getCachedSiteSettingsMock,
}));

vi.mock('$lib/server/logger', () => ({
	logger: { error: vi.fn() },
}));

import { getMaintenanceState, isMaintenanceBypassPath } from '../../../src/lib/server/maintenance';

function settingsWith(maintenanceMode: boolean) {
	return { maintenanceMode };
}

describe('getMaintenanceState — env force vs database toggle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		envMock.MAINTENANCE_MODE = false;
		envMock.USE_MOCK_DATA = false;
	});

	it('env unset + database toggle off → maintenance off', async () => {
		getCachedSiteSettingsMock.mockResolvedValue(settingsWith(false));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: false, effective: false });
	});

	it('env unset + database toggle on → maintenance on', async () => {
		getCachedSiteSettingsMock.mockResolvedValue(settingsWith(true));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: false, effective: true });
	});

	it('env true + database toggle off → maintenance forced on, without reading the database', async () => {
		envMock.MAINTENANCE_MODE = true;
		getCachedSiteSettingsMock.mockResolvedValue(settingsWith(false));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: true, effective: true });
		expect(getCachedSiteSettingsMock).not.toHaveBeenCalled();
	});

	it('env true + database toggle on → maintenance forced on, without reading the database', async () => {
		envMock.MAINTENANCE_MODE = true;
		getCachedSiteSettingsMock.mockResolvedValue(settingsWith(true));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: true, effective: true });
		expect(getCachedSiteSettingsMock).not.toHaveBeenCalled();
	});

	it('env unset + settings read fails → fails open (maintenance off)', async () => {
		getCachedSiteSettingsMock.mockRejectedValue(new Error('connection refused'));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: false, effective: false });
	});

	it('env true + settings read would fail → maintenance still forced on (no fail-open)', async () => {
		// The env check happens before any database read, so an unreachable
		// database cannot expose the site.
		envMock.MAINTENANCE_MODE = true;
		getCachedSiteSettingsMock.mockRejectedValue(new Error('connection refused'));

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: true, effective: true });
		expect(getCachedSiteSettingsMock).not.toHaveBeenCalled();
	});

	it('env true + mock-data mode → maintenance forced on even without a database', async () => {
		envMock.MAINTENANCE_MODE = true;
		envMock.USE_MOCK_DATA = true;

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: true, effective: true });
		expect(getCachedSiteSettingsMock).not.toHaveBeenCalled();
	});

	it('env unset + mock-data mode → maintenance off, no database read', async () => {
		envMock.USE_MOCK_DATA = true;

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: false, effective: false });
		expect(getCachedSiteSettingsMock).not.toHaveBeenCalled();
	});

	it('env unset + no settings row → maintenance off', async () => {
		getCachedSiteSettingsMock.mockResolvedValue(null);

		const state = await getMaintenanceState();

		expect(state).toEqual({ forcedByEnv: false, effective: false });
	});
});

describe('isMaintenanceBypassPath — paths reachable during maintenance', () => {
	it('keeps the maintenance page itself reachable', () => {
		expect(isMaintenanceBypassPath('/maintenance')).toBe(true);
	});

	it('keeps the health endpoint reachable (deploy/uptime checks)', () => {
		expect(isMaintenanceBypassPath('/api/health')).toBe(true);
	});

	it('does not bypass other public paths', () => {
		expect(isMaintenanceBypassPath('/')).toBe(false);
		expect(isMaintenanceBypassPath('/events')).toBe(false);
		expect(isMaintenanceBypassPath('/api/reservations')).toBe(false);
	});
});
