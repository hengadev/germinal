// @vitest-environment node
//
// Guards the Infisical Agent env templates (issue 006) without any network
// access:
//   1. every template reads exactly its intended folders, through the
//      project ID and the __GERMINAL_ENV__ placeholder only;
//   2. the placeholder substitution (render-template.sh) produces concrete
//      per-environment copies and rejects invalid slugs;
//   3. each template makes exactly ONE listSecrets call, because the
//      Agent's change detection only tracks a template's last secret call
//      (issue 005). Multi-folder templates use one recursive call and
//      filter on .SecretPath; the filter is pinned here because it is what
//      keeps /admin, /caddy, /backup and the raw /db keys out of app.env.
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

/** Template file -> the folder its single listSecrets call reads, and
 * whether that call is recursive (multi-folder templates). */
const EXPECTED_CALL: Record<string, { folder: string; recursive: boolean }> = {
	'app.env.tmpl': { folder: '/', recursive: true },
	'postgres.env.tmpl': { folder: '/db', recursive: false },
	'caddy.env.tmpl': { folder: '/caddy', recursive: false },
	'backup.env.tmpl': { folder: '/', recursive: true },
	'admin.env.tmpl': { folder: '/admin', recursive: false }
};

/** Recursive templates -> the folders whose keys are printed whole. */
const PRINTED_FOLDERS: Record<string, string[]> = {
	'app.env.tmpl': ['/app', '/redis', '/stripe', '/s3', '/smtp', '/twilio', '/sentry'],
	'backup.env.tmpl': ['/backup']
};

/** Folders whose keys are printed whole by a .SecretPath filter. */
function printedFolders(text: string): string[] {
	const printLine = text.split('\n').find((l) => l.startsWith('{{- if') && l.includes('.SecretPath'));
	return [...(printLine ?? '').matchAll(/eq \.SecretPath "([^"]+)"/g)].map((m) => m[1]!);
}

/** Every listSecrets call in a template: project, env and folder args. */
function secretCalls(
	name: string
): { project: string; env: string; folder: string; recursive: boolean }[] {
	const text = readFileSync(resolve(templatesDir, name), 'utf8');
	const calls = [
		...text.matchAll(/listSecrets\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"(\s+`\{"recursive": true\}`)?/g)
	];
	return calls.map((m) => ({ project: m[1]!, env: m[2]!, folder: m[3]!, recursive: !!m[4] }));
}

describe('Infisical Agent templates', () => {
	for (const [name, expected] of Object.entries(EXPECTED_CALL)) {
		describe(name, () => {
			it('makes exactly one listSecrets call (issue 005: only the last call is change-detected)', () => {
				const calls = secretCalls(name);
				expect(calls).toHaveLength(1);
				expect(calls[0]).toMatchObject(expected);
			});

			it('targets the germinal project and the env placeholder', () => {
				for (const call of secretCalls(name)) {
					expect(call.project).toBe(PROJECT_ID);
					expect(call.env).toBe(ENV_PLACEHOLDER);
				}
			});
		});
	}

	describe('app.env.tmpl', () => {
		const text = readFileSync(resolve(templatesDir, 'app.env.tmpl'), 'utf8');

		it('prints exactly the app folders, never /admin, /caddy, /backup, /host or raw /db keys', () => {
			expect(printedFolders(text).sort()).toEqual([...PRINTED_FOLDERS['app.env.tmpl']!].sort());
			expect(text.match(/\{\{ \.Key \}\}=\{\{ \.Value \}\}/g)).toHaveLength(1);
		});

		it('assembles DATABASE_URL from the /db atoms with urlquery', () => {
			expect(text).toMatch(
				/DATABASE_URL=postgresql:\/\/\{\{ urlquery \$pgUser \}\}:\{\{ urlquery \$pgPassword \}\}@\{\{ \$pgHost \}\}:\{\{ \$pgPort \}\}\/\{\{ \$pgDb \}\}/
			);
			for (const atom of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB']) {
				expect(text).toContain(`eq .Key "${atom}"`);
			}
		});
	});

	describe('backup.env.tmpl', () => {
		const text = readFileSync(resolve(templatesDir, 'backup.env.tmpl'), 'utf8');

		it('prints /backup whole and only the two /db atoms the backup job needs', () => {
			expect(printedFolders(text)).toEqual(PRINTED_FOLDERS['backup.env.tmpl']);
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
		expect(rendered).toContain('"dev" "/"');

		const staged = render('staging');
		expect(staged).not.toContain(ENV_PLACEHOLDER);
		expect(staged).toContain('"staging" "/"');
	});

	it('leaves the source template untouched', () => {
		render('dev');
		expect(readFileSync(template, 'utf8')).toContain(`"__GERMINAL_ENV__" "/"`);
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
