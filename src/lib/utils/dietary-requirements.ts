/**
 * Dietary Requirements (issue 041, CONTEXT.md): allergies or a diet a Guest
 * declares when booking, for the whole Reservation, on an Event that asks
 * for them. Health data: given only with the Guest's explicit consent — the
 * instant they consented is stored with the answer — seen only by Admins,
 * and erased 30 days after the Seating starts (jobs/purge-personal-data).
 * Booking without answering is always possible.
 */

/** Longest answer the booking form accepts. */
export const DIETARY_REQUIREMENTS_MAX_LENGTH = 500;

/** Days after the Seating starts at which the answer and consent are erased. */
export const DIETARY_REQUIREMENTS_RETENTION_DAYS = 30;

/** What a Reservation stores: both null, or the answer with its consent. */
export interface DietaryAnswer {
	dietaryRequirements: string | null;
	dietaryConsentAt: Date | null;
}

const NO_ANSWER: DietaryAnswer = { dietaryRequirements: null, dietaryConsentAt: null };

/** Whether a filled answer still lacks the Guest's consent (the form and the
 * API refuse it). A blank answer never needs one. */
export function needsDietaryConsent(answer: string | null | undefined, consent: boolean | null | undefined): boolean {
	return (answer ?? '').trim() !== '' && consent !== true;
}

/**
 * What to store for a booking: nothing when the Event does not ask or the
 * Guest left the field blank; the trimmed answer with the consent instant
 * when they consented; `consent-required` when they filled it without
 * consenting.
 */
export function dietaryAnswerOf(input: {
	asked: boolean;
	answer?: string | null;
	consent?: boolean | null;
	now: Date;
}): DietaryAnswer | 'consent-required' {
	if (!input.asked) return NO_ANSWER;
	const answer = (input.answer ?? '').trim();
	if (answer === '') return NO_ANSWER;
	if (input.consent !== true) return 'consent-required';
	return { dietaryRequirements: answer, dietaryConsentAt: input.now };
}
