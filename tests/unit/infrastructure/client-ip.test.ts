// @vitest-environment node
//
// Static tripwire for the real-client-IP contract (issue 012, PRD M1/M5):
// Caddy trusts only Cloudflare's ranges and reads CF-Connecting-IP, every
// reverse proxy hands the app {client_ip} in X-Real-IP and never forwards
// {remote_host} or an inbound X-Forwarded-For, and the origin firewall
// admits HTTP(S) from exactly the ranges Caddy trusts. The compose harness
// proves the behaviour on a live Caddy; this guards the source files.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const caddyfile = read('infrastructure/ansible/roles/caddy/templates/Caddyfile.j2');
const caddyDefaults = read('infrastructure/ansible/roles/caddy/defaults/main.yml');
const tfVariables = read('infrastructure/terraform/variables.tf');
const tfFirewall = read('infrastructure/terraform/firewall.tf');

/** The `reverse_proxy … { … }` blocks of the template. */
const reverseProxies = [...caddyfile.matchAll(/reverse_proxy [^\n{]+\{([\s\S]*?)\n {2}\}/g)].map((m) => m[1]);

/** The CIDR list items of a YAML list key (one `  - cidr` per line). */
function yamlList(source: string, key: string): string[] {
	const block = source.slice(source.indexOf(`${key}:`)).split('\n').slice(1);
	const items: string[] = [];
	for (const line of block) {
		const match = line.match(/^\s+-\s+(\S+)/);
		if (!match) break;
		items.push(match[1]);
	}
	return items;
}

/** The default list of a Terraform variable. */
function tfDefault(name: string): string[] {
	const start = tfVariables.indexOf(`variable "${name}"`);
	const body = tfVariables.slice(start, tfVariables.indexOf('\n}\n', start));
	return [...body.matchAll(/"([0-9a-f.:]+\/\d+)"/g)].map((m) => m[1]);
}

describe('Caddyfile template: real client IP', () => {
	it('trusts the configured proxy ranges and reads CF-Connecting-IP in the global options', () => {
		const global = caddyfile.slice(caddyfile.indexOf('{'), caddyfile.indexOf('\n}\n'));
		expect(global).toMatch(/servers \{[\s\S]*trusted_proxies static \{\{ caddy_trusted_proxies \| join\(' '\) \}\}/);
		expect(global).toMatch(/client_ip_headers CF-Connecting-IP/);
	});

	it('sends X-Real-IP {client_ip} and drops X-Forwarded-For in every reverse proxy', () => {
		// prod public/admin/staff + staging public/admin/staff
		expect(reverseProxies).toHaveLength(6);
		for (const block of reverseProxies) {
			expect(block).toMatch(/header_up X-Real-IP \{client_ip\}/);
			expect(block).toMatch(/header_up -X-Forwarded-For/);
		}
	});

	it('forwards no {remote_host} anywhere', () => {
		expect(caddyfile).not.toContain('{remote_host}');
	});
});

describe('Cloudflare ranges', () => {
	const trusted = yamlList(caddyDefaults, 'caddy_trusted_proxies');

	it('Caddy trusts exactly the ranges the origin firewall admits', () => {
		expect(trusted.length).toBeGreaterThan(10);
		expect([...trusted].sort()).toEqual(
			[...tfDefault('cloudflare_ipv4_ranges'), ...tfDefault('cloudflare_ipv6_ranges')].sort()
		);
	});

	it('the firewall admits 80/443 from those ranges only, and SSH from the allowlist only', () => {
		const rules = [...tfFirewall.matchAll(/rule \{([\s\S]*?)\n {2}\}/g)].map((m) => m[1]);
		const web = rules.filter((rule) => /port\s+=\s+"(80|443)"/.test(rule));
		expect(web).toHaveLength(3);
		for (const rule of web) {
			expect(rule).toMatch(/source_ips\s+=\s+concat\(var\.cloudflare_ipv4_ranges, var\.cloudflare_ipv6_ranges\)/);
		}
		const ssh = rules.filter((rule) => /var\.ssh_port/.test(rule));
		expect(ssh).toHaveLength(1);
		expect(ssh[0]).toMatch(/source_ips\s+=\s+var\.ssh_allowed_ips/);
		expect(rules).toHaveLength(4);
	});

	it('the SSH allowlist has no permissive default', () => {
		const start = tfVariables.indexOf('variable "ssh_allowed_ips"');
		const body = tfVariables.slice(start, tfVariables.indexOf('\n}\n', start));
		expect(body).not.toMatch(/default\s*=/);
	});
});
