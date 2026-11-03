/**
 * Gift cards (issue 063): a deep service. A card's balance always equals
 * its initial amount plus its ledger (negative used, positive credited),
 * and every movement locks the card row before writing, so two
 * concurrent redemptions can never overspend (like check-ins).
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { giftCardLedger, giftCards, users } from '../db/schema';
import { recordAuditLog } from './audit-log';
import {
	generateGiftCardCode,
	maskGiftCardCode,
	normaliseGiftCardCode
} from '$lib/utils/gift-card';

/** Why findUsable refused a card. */
export type GiftCardUnusableReason = 'unknown' | 'expired' | 'cancelled' | 'empty';

export type FindUsableResult =
	| { ok: true; card: GiftCard }
	| { ok: false; reason: GiftCardUnusableReason };

/** A card as returned to callers (never includes the raw code twice). */
export type GiftCard = typeof giftCards.$inferSelect;

export type LedgerReason = (typeof giftCardLedger.$inferSelect)['reason'];

export interface IssueGiftCardInput {
	/** Minor units (cents), strictly positive. */
	amount: number;
	/** Defaults to one year from now. */
	expiresAt?: Date;
	recipientName?: string | null;
	recipientEmail?: string | null;
	message?: string | null;
	buyerName?: string | null;
	buyerEmail?: string | null;
	origin?: 'online' | 'admin';
	stripeReference?: string | null;
}

/** Issue a card: balance starts at the initial amount, ledger empty. */
export async function issueGiftCard(
	input: IssueGiftCardInput
): Promise<GiftCard> {
	const expiresAt =
		input.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

	// Codes are random and unique; a collision retries with a fresh one.
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = generateGiftCardCode();
		try {
			const [card] = await db
				.insert(giftCards)
				.values({
					// Stored normalised (no dashes) — see normaliseGiftCardCode.
					code: normaliseGiftCardCode(code),
					initialAmount: input.amount,
					balance: input.amount,
					expiresAt,
					recipientName: input.recipientName ?? null,
					recipientEmail: input.recipientEmail ?? null,
					message: input.message ?? null,
					buyerName: input.buyerName ?? null,
					buyerEmail: input.buyerEmail ?? null,
					origin: input.origin ?? 'online',
					stripeReference: input.stripeReference ?? null
				})
				.returning();
			return card;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!message.includes('gift_cards_code_unique')) throw err;
		}
	}
	throw new Error('Impossible de générer un code unique.');
}

/**
 * Look a card up by typed code (any case, spaces or dashes) and say
 * whether it can pay: active, not expired, with a balance left.
 */
export async function findUsableGiftCard(
	typedCode: string
): Promise<FindUsableResult> {
	const code = normaliseGiftCardCode(typedCode);
	const [card] = await db
		.select()
		.from(giftCards)
		.where(eq(giftCards.code, code))
		.limit(1);
	if (!card) return { ok: false, reason: 'unknown' };
	if (card.status === 'cancelled') return { ok: false, reason: 'cancelled' };
	if (card.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
	if (card.balance <= 0) return { ok: false, reason: 'empty' };
	return { ok: true, card };
}

export type MovementResult =
	| { ok: true; card: GiftCard }
	| { ok: false; error: string };

interface MovementInput {
	/** Positive cents to redeem; never more than the balance. */
	amount: number;
	reason: Extract<LedgerReason, 'booking' | 'door'>;
	reservationId?: string | null;
	actorId?: string | null;
}

/**
 * Redeem: write a negative ledger row under a row lock and lower the
 * balance by the same amount. Refuses anything above the balance, so
 * concurrent redemptions can never overspend.
 */
export async function redeemGiftCard(
	typedCode: string,
	input: MovementInput
): Promise<MovementResult> {
	return moveBalance(typedCode, { ...input, amount: -input.amount });
}

/**
 * Credit: write a positive ledger row (a refund or an Admin top-up)
 * under a row lock. Never above the initial amount.
 */
export async function creditGiftCard(
	typedCode: string,
	input: {
		amount: number;
		reason: Extract<LedgerReason, 'refund' | 'admin_adjustment'>;
		reservationId?: string | null;
		actorId?: string | null;
	}
): Promise<MovementResult> {
	return moveBalance(typedCode, { ...input, amount: input.amount });
}

async function moveBalance(
	typedCode: string,
	input: { amount: number; reason: LedgerReason; reservationId?: string | null; actorId?: string | null }
): Promise<MovementResult> {
	const code = normaliseGiftCardCode(typedCode);
	try {
		return await db.transaction(async (tx) => {
			const [card] = await tx
				.select()
				.from(giftCards)
				.where(eq(giftCards.code, code))
				.limit(1)
				.for('update');
			if (!card) return { ok: false as const, error: 'Carte inconnue.' };
			if (card.status === 'cancelled')
				return { ok: false as const, error: 'Carte annulée.' };
			if (card.expiresAt.getTime() <= Date.now())
				return { ok: false as const, error: 'Carte expirée.' };

			const next = card.balance + input.amount;
			if (next < 0)
				return { ok: false as const, error: 'Solde insuffisant.' };
			if (next > card.initialAmount)
				return { ok: false as const, error: 'Le solde dépasserait le montant initial.' };

			await tx.insert(giftCardLedger).values({
				giftCardId: card.id,
				amount: input.amount,
				reason: input.reason,
				reservationId: input.reservationId ?? null,
				actorId: input.actorId ?? null
			});
			const [updated] = await tx
				.update(giftCards)
				.set({ balance: next, updatedAt: new Date() })
				.where(eq(giftCards.id, card.id))
				.returning();
			return { ok: true as const, card: updated };
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('gift_cards_balance_check'))
			return { ok: false as const, error: 'Solde insuffisant.' };
		throw err;
	}
}

/** A card row for a normalised code or a UUID, whichever was passed. */
async function byCodeOrId(typed: string): Promise<GiftCard | undefined> {
	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(typed);
	const [card] = await db
		.select()
		.from(giftCards)
		.where(
			isUuid
				? eq(giftCards.id, typed)
				: eq(giftCards.code, normaliseGiftCardCode(typed))
		)
		.limit(1);
	return card;
}

/** Prolong a card: move its expiry. */
export async function extendGiftCard(
	typedCodeOrId: string,
	newExpiry: Date
): Promise<MovementResult> {
	const card = await byCodeOrId(typedCodeOrId);
	if (!card) return { ok: false as const, error: 'Carte inconnue.' };
	const [updated] = await db
		.update(giftCards)
		.set({ expiresAt: newExpiry, updatedAt: new Date() })
		.where(eq(giftCards.id, card.id))
		.returning();
	return { ok: true as const, card: updated };
}

/**
 * Cancel a card: status cancelled (the ledger stays for the record).
 * An Admin action — records an audit entry with the masked code.
 */
export async function cancelGiftCard(
	typedCodeOrId: string,
	actorId: string
): Promise<MovementResult> {
	const existing = await byCodeOrId(typedCodeOrId);
	if (!existing) return { ok: false as const, error: 'Carte inconnue.' };
	const [updated] = await db
		.update(giftCards)
		.set({ status: 'cancelled', updatedAt: new Date() })
		.where(and(eq(giftCards.id, existing.id), sql`${giftCards.status} = 'active'`))
		.returning();
	if (!updated)
		return { ok: false as const, error: 'Carte inconnue ou déjà annulée.' };
	await recordAuditLog({
		adminId: actorId,
		action: 'gift_card.cancel',
		entityType: 'gift_card',
		entityId: updated.id,
		metadata: { code: maskGiftCardCode(updated.code), balance: updated.balance }
	});
	return { ok: true as const, card: updated };
}

export type GiftCardStatusFilter = 'active' | 'used_up' | 'expired' | 'cancelled';

/** The Admin list, with search and the status filter (issue 063). */
export async function listGiftCards(options: {
	search?: string;
	status?: GiftCardStatusFilter;
}): Promise<GiftCard[]> {
	const conditions = [];
	const search = options.search?.trim() ?? '';
	if (search !== '') {
		const pattern = `%${search}%`;
		conditions.push(
			or(
				ilike(giftCards.code, `%${normaliseGiftCardCode(search)}%`),
				ilike(giftCards.recipientName, pattern),
				ilike(giftCards.recipientEmail, pattern),
				ilike(giftCards.buyerName, pattern),
				ilike(giftCards.buyerEmail, pattern)
			)
		);
	}
	switch (options.status) {
		case 'active':
			conditions.push(
				sql`${giftCards.status} = 'active' AND ${giftCards.balance} > 0 AND ${giftCards.expiresAt} > now()`
			);
			break;
		case 'used_up':
			conditions.push(
				sql`${giftCards.status} = 'active' AND ${giftCards.balance} <= 0`
			);
			break;
		case 'expired':
			conditions.push(
				sql`${giftCards.status} = 'active' AND ${giftCards.expiresAt} <= now()`
			);
			break;
		case 'cancelled':
			conditions.push(sql`${giftCards.status} = 'cancelled'`);
			break;
	}
	return db
		.select()
		.from(giftCards)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(giftCards.createdAt))
		.limit(200);
}

export interface GiftCardLedgerRow {
	id: string;
	amount: number;
	reason: LedgerReason;
	createdAt: Date;
	reservationId: string | null;
	actorName: string | null;
}

/** A card with its ledger, newest first, for the detail page. */
export async function getGiftCard(
	id: string
): Promise<{ card: GiftCard; ledger: GiftCardLedgerRow[] } | null> {
	const [card] = await db
		.select()
		.from(giftCards)
		.where(eq(giftCards.id, id))
		.limit(1);
	if (!card) return null;
	const ledger = await db
		.select({
			id: giftCardLedger.id,
			amount: giftCardLedger.amount,
			reason: giftCardLedger.reason,
			createdAt: giftCardLedger.createdAt,
			reservationId: giftCardLedger.reservationId,
			actorName: users.name
		})
		.from(giftCardLedger)
		.leftJoin(users, eq(users.id, giftCardLedger.actorId))
		.where(eq(giftCardLedger.giftCardId, id))
		.orderBy(desc(giftCardLedger.createdAt), desc(giftCardLedger.id));
	return { card, ledger };
}

/** Used by tests and the balance arithmetic (issue 065 will reuse it). */
export async function ledgerSum(cardId: string): Promise<number> {
	const [row] = await db
		.select({ total: sql<number>`coalesce(sum(${giftCardLedger.amount}), 0)::int` })
		.from(giftCardLedger)
		.where(eq(giftCardLedger.giftCardId, cardId));
	return row?.total ?? 0;
}
