// @vitest-environment node
//
// Static tripwire for the container-hardening and image-pinning contracts of
// the production and staging compose files (issue 028, PRD M5). The compose
// harness (infrastructure/compose/test/run-harness.sh) proves the settings
// on live containers; this guards the files themselves in every `pnpm test`
// run, so a reverted key or an unpinned image fails in seconds, not after a
// ten-minute Docker harness.
//
// The compose files use a deliberately restricted YAML subset (plain file,
// no anchors, no multiline scalars; ADR 0004), parsed here by indentation
// rather than by a YAML dependency.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const composeDir = join(repoRoot, 'infrastructure/compose');

/** Parsed view of one compose file: service name -> key -> string|string[]. */
type ParsedService = Record<string, string | string[]>;
type ParsedCompose = Record<string, ParsedService>;

/**
 * Parses the subset these files use: top-level keys at column 0, service
 * names indented 2 under `services:`, scalar/list keys indented 4, list
 * items indented 6 (`- x`). Inline flow lists (`[a, b]`) and trailing
 * ` # comments` are handled; nothing else is.
 */
function parseCompose(path: string): ParsedCompose {
	const services: ParsedCompose = {};
	let inServices = false;
	let service: string | null = null;
	let key: string | null = null;

	for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
		if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
		const line = rawLine.replace(/\r$/, '');
		const indent = line.length - line.trimStart().length;
		const text = line.trim();

		if (indent === 0) {
			inServices = text === 'services:';
			service = null;
			key = null;
			continue;
		}
		if (!inServices || service === null && indent !== 2 || indent < 2) continue;

		if (indent === 2) {
			service = text.replace(/:.*$/, '');
			key = null;
			services[service] ??= {};
			continue;
		}

		if (service === null) continue;
		if (indent === 4) {
			const match = text.match(/^([a-z_]+):(.*)$/);
			if (!match) continue;
			key = match[1];
			let value = match[2].trim();
			const comment = value.indexOf(' #');
			if (comment !== -1) value = value.slice(0, comment).trim();
			if (value === '') {
				services[service][key] = [];
			} else if (value.startsWith('[') && value.endsWith(']')) {
				services[service][key] = value
					.slice(1, -1)
					.split(',')
					.map((item) => item.trim())
					.filter((item) => item !== '');
			} else {
				services[service][key] = value;
			}
		} else if (indent === 6 && text.startsWith('- ') && key !== null) {
			const existing = services[service][key];
			const item = text.slice(2).trim();
			services[service][key] = Array.isArray(existing) ? [...existing, item] : [item];
		}
	}
	return services;
}

const prod = parseCompose(join(composeDir, 'docker-compose.prod.yml'));
const staging = parseCompose(join(composeDir, 'docker-compose.staging.yml'));

const asList = (value: string | string[] | undefined): string[] =>
	Array.isArray(value) ? value : value === undefined ? [] : [value];
const asScalar = (value: string | string[] | undefined): string | undefined =>
	Array.isArray(value) ? undefined : value;

/** The full hardening block every app-image service carries (issue 028). */
function expectHardenedApp(service: ParsedService, name: string): void {
	expect(asList(service['cap_drop']), `${name}: cap_drop`).toContain('ALL');
	expect(asList(service['cap_add']), `${name}: cap_add`).toEqual([]);
	expect(
		asList(service['security_opt']).some((opt) => opt.includes('no-new-privileges')),
		`${name}: security_opt`
	).toBe(true);
	expect(Number(asScalar(service['pids_limit'])), `${name}: pids_limit`).toBeGreaterThan(0);
	expect(asScalar(service['read_only']), `${name}: read_only`).toBe('true');
	// The only writable paths: /tmp as tmpfs (uploads is a service-specific
	// bind mount, asserted per file below).
	expect(asList(service['tmpfs']).join('\n'), `${name}: tmpfs`).toMatch(/\/tmp/);
}

describe('compose files: Caddy image pinned by digest (issue 028)', () => {
	it("prod's caddy service references the image by @sha256: digest, never a moving tag", () => {
		expect(asScalar(prod['caddy']?.['image'])).toMatch(
			/^serfriz\/caddy-cloudflare@sha256:[0-9a-f]{64}$/
		);
	});

	it('staging runs no proxy of its own (nothing to pin)', () => {
		expect(Object.keys(staging).includes('caddy')).toBe(false);
	});
});

describe('compose files: least-privilege containers (issue 028)', () => {
	it('hardens the app-image services (app, admin, staging_app, staging_admin)', () => {
		expectHardenedApp(prod['app'], 'prod app');
		expectHardenedApp(prod['admin'], 'prod admin');
		expectHardenedApp(staging['staging_app'], 'staging_app');
		expectHardenedApp(staging['staging_admin'], 'staging_admin');
	});

	it("keeps the app's uploads bind mount writable", () => {
		expect(asList(prod['app']?.['volumes']).join('\n')).toMatch(/:\/app\/uploads$/m);
		expect(asList(staging['staging_app']?.['volumes']).join('\n')).toMatch(/:\/app\/uploads$/m);
	});

	it('drops all capabilities on redis, adding back only the entrypoint three', () => {
		const redis = prod['redis'];
		expect(asList(redis?.['cap_drop'])).toContain('ALL');
		expect([...asList(redis?.['cap_add'])].sort()).toEqual(['CHOWN', 'SETGID', 'SETUID']);
		expect(
			asList(redis?.['security_opt']).some((opt) => opt.includes('no-new-privileges'))
		).toBe(true);
		expect(Number(asScalar(redis?.['pids_limit']))).toBeGreaterThan(0);
		expect(asScalar(redis?.['read_only'])).toBe('true');
		// /data is the one writable mount (AOF lives there).
		expect(asList(redis?.['volumes']).join('\n')).toMatch(/:\/data$/m);
	});

	it('gives postgres and caddy only no-new-privileges and a pids limit', () => {
		for (const name of ['postgres', 'caddy']) {
			const service = prod[name];
			expect(
				asList(service?.['security_opt']).some((opt) => opt.includes('no-new-privileges')),
				`${name}: security_opt`
			).toBe(true);
			expect(Number(asScalar(service?.['pids_limit'])), `${name}: pids_limit`).toBeGreaterThan(0);
			expect(asScalar(service?.['read_only']), `${name}: read_only`).toBeUndefined();
			expect(asList(service?.['cap_drop']), `${name}: cap_drop`).toEqual([]);
		}
	});
});
