/**
 * Pure helpers for gift card codes (issue 063). The card's code is
 * unguessable: random characters from an alphabet with no ambiguous
 * glyph (no 0/O, no 1/I), shown in groups like GERM-XXXX-XXXX and
 * matched case-insensitively after stripping spaces and dashes.
 */

// No 0/O (zero/oh) and no 1/I (one/eye): both pairs look alike in print.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const GIFT_CARD_CODE_PREFIX = 'GERM';

/** One group of four random characters. Web Crypto, so this module also
 * loads in the browser (the Admin pages format codes with it); 256 is a
 * multiple of the 32-letter alphabet, so `byte % 32` is unbiased. */
function randomGroup(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(4));
	return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/** A fresh code, e.g. `GERM-7ZK9-M3XT`. */
export function generateGiftCardCode(): string {
	return `${GIFT_CARD_CODE_PREFIX}-${randomGroup()}-${randomGroup()}`;
}

/**
 * Normalise a typed or scanned code for lookup and storage: uppercase,
 * without spaces or dashes (`germ 7zk9-m3xt` → `GERM7ZK9M3XT`).
 */
export function normaliseGiftCardCode(input: string): string {
	return input.toUpperCase().replace(/[\s-]/g, '');
}

/** The code as shown to humans: uppercase groups (GERM-XXXX-XXXX). */
export function formatGiftCardCode(code: string): string {
	const normalised = normaliseGiftCardCode(code);
	if (normalised.length !== 12) return code;
	return `${normalised.slice(0, 4)}-${normalised.slice(4, 8)}-${normalised.slice(8, 12)}`;
}

/**
 * Split a Deposit (minor units) between a gift card's balance and
 * Stripe (issue 065): the card pays first, up to its balance, and Stripe
 * charges only the rest (0 when the card covers the whole Deposit).
 */
export function splitDeposit(
	deposit: number,
	cardBalance: number
): { card: number; stripe: number } {
	const safeDeposit = Math.max(0, deposit);
	const card = Math.min(safeDeposit, Math.max(0, cardBalance));
	return { card, stripe: safeDeposit - card };
}

/**
 * The invariant every movement maintains: the balance equals the initial
 * amount plus the ledger (negative used, positive credited).
 */
export function computeGiftCardBalance(initialAmount: number, movements: number[]): number {
	return movements.reduce((balance, amount) => balance + amount, initialAmount);
}

/**
 * For logs and the audit trail: never the full code, only the last four
 * characters (`GERM…M3XT`).
 */
export function maskGiftCardCode(code: string): string {
	const normalised = normaliseGiftCardCode(code);
	return `GERM…${normalised.slice(-4)}`;
}
