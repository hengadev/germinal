// @vitest-environment node
//
// Guards the Infisical Agent env templates (issue 006) without any network
// access:
//   1. every template reads exactly its intended folders, through the
//      project ID and the __GERMINAL_ENV__ placeholder only;
//   2. the placeholder substitution (render-template.sh) produces concrete
//      per-environment copies and rejects invalid slugs;
//   3. the deliberate ordering choices hold: /app is the last folder
//      app.env reads and /backup the last folder backup.env reads, because
//      the Agent's change detection only tracks a template's LAST secret
//      call (issue 005).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const templatesDir = resolve(repoRoot, 'infrastructure/infisical/templates');
const renderScript = resolve(repoRoot, 'infrastructure/infisical/render-template.sh');

/** Not secret (issue 006): the Infisical project ID of `germinal`. */
const PROJECT_ID = '78c404c2-a76c-4967-8ff0-e7544f1b6fff';
const ENV_PLACEHOLDER = '__GERMINAL_ENV__';

/** Template file -> the folders its listSecrets calls must read, in order. */
const EXPECTED_FOLDERS: Record<string, string[]> = {
	'app.env.tmpl': ['/redis', '/stripe', '/s3', '/smtp', '/twilio', '/sentry', '/db', '/app'],
	'postgres.env.tmpl': ['/db'],
	'caddy.env.tmpl': ['/caddy'],
	'backup.env.tmpl': ['/db', '/backup'],
	'admin.env.tmpl': ['/admin']
};

/** Folder -> how many keys the rendered file prints for it (one emitter per
 * folder; /db prints only derived atoms, never its raw keys). */
const PRINTED_FOLDERS: Record<string, string[]> = {
	'app.env.tmpl': ['/redis', '/stripe', '/s3', '/smtp', '/twilio', '/sentry', '/app'],
	'postgres.env.tmpl': ['/db'],
	'caddy.env.tmpl': ['/caddy'],
	'backup.env.tmpl': ['/backup'],
	'admin.env.tmpl': ['/admin']
};

/** Every listSecrets call in a template: project, env and folder args. */
function secretCalls(name: string): { project: string; env: string; folder: string }[] {
	const text = readFileSync(resolve(templatesDir, name), 'utf8');
	const calls = [...text.matchAll(/listSecrets\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"/g)];
	return calls.map((m) => ({ project: m[1]!, env: m[2]!, folder: m[3]! }));
}

describe('Infisical Agent templates', () => {
	for (const [name, folders] of Object.entries(EXPECTED_FOLDERS)) {
		describe(name, () => {
			it('reads exactly the intended folders, in order', () => {
				expect(secretCalls(name).map((c) => c.folder)).toEqual(folders);
			});

			it('targets the germinal project and the env placeholder in every call', () => {
				for (const call of secretCalls(name)) {
					expect(call.project).toBe(PROJECT_ID);
					expect(call.env).toBe(ENV_PLACEHOLDER);
				}
			});

			it('prints whole folders (one emitter per printed folder)', () => {
				const text = readFileSync(resolve(templatesDir, name), 'utf8');
				const emitters = text.match(/\{\{ \.Key \}\}=\{\{ \.Value \}\}/g) ?? [];
				expect(emitters).toHaveLength(PRINTED_FOLDERS[name]!.length);
			});
		});
	}

	describe('app.env.tmpl', () => {
		const text = readFileSync(resolve(templatesDir, 'app.env.tmpl'), 'utf8');

		it('ends with /app: the Agent change-detects only the last call (issue 005)', () => {
			const folders = secretCalls('app.env.tmpl').map((c) => c.folder);
			expect(folders.at(-1)).toBe('/app');
		});

		it('assembles DATABASE_URL from the /db atoms with urlquery', () => {
			expect(text).toMatch(
				/DATABASE_URL=postgresql:\/\/\{\{ urlquery \$pgUser \}\}:\{\{ urlquery \$pgPassword \}\}@\{\{ \$pgHost \}\}:\{\{ \$pgPort \}\}\/\{\{ \$pgDb \}\}/
			);
			for (const atom of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB']) {
				expect(text).toContain(`eq .Key "${atom}"`);
			}
		});

		it('never gives the app the raw /db keys or any /admin value', () => {
			// The /db range only collects atoms (its five `eq .Key` picks are
			// asserted above); whole-folder printing is limited to the seven
			// non-db emitters counted above, and /admin is not among the folders
			// app.env reads — restated here because ADMIN_PASSWORD reaching the
			// running app is the property issue 016 guards.
			const folders = secretCalls('app.env.tmpl').map((c) => c.folder);
			expect(folders).not.toContain('/admin');
			expect(folders.filter((f) => f === '/db')).toHaveLength(1);
		});
	});

	describe('backup.env.tmpl', () => {
		const text = readFileSync(resolve(templatesDir, 'backup.env.tmpl'), 'utf8');

		it('ends with /backup: the Agent change-detects only the last call (issue 005)', () => {
			const folders = secretCalls('backup.env.tmpl').map((c) => c.folder);
			expect(folders.at(-1)).toBe('/backup');
		});

		it('prints exactly the two /db atoms the backup job needs', () => {
			expect(text).toContain('POSTGRES_USER={{ $pgUser }}');
			expect(text).toContain('POSTGRES_DB={{ $pgDb }}');
			expect(text).not.toContain('POSTGRES_PASSWORD');
		});
	});
});

describe('render-template.sh (env placeholder substitution)', () => {
	const template = resolve(templatesDir, 'app.env.tmpl');

	const render = (slug: string) =>
		execFileSync('sh', [renderScript, template, slug], { encoding: 'utf8' });

	/** Runs the script expecting failure; returns its combined output. */
	const renderExpectFailure = (args: string[]): string => {
		try {
			execFileSync('sh', [renderScript, ...args], { encoding: 'utf8', stdio: 'pipe' });
		} catch (error) {
			const err = error as { stderr?: string };
			return err.stderr ?? '';
		}
		throw new Error(`expected render-template.sh to fail: ${args.join(' ')}`);
	};

	it('substitutes every placeholder with the environment slug', () => {
		const rendered = render('dev');
		expect(rendered).not.toContain(ENV_PLACEHOLDER);
		expect(rendered).toContain('"dev" "/redis"');
		expect(rendered).toContain('"dev" "/app"');

		const staged = render('staging');
		expect(staged).not.toContain(ENV_PLACEHOLDER);
		expect(staged).toContain('"staging" "/db"');
	});

	it('leaves the source template untouched', () => {
		render('dev');
		expect(readFileSync(template, 'utf8')).toContain(`"__GERMINAL_ENV__" "/redis"`);
	});

	it('rejects invalid environment slugs', () => {
		for (const slug of ['DEV', 'prod ', 'a/b', '', 'x;y']) {
			const stderr = renderExpectFailure([template, slug]);
			expect(stderr, `slug: ${slug}`).toMatch(/invalid environment slug/);
		}
	});

	it('fails clearly for a missing template', () => {
		const stderr = renderExpectFailure([resolve(templatesDir, 'nope.tmpl'), 'dev']);
		expect(stderr).toMatch(/not found/);
	});
});
