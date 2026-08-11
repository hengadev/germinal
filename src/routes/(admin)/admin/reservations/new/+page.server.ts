import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS } from '$lib/mock-data';
import { requireAdmin } from '$lib/server/auth-guards';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	if (env.USE_MOCK_DATA) {
		const now = new Date();
		const sessions = MOCK_SESSIONS
			.filter((s: any) => s.published && new Date(s.startTime) > now && s.availableCapacity > 0)
			.map((s: any) => {
				const event = MOCK_EVENTS.find((e: any) => e.id === s.eventId);
				return {
					id: s.id,
					titleEn: s.titleEn || s.title || '',
					eventTitle: event?.titleEn || '',
					startTime: new Date(s.startTime).toISOString(),
					availableCapacity: s.availableCapacity,
					priceAmount: s.priceAmount,
					currency: s.currency,
				};
			})
			.sort((a, b) => a.startTime.localeCompare(b.startTime));

		return { sessions };
	}

	const { db } = await import('$lib/server/db');
	const { eventSessions } = await import('$lib/server/db/schema');
	const { and, eq, gt, asc } = await import('drizzle-orm');

	const upcomingSessions = await db.query.eventSessions.findMany({
		where: and(
			eq(eventSessions.published, true),
			gt(eventSessions.startTime, new Date()),
			gt(eventSessions.availableCapacity, 0)
		),
		orderBy: [asc(eventSessions.startTime)],
		with: {
			event: {
				columns: { titleEn: true },
			},
		},
	});

	return {
		sessions: upcomingSessions.map((s: typeof upcomingSessions[number]) => ({
			id: s.id,
			titleEn: s.titleEn,
			eventTitle: s.event.titleEn,
			startTime: s.startTime.toISOString(),
			availableCapacity: s.availableCapacity,
			priceAmount: s.priceAmount,
			currency: s.currency,
		})),
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);

		const formData = await request.formData();
		const sessionId = formData.get('sessionId')?.toString();
		const name = formData.get('name')?.toString().trim();
		const email = formData.get('email')?.toString().trim();
		const phone = formData.get('phone')?.toString().trim();
		const quantityRaw = formData.get('quantity')?.toString();
		const notificationPreference = formData.get('notificationPreference')?.toString() as
			| 'email'
			| 'sms'
			| 'both'
			| undefined;

		if (!sessionId) {
			return fail(400, { error: 'Veuillez sélectionner une session' });
		}
		if (!name) {
			return fail(400, { error: "Le nom de l'invité est requis" });
		}
		if (!email || !email.includes('@')) {
			return fail(400, { error: "Un email d'invité valide est requis" });
		}

		const quantity = parseInt(quantityRaw ?? '1', 10);
		if (!Number.isFinite(quantity) || quantity < 1) {
			return fail(400, { error: 'La quantité doit être un nombre entier positif' });
		}

		if (env.USE_MOCK_DATA) {
			return {
				success: true,
				message: `Réservation comp créée pour ${name} (mock — non persistée)`,
				reservationId: null,
			};
		}

		try {
			const { createCompReservation } = await import('$lib/server/services/reservations');
			const result = await createCompReservation({
				sessionId,
				email,
				name,
				phone: phone || undefined,
				quantity,
				notificationPreference,
			});

			return {
				success: true,
				message: `Réservation comp créée pour ${name}`,
				reservationId: result.reservation.id,
			};
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Échec de la création de la réservation comp',
			});
		}
	},
};
