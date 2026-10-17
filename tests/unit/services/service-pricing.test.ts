import { describe, it, expect } from 'vitest';
import {
	parsePricingPayload,
	pricingPayloadErrorMessage,
	type PricingParseFailure,
} from '../../../src/lib/server/services/service-pricing';

const MENU_ID = '6f1c1a52-4b7e-4d1f-9a55-0a1b2c3d4e5f';
const LUNCH = '0b6c7d8e-1f20-4a3b-8c4d-5e6f70819203';
const DINNER = '1c7d8e9f-2031-4b4c-9d5e-6f7081920314';

function menu(overrides: Record<string, unknown> = {}) {
	return {
		key: MENU_ID,
		id: MENU_ID,
		nameEn: 'Tasting menu',
		nameFr: 'Menu dégustation',
		descriptionEn: null,
		descriptionFr: 'Entrée, plat, dessert',
		...overrides,
	};
}

function service(overrides: Record<string, unknown> = {}) {
	return {
		serviceId: LUNCH,
		menuKey: MENU_ID,
		priceAmount: 4500,
		clearLegacyPrices: false,
		...overrides,
	};
}

function parse(payload: unknown) {
	return parsePricingPayload(JSON.stringify(payload));
}

describe('parsePricingPayload', () => {
	it('accepts one Menu offered on two Services at different prices', () => {
		const result = parse({
			menus: [menu()],
			services: [service(), service({ serviceId: DINNER, priceAmount: 6500 })],
		});
		expect(result).toEqual({
			ok: true,
			payload: {
				menus: [menu()],
				services: [service(), service({ serviceId: DINNER, priceAmount: 6500 })],
			},
		});
	});

	it('accepts a zero price and an unset price', () => {
		const result = parse({
			menus: [],
			services: [service({ menuKey: null, priceAmount: 0 }), service({ serviceId: DINNER, menuKey: null, priceAmount: null })],
		});
		if (!result.ok) throw new Error('expected ok');
		expect(result.payload.services.map((entry) => entry.priceAmount)).toEqual([0, null]);
	});

	it('creates new Menus referenced by key and trims text', () => {
		const result = parse({
			menus: [menu({ key: 'new-0', id: null, nameEn: '  Lunch  ', descriptionFr: '   ' })],
			services: [service({ menuKey: 'new-0' })],
		});
		if (!result.ok) throw new Error('expected ok');
		expect(result.payload.menus[0]).toMatchObject({ id: null, nameEn: 'Lunch', descriptionFr: null });
		expect(result.payload.services[0]).toMatchObject({ menuKey: 'new-0' });
	});

	it('takes one currency for the Event, normalised, and none per Service (issue 042)', () => {
		const result = parse({ menus: [menu()], services: [service()], currency: ' chf ' });
		if (!result.ok) throw new Error('expected ok');
		expect(result.payload.currency).toBe('CHF');
		expect(result.payload.services[0]).not.toHaveProperty('currency');
	});

	it('leaves the currency out when the payload has none', () => {
		const result = parse({ menus: [menu()], services: [service()] });
		expect(result.ok && result.payload.currency).toBe(undefined);
	});

	it.each<[string, unknown, PricingParseFailure]>([
		['a missing payload', null, 'missing'],
		['a non-object', [], 'malformed'],
		['a Menu without a French name', { menus: [menu({ nameFr: ' ' })], services: [] }, 'menu-name'],
		['a Menu without an English name', { menus: [menu({ nameEn: '' })], services: [] }, 'menu-name'],
		['duplicate Menu keys', { menus: [menu(), menu({ id: null })], services: [] }, 'menu'],
		['a Service naming an unknown Menu', { menus: [], services: [service({ menuKey: 'nope' })] }, 'menu'],
		['a duplicate Service', { menus: [menu()], services: [service(), service()] }, 'service'],
		['a malformed Service id', { menus: [menu()], services: [service({ serviceId: 'x' })] }, 'service'],
		['a negative price', { menus: [menu()], services: [service({ priceAmount: -1 })] }, 'price'],
		['a fractional price in cents', { menus: [menu()], services: [service({ priceAmount: 12.5 })] }, 'price'],
		['an unknown currency', { menus: [menu()], services: [service()], currency: 'JPY' }, 'currency'],
		['a non-string currency', { menus: [menu()], services: [service()], currency: 978 }, 'currency'],
		['aligning legacy prices on an unset price', { menus: [menu()], services: [service({ priceAmount: null, clearLegacyPrices: true })] }, 'price'],
	])('rejects %s', (_label, payload, reason) => {
		const result = payload === null ? parsePricingPayload(null) : parse(payload);
		expect(result).toEqual({ ok: false, reason });
		expect(pricingPayloadErrorMessage(reason)).toMatch(/\S/);
	});

	it('rejects invalid JSON', () => {
		expect(parsePricingPayload('{')).toEqual({ ok: false, reason: 'malformed' });
	});
});

describe('parsePricingPayload — Deposit rule (issue 023)', () => {
	it('leaves the Deposit rule out when the payload has none', () => {
		const result = parse({ menus: [menu()], services: [service()] });
		expect(result.ok && result.payload.deposit).toBe(undefined);
	});

	it('accepts no Deposit, a fixed Deposit per seat and a percentage Deposit', () => {
		for (const deposit of [
			{ type: 'none', value: 0 },
			{ type: 'fixed', value: 2000 },
			{ type: 'percent', value: 30 },
			{ type: 'percent', value: 100 },
		]) {
			const result = parse({ menus: [menu()], services: [service()], deposit });
			expect(result).toEqual({ ok: true, payload: expect.objectContaining({ deposit }) });
		}
	});

	it('refuses invalid Deposit rules', () => {
		for (const deposit of [
			null,
			'percent',
			{ type: 'percent', value: 0 },
			{ type: 'percent', value: 101 },
			{ type: 'percent', value: 12.5 },
			{ type: 'fixed', value: 0 },
			{ type: 'fixed', value: '2000' },
			{ type: 'none', value: 10 },
			{ type: 'full', value: 100 },
		]) {
			expect(parse({ menus: [menu()], services: [service()], deposit })).toEqual({ ok: false, reason: 'deposit' });
		}
		expect(pricingPayloadErrorMessage('deposit')).toMatch(/acompte/i);
	});
});

describe('parsePricingPayload — Refund Policy (issue 027)', () => {
	const base = { menus: [menu()], services: [service()] };

	it('leaves the Refund Policy out when the payload has none', () => {
		const result = parse(base);
		expect(result.ok && result.payload.refundPolicy).toBe(undefined);
	});

	it('accepts rule-based tiers, sorted largest window first, and trims the texts', () => {
		const result = parse({
			...base,
			refundPolicy: {
				type: 'rules',
				textEn: '  ',
				textFr: ' Ancien texte ',
				tiers: [{ hoursBefore: 24, percent: 50 }, { hoursBefore: 168, percent: 100 }],
			},
		});
		expect(result).toEqual({
			ok: true,
			payload: expect.objectContaining({
				refundPolicy: {
					type: 'rules',
					textEn: null,
					textFr: 'Ancien texte',
					tiers: [{ hoursBefore: 168, percent: 100 }, { hoursBefore: 24, percent: 50 }],
				},
			}),
		});
	});

	it('accepts a manual policy with or without kept tiers', () => {
		for (const tiers of [[], [{ hoursBefore: 48, percent: 100 }]]) {
			const refundPolicy = { type: 'manual', textEn: 'On request.', textFr: null, tiers };
			expect(parse({ ...base, refundPolicy })).toEqual({ ok: true, payload: expect.objectContaining({ refundPolicy }) });
		}
	});

	it('refuses invalid Refund Policies', () => {
		for (const refundPolicy of [
			null,
			'rules',
			{ type: 'rules', textEn: null, textFr: null, tiers: [] },
			{ type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 12.5, percent: 100 }] },
			{ type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 50 }, { hoursBefore: 24, percent: 80 }] },
			{ type: 'manual', textEn: 'x'.repeat(2001), textFr: null, tiers: [] },
			{ type: 'manual', textEn: 42, textFr: null, tiers: [] },
			{ type: 'manual', textEn: null, textFr: null, tiers: [{ hoursBefore: -1, percent: 0 }] },
			{ type: 'partial', textEn: null, textFr: null, tiers: [] },
		]) {
			expect(parse({ ...base, refundPolicy })).toEqual({ ok: false, reason: 'refund-policy' });
		}
		expect(pricingPayloadErrorMessage('refund-policy')).toMatch(/remboursement/i);
	});
});
