/**
 * Practical Info (issue 040, CONTEXT.md): what a Guest needs on the day —
 * arrival instructions, door code, dress code, a contact to call. Written
 * per Event in EN/FR and given only to Guests holding a Ticket: on the
 * Ticket page and in the confirmation and reminder emails, never on the
 * public Event page or in any public loader.
 */

/** An Event's Practical Info columns (absent when a loader left them out). */
export interface PracticalInfoEvent {
	practicalInfoEn?: string | null;
	practicalInfoFr?: string | null;
}

/**
 * Practical Info in the reader's language, falling back to the other one,
 * then to an empty string. Empty (both missing or blank) renders nothing.
 */
export function localizedPracticalInfo(
	event: PracticalInfoEvent,
	locale: string | null | undefined
): string {
	const [preferred, other] =
		locale === 'fr' ? [event.practicalInfoFr, event.practicalInfoEn] : [event.practicalInfoEn, event.practicalInfoFr];
	return (preferred?.trim() ? preferred : other?.trim() ? other : '') ?? '';
}

/** `Omit` that distributes over a union of Event shapes (mock data). */
export type WithoutPracticalInfo<T> = T extends unknown
	? Omit<T, 'practicalInfoEn' | 'practicalInfoFr'>
	: never;

/**
 * A shallow copy of the Event without its Practical Info — what every
 * public loader returns, so a door code can never leak by accident. The
 * Ticket and email loaders keep the columns; they are what serves Guests.
 */
export function withoutPracticalInfo<T extends PracticalInfoEvent>(event: T): WithoutPracticalInfo<T> {
	const { practicalInfoEn: _en, practicalInfoFr: _fr, ...rest } = event;
	return rest as WithoutPracticalInfo<T>;
}
