import { describe, it, expect } from 'vitest';
import {
	giftCardPurchaseSchema,
	parseFreeAmount,
	GIFT_CARD_MIN_AMOUNT,
	GIFT_CARD_MAX_AMOUNT
} from '../../../src/lib/server/validators/gift-card';

const base = {
	amount: '10000',
	customAmount: '',
	buyerName: 'Marie Dupont',
	buyerEmail: 'Marie@Example.com',
	recipientName: 'Jean Martin',
	recipientEmail: null,
	message: '',
	delivery: 'buyer',
	locale: 'fr',
	honeypot: null
};

describe('parseFreeAmount', () => {
	it('accepts French decimals', () => {
		expect(parseFreeAmount('75,50')).toBe(7550);
		expect(parseFreeAmount('75.5')).toBe(7550);
		expect(parseFreeAmount('20')).toBe(2000);
		expect(parseFreeAmount('1 000,00')).toBe(100000);
	});

	it('rejects anything else', () => {
		expect(parseFreeAmount('')).toBeNull();
		expect(parseFreeAmount('abc')).toBeNull();
		expect(parseFreeAmount('-5')).toBeNull();
		expect(parseFreeAmount('75,505')).toBeNull();
	});
});

describe('giftCardPurchaseSchema', () => {
	it('accepts a preset amount and lowercases emails', () => {
		const result = giftCardPurchaseSchema.safeParse(base);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.amountCents).toBe(10000);
			expect(result.data.buyerEmail).toBe('marie@example.com');
		}
	});

	it('accepts a valid free amount', () => {
		const result = giftCardPurchaseSchema.safeParse({
			...base,
			amount: 'custom',
			customAmount: '75,50'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.amountCents).toBe(7550);
	});

	it('rejects a free amount below the minimum and above the maximum', () => {
		for (const customAmount of ['19,99', '1000,01']) {
			const result = giftCardPurchaseSchema.safeParse({
				...base,
				amount: 'custom',
				customAmount
			});
			expect(result.success).toBe(false);
		}
		expect(GIFT_CARD_MIN_AMOUNT).toBe(2000);
		expect(GIFT_CARD_MAX_AMOUNT).toBe(100000);
	});

	it('rejects a malformed free amount', () => {
		const result = giftCardPurchaseSchema.safeParse({
			...base,
			amount: 'custom',
			customAmount: 'soixante'
		});
		expect(result.success).toBe(false);
	});

	it('requires the recipient email only when delivering to the recipient', () => {
		const toRecipient = giftCardPurchaseSchema.safeParse({
			...base,
			delivery: 'recipient',
			recipientEmail: null
		});
		expect(toRecipient.success).toBe(false);

		const ok = giftCardPurchaseSchema.safeParse({
			...base,
			delivery: 'recipient',
			recipientEmail: 'Jean@Example.com'
		});
		expect(ok.success).toBe(true);
	});

	it('rejects an invalid email and a filled honeypot', () => {
		const badEmail = giftCardPurchaseSchema.safeParse({
			...base,
			buyerEmail: 'not-an-email'
		});
		expect(badEmail.success).toBe(false);

		const bot = giftCardPurchaseSchema.safeParse({ ...base, honeypot: 'spam' });
		expect(bot.success).toBe(false);
	});

	it('caps the message length', () => {
		const result = giftCardPurchaseSchema.safeParse({
			...base,
			message: 'a'.repeat(501)
		});
		expect(result.success).toBe(false);
	});
});
