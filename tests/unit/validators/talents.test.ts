// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTalentSchema } from '../../../src/lib/server/validators/talents';
import { safeSocialLinks } from '../../../src/lib/utils/social-links';

const UNSAFE = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>x</script>', '/relative/path', 'instagram.com/someone'];
const SAFE = ['https://instagram.com/someone', 'http://example.com'];

const base = {
	firstName: 'Ada',
	lastName: 'Lovelace',
	roleEn: 'Chef',
	roleFr: 'Cheffe',
	bioEn: 'Bio',
	bioFr: 'Bio',
};

describe('Talent schema: social links', () => {
	it.each(UNSAFE)('rejects %j', (value) => {
		for (const key of ['instagram', 'linkedin', 'twitter', 'website']) {
			const parsed = createTalentSchema.safeParse({ ...base, socialLinks: JSON.stringify({ [key]: value }) });
			expect(parsed.success, `${key}: ${value}`).toBe(false);
		}
	});

	it.each(SAFE)('accepts %j', (value) => {
		const parsed = createTalentSchema.safeParse({ ...base, socialLinks: JSON.stringify({ website: value }) });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(JSON.parse(parsed.data.socialLinks!)).toEqual({ website: value });
	});

	it('rejects unknown keys and non-JSON values', () => {
		expect(createTalentSchema.safeParse({ ...base, socialLinks: '{"email":"https://x.test"}' }).success).toBe(false);
		expect(createTalentSchema.safeParse({ ...base, socialLinks: 'not json' }).success).toBe(false);
	});
});

describe('public Talent page: safeSocialLinks', () => {
	it('drops stored non-http(s) values, unknown keys and broken JSON instead of rendering them', () => {
		expect(
			safeSocialLinks(
				JSON.stringify({
					instagram: 'javascript:alert(1)',
					twitter: 'data:text/html,x',
					linkedin: '/relative',
					website: 'https://ok.example',
					email: 'someone@example.com',
				})
			)
		).toEqual({ website: 'https://ok.example' });
		expect(safeSocialLinks('{broken')).toEqual({});
		expect(safeSocialLinks(null)).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// The admin form actions enforce the same rules as the API
// ---------------------------------------------------------------------------

const createTalent = vi.hoisted(() => vi.fn(async (data: unknown) => ({ id: 'new-id', ...(data as object) })));
const updateTalent = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('$lib/server/env', () => ({ env: { USE_MOCK_DATA: false } }));
vi.mock('$lib/server/services/talents', () => ({ createTalent, updateTalent }));
vi.mock('$lib/server/services/media', () => ({ deleteMedia: vi.fn() }));
vi.mock('$lib/server/db', () => ({ db: { update: vi.fn() } }));

const admin = { user: { id: 'a', email: 'a@example.com', role: 'admin' } };

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries({ ...base, published: 'true', ...fields })) data.set(key, value);
	return new Request('http://admin.localhost/admin/talents', { method: 'POST', body: data });
}

async function createAction(fields: Record<string, string>) {
	const { actions } = await import('../../../src/routes/(admin)/admin/talents/new/+page.server');
	return actions.default({ request: form(fields), locals: admin } as any);
}

async function editAction(fields: Record<string, string>) {
	const { actions } = await import('../../../src/routes/(admin)/admin/talents/[id]/+page.server');
	return actions.default({ request: form(fields), params: { id: 't1' }, locals: admin } as any);
}

describe('admin Talent form actions', () => {
	beforeEach(() => vi.clearAllMocks());

	it.each(UNSAFE)('create and edit reject the social link %j like the API', async (value) => {
		const created = (await createAction({ instagram: value })) as any;
		const edited = (await editAction({ website: value })) as any;

		expect(created.status).toBe(400);
		expect(edited.status).toBe(400);
		expect(createTalent).not.toHaveBeenCalled();
		expect(updateTalent).not.toHaveBeenCalled();
	});

	it('create and edit reject a missing required field like the API', async () => {
		expect(((await createAction({ bioFr: '' })) as any).status).toBe(400);
		expect(((await editAction({ firstName: '   ' })) as any).status).toBe(400);
		expect(createTalent).not.toHaveBeenCalled();
		expect(updateTalent).not.toHaveBeenCalled();
	});

	it('create saves what the API accepts', async () => {
		const result = await createAction({ instagram: ' https://instagram.com/ada ', city: 'Paris' });

		expect(result).toHaveProperty('success');
		expect(createTalent).toHaveBeenCalledOnce();
		const saved = createTalent.mock.calls[0][0] as Record<string, unknown>;
		expect(createTalentSchema.safeParse({ ...base, socialLinks: saved.socialLinks as string }).success).toBe(true);
		expect(JSON.parse(saved.socialLinks as string)).toEqual({ instagram: 'https://instagram.com/ada' });
		expect(saved).toMatchObject({ ...base, city: 'Paris', published: true, categoryId: null });
	});

	it('edit saves what the API accepts', async () => {
		const result = await editAction({ website: 'https://ada.example' });

		expect(result).toHaveProperty('success');
		expect(updateTalent).toHaveBeenCalledOnce();
		const [, saved] = updateTalent.mock.calls[0] as unknown as [string, Record<string, unknown>];
		expect(JSON.parse(saved.socialLinks as string)).toEqual({ website: 'https://ada.example' });
		expect(saved).toMatchObject({ ...base, published: true });
	});
});
