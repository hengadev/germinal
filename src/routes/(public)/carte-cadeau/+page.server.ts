import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { giftCardPurchaseSchema } from '$lib/server/validators/gift-card';
import { checkRateLimit } from '$lib/server/rate-limit';
import { validateCsrfTokenFromForm } from '$lib/server/csrf';
import { env } from '$lib/server/env';
import { createGiftCardCheckoutSession } from '$lib/server/services/stripe';
import { giftCardsOnSale } from '$lib/server/services/site-settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Closed in the Admin's settings: the page does not exist.
	if (!(await giftCardsOnSale())) error(404, 'Not found');
	return {
		csrfToken: locals.csrfToken
	};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress, locals }) => {
		// A form left open, or posted directly, sells nothing while closed.
		if (!(await giftCardsOnSale())) error(404, 'Not found');

		const ip = getClientAddress();

		// Rate limit: the Inquiry policy (5 submissions per hour per client
		// IP), like the contact form. A checkout session creation counts.
		const decision = await checkRateLimit('inquiry', ip);
		if (decision.status === 'unavailable') {
			logger.error('Rate limiter unavailable, rejecting gift card submission');
			return fail(503, {
				error: 'Service temporairement indisponible. Merci de réessayer dans un instant.'
			});
		}
		if (decision.status === 'denied') {
			return fail(429, {
				error: `Trop de tentatives. Merci de réessayer dans ${Math.ceil(decision.retryAfterSeconds / 60)} minutes.`,
				rateLimited: true
			});
		}

		const formData = await request.formData();

		if (!validateCsrfTokenFromForm(formData, locals.csrfToken)) {
			return fail(403, { error: 'Jeton CSRF invalide.' });
		}

		const data = {
			amount: formData.get('amount'),
			customAmount: formData.get('customAmount') ?? '',
			buyerFirstName: formData.get('buyerFirstName'),
			buyerLastName: formData.get('buyerLastName'),
			buyerEmail: formData.get('buyerEmail'),
			recipientFirstName: formData.get('recipientFirstName'),
			recipientLastName: formData.get('recipientLastName') ?? '',
			recipientEmail: formData.get('recipientEmail') ?? '',
			message: formData.get('message') ?? '',
			delivery: formData.get('delivery'),
			locale: formData.get('locale') ?? 'fr',
			honeypot: formData.get('website')
		};

		const validated = giftCardPurchaseSchema.safeParse(data);
		if (!validated.success) {
			return fail(400, {
				error: 'Merci de vérifier les champs du formulaire.',
				fieldErrors: validated.error.flatten().fieldErrors,
				formData: data
			});
		}

		let checkoutUrl = '';
		try {
			const session = await createGiftCardCheckoutSession({
				amount: validated.data.amountCents!,
				buyerFirstName: validated.data.buyerFirstName,
				buyerLastName: validated.data.buyerLastName,
				buyerEmail: validated.data.buyerEmail,
				recipientFirstName: validated.data.recipientFirstName,
				recipientLastName: validated.data.recipientLastName,
				recipientEmail: validated.data.delivery === 'recipient'
					? validated.data.recipientEmail
					: null,
				message: validated.data.message,
				delivery: validated.data.delivery,
				locale: validated.data.locale,
				successUrl: `${env.PUBLIC_URL}/carte-cadeau/merci?session_id={CHECKOUT_SESSION_ID}`,
				cancelUrl: `${env.PUBLIC_URL}/carte-cadeau`
			});
			if (!session.url) throw new Error('Stripe returned no checkout URL');
			checkoutUrl = session.url;
		} catch (error) {
			logger.error({ err: error }, 'Gift card checkout session creation error');
			return fail(500, {
				error: 'Une erreur est survenue. Merci de réessayer plus tard.'
			});
		}
		redirect(303, checkoutUrl);
	}
};
