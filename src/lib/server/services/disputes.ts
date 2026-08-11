import { db } from '../db';
import { logger } from '$lib/server/logger';
import { disputes, payments } from '../db/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { sendDisputeAlertEmail } from './email';

/**
 * Resolve the ID string for a Stripe field that may be either an ID or an
 * expanded object.
 */
function resolveId(value: string | { id: string } | null | undefined): string | null {
	if (!value) return null;
	return typeof value === 'string' ? value : value.id;
}

/**
 * Look up the Payment a Stripe dispute belongs to, first by PaymentIntent ID
 * (most reliable — set as soon as a payment succeeds), falling back to the
 * charge ID.
 */
async function findPaymentForDispute(dispute: Stripe.Dispute) {
	const paymentIntentId = resolveId(dispute.payment_intent);
	const chargeId = resolveId(dispute.charge);

	if (paymentIntentId) {
		const payment = await db.query.payments.findFirst({
			where: eq(payments.stripePaymentIntentId, paymentIntentId),
			with: {
				reservation: {
					with: {
						eventSession: {
							with: { event: true },
						},
					},
				},
			},
		});
		if (payment) return payment;
	}

	if (chargeId) {
		const payment = await db.query.payments.findFirst({
			where: eq(payments.stripeChargeId, chargeId),
			with: {
				reservation: {
					with: {
						eventSession: {
							with: { event: true },
						},
					},
				},
			},
		});
		if (payment) return payment;
	}

	return null;
}

/**
 * Create-or-update the stored dispute record for a Stripe dispute event,
 * matched by `stripeDisputeId` so `charge.dispute.updated` / `.closed`
 * reflect the lifecycle on the same row instead of creating duplicates.
 *
 * Notifies the Admin the first time a dispute is recorded (regardless of
 * which of the three event types triggered the insert), and never again for
 * that dispute.
 */
async function upsertDispute(dispute: Stripe.Dispute, eventType: string): Promise<void> {
	const existing = await db.query.disputes.findFirst({
		where: eq(disputes.stripeDisputeId, dispute.id),
	});

	const evidenceDueBy = dispute.evidence_details?.due_by
		? new Date(dispute.evidence_details.due_by * 1000)
		: null;

	if (existing) {
		await db
			.update(disputes)
			.set({
				status: dispute.status,
				reason: dispute.reason ?? existing.reason,
				amount: dispute.amount,
				currency: dispute.currency?.toUpperCase() ?? existing.currency,
				evidenceDueBy,
				updatedAt: new Date(),
			})
			.where(eq(disputes.id, existing.id));

		logger.info(
			{ disputeId: dispute.id, eventType, status: dispute.status },
			'Dispute record updated',
		);
		return;
	}

	const payment = await findPaymentForDispute(dispute);

	if (!payment) {
		logger.warn(
			{
				disputeId: dispute.id,
				eventType,
				paymentIntentId: resolveId(dispute.payment_intent),
				chargeId: resolveId(dispute.charge),
			},
			'Dispute webhook received but no matching Payment was found',
		);
		return;
	}

	const [created] = await db
		.insert(disputes)
		.values({
			paymentId: payment.id,
			stripeDisputeId: dispute.id,
			stripeChargeId: resolveId(dispute.charge),
			status: dispute.status,
			reason: dispute.reason ?? null,
			amount: dispute.amount,
			currency: dispute.currency?.toUpperCase() ?? payment.currency,
			evidenceDueBy,
		})
		.returning();

	logger.info(
		{ disputeId: dispute.id, eventType, paymentId: payment.id },
		'Dispute record created',
	);

	try {
		await sendDisputeAlertEmail({
			stripeDisputeId: dispute.id,
			paymentId: payment.id,
			reservationId: payment.reservationId,
			guestName: payment.reservation.guestName,
			guestEmail: payment.reservation.guestEmail,
			eventTitle: payment.reservation.eventSession.event.titleEn,
			amount: dispute.amount,
			currency: created.currency,
			reason: dispute.reason ?? null,
			status: dispute.status,
			evidenceDueBy,
		});

		await db
			.update(disputes)
			.set({ adminNotifiedAt: new Date() })
			.where(eq(disputes.id, created.id));
	} catch (err) {
		logger.error(
			{ err, disputeId: dispute.id },
			'Failed to notify Admin of new Stripe dispute',
		);
		// Don't throw — the dispute record itself was saved successfully
	}
}

/**
 * Handle `charge.dispute.created` — a new dispute was opened against a charge.
 */
export async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
	await upsertDispute(dispute, 'charge.dispute.created');
}

/**
 * Handle `charge.dispute.updated` — e.g. evidence submitted, status changed.
 */
export async function handleDisputeUpdated(dispute: Stripe.Dispute): Promise<void> {
	await upsertDispute(dispute, 'charge.dispute.updated');
}

/**
 * Handle `charge.dispute.closed` — the dispute reached a final state
 * (`won`, `lost`, etc).
 */
export async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
	await upsertDispute(dispute, 'charge.dispute.closed');
}
