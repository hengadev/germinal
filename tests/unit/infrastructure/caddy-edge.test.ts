// @vitest-environment node
//
// Static tripwire for the edge contract of issue 027: every Caddy site
// refuses /metrics, every proxied site (prod and staging, public/admin/staff)
// has a request-body limit and a JSON access log, and fail2ban reads all of
// those logs. The compose harness checks /metrics on a live Caddy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const caddyfile = read('infrastructure/ansible/roles/caddy/templates/Caddyfile.j2');
const jail = read('infrastructure/ansible/roles/fail2ban/templates/jail.local.j2');

/** Site blocks: a site address at column 0 followed by `{`, up to the closing `}` at column 0. */
const sites = [...caddyfile.matchAll(/^((?:\{\{|[^\s#{])[^\n]*?) \{\n([\s\S]*?)^\}/gm)].map((m) => ({
	address: m[1],
	body: m[2],
}));
const proxied = sites.filter((site) => site.body.includes('reverse_proxy'));

describe('Caddyfile template: edge', () => {
	it('has the six proxied sites (prod and staging × public/admin/staff) and the www redirect', () => {
		expect(proxied.map((site) => site.address).sort()).toEqual([
			'admin-staging.{{ app_domain }}',
			'admin.{{ app_domain }}',
			'staff-staging.{{ app_domain }}',
			'staff.{{ app_domain }}',
			'staging.{{ app_domain }}',
			'{{ app_domain }}',
		]);
		expect(sites.map((site) => site.address)).toContain('www.{{ app_domain }}');
	});

	it('answers /metrics with 404 on every site', () => {
		for (const site of sites) {
			expect(site.body, site.address).toMatch(/respond \/metrics\* 404/);
		}
	});

	it('gives every proxied site a request-body limit and its own JSON access log', () => {
		const logFiles = new Set<string>();
		for (const site of proxied) {
			expect(site.body, site.address).toMatch(/request_body \{\s*max_size /);
			expect(site.body, site.address).toMatch(/log \{[\s\S]*format json/);
			const file = site.body.match(/output file (\S+)/)?.[1];
			expect(file, site.address).toMatch(/^\/var\/log\/caddy\/[a-z-]*access\.log$/);
			logFiles.add(file!);
		}
		expect(logFiles.size).toBe(proxied.length);
	});

	it('the fail2ban Caddy jail reads every access log', () => {
		expect(jail).toMatch(/logpath = \{\{ caddy_data_dir \}\}\/logs\/\*access\.log/);
	});
});
