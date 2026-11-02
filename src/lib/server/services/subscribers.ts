/**
 * Newsletter subscribers (issue 052). A Guest ticks « Hear about Germinal's
 * next events » when booking; the subscription is created — and confirmed at
 * once, with no extra email — only when the Reservation is confirmed (paid,
 * or confirmed without payment). An expired or abandoned Reservation never
 * subscribes. A row is « on the list » only when confirmed and not
 * unsubscribed.
 */
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../db';
import { subscribers } from '../db/schema';

type Subscriber = typeof subscribers.$inferSelect;
import { normaliseEmail } from '$lib/utils/guest-email';
import { generateAccessToken } from '$lib/utils/tokens';

/** A transaction or the plain db handle, like the other services. */
type Handle = typeof db;

/** The Reservation fields the subscription is built from. */
interface ReservationConsent {
	guestEmail: string | null;
	guestName: string;
	locale: string | null;
	/** The box was ticked at booking (never true for Comps and Staff). */
	marketingConsent: boolean;
	isComp: boolean;
}

/**
 * Subscribe (and confirm at once) from a confirmed Reservation. Called in
 * the same transaction as the status change, by the winner only.
 *
 * - First subscription: the row is inserted, confirmed straight away.
 * - Already on the list: nothing changes — the original dates stand.
 * - Ticked again after an unsubscribe: re-subscribed with fresh dates and
 *   fresh tokens (the old unsubscribe link dies with its token).
 *
 * Never throws into the confirmation: callers keep it inside their
 * transaction, so a failure rolls the whole confirmation back rather than
 * silently losing the consent.
 */
export async function subscribeFromReservation(
	tx: Handle,
	reservation: ReservationConsent
): Promise<void> {
	if (!reservation.marketingConsent || reservation.isComp) return;
	const email = normaliseEmail(reservation.guestEmail);
	if (email === null) return;

	const [existing] = await tx.select().from(subscribers).where(eq(subscribers.email, email));

	if (!existing) {
		await tx.insert(subscribers).values({
			email,
			name: reservation.guestName,
			locale: reservation.locale,
			source: 'booking',
			consentAt: new Date(),
			confirmedAt: new Date(),
			confirmationToken: generateAccessToken(),
			unsubscribeToken: generateAccessToken(),
		}).onConflictDoNothing({ target: subscribers.email });
		return;
	}

	// Already on the list: the original consent and confirmation stand.
	if (existing.unsubscribedAt === null) return;

	await tx
		.update(subscribers)
		.set({
			name: reservation.guestName,
			locale: reservation.locale,
			source: 'booking',
			consentAt: new Date(),
			confirmedAt: new Date(),
			unsubscribedAt: null,
			confirmationToken: generateAccessToken(),
			unsubscribeToken: generateAccessToken(),
			updatedAt: new Date(),
		})
		.where(eq(subscribers.id, existing.id));
}

/**
 * Newsletter signup from the public form (issue 053), double opt-in.
 * Returns what the endpoint may say — which is always the same thing — and
 * whether a confirmation email may be queued (at most one per day per
 * address, and none for an address already confirmed and subscribed).
 */
export type SubscribeFromFormResult =
	| { ok: false }
	| { ok: true; sendEmail: false }
	| { ok: true; sendEmail: true; email: string; locale: string; confirmationToken: string };

/** One confirmation email per address per day at most. */
const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function subscribeFromForm(
	emailInput: string,
	locale: string | null
): Promise<SubscribeFromFormResult> {
	const email = normaliseEmail(emailInput);
	if (email === null) return { ok: false };

	const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email));
	const now = new Date();

	if (!existing) {
		const confirmationToken = generateAccessToken();
		await db
			.insert(subscribers)
			.values({
				email,
				locale,
				source: 'form',
				consentAt: now,
				confirmationToken,
				unsubscribeToken: generateAccessToken(),
			})
			.onConflictDoNothing({ target: subscribers.email });
		return { ok: true, sendEmail: true, email, locale: locale ?? 'en', confirmationToken };
	}

	// Already confirmed and on the list: no email, same answer.
	if (existing.confirmedAt !== null && existing.unsubscribedAt === null) {
		return { ok: true, sendEmail: false };
	}

	// Unconfirmed (or unsubscribed): at most one new confirmation per day,
	// counted from the last update (the insert or the previous resend).
	if (now.getTime() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
		return { ok: true, sendEmail: false };
	}

	const confirmationToken = generateAccessToken();
	await db
		.update(subscribers)
		.set({
			locale: locale ?? existing.locale,
			source: 'form',
			consentAt: now,
			confirmationToken,
			unsubscribeToken: generateAccessToken(),
			updatedAt: now,
		})
		.where(eq(subscribers.id, existing.id));
	return { ok: true, sendEmail: true, email, locale: locale ?? existing.locale ?? 'en', confirmationToken };
}

/**
 * Confirm a form signup by token (double opt-in, issue 053). One conditional
 * update: a link followed twice confirms once, and an already-unsubscribed
 * row that re-confirms goes back on the list.
 */
export async function confirmByToken(token: string): Promise<boolean> {
	const now = new Date();
	const [row] = await db
		.update(subscribers)
		.set({ confirmedAt: now, unsubscribedAt: null, updatedAt: now })
		.where(and(eq(subscribers.confirmationToken, token), isNull(subscribers.confirmedAt)))
		.returning({ id: subscribers.id });
	return row !== undefined;
}\n
/**
 * Unsubscribe by token (public page, no login): one conditional update, so
 * a link followed twice unsubscribes once. Returns whether the token matched
 * a subscriber still on the list.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
	const [row] = await db
		.update(subscribers)
		.set({ unsubscribedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(subscribers.unsubscribeToken, token), isNull(subscribers.unsubscribedAt)))
		.returning({ id: subscribers.id });
	return row !== undefined;
}

/**
 * The subscriber an unsubscribe token belongs to, or null. The public page
 * shows the same neutral message for an absent and an unknown token, so it
 * only needs to know whether a live token was given.
 */
export async function subscriberByUnsubscribeToken(token: string): Promise<Subscriber | null> {
	const [row] = await db
		.select()
		.from(subscribers)
		.where(eq(subscribers.unsubscribeToken, token));
	return row ?? null;
}
