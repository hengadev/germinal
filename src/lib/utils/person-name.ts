/**
 * A person's name in two parts: a Guest on a Reservation or the waiting
 * list, a gift card's buyer and recipient. Kept apart so each part can be
 * set as needed (the last name in capitals on a ticket, a list sorted by
 * last name), and joined for the full name.
 *
 * While the old one-column names are phased out (guest_name, waitlist.name,
 * gift_cards.buyer_name / recipient_name), every write fills both the parts
 * and the joined name; rows written by the previous app version have only
 * the joined name, and `splitName` reads them the way migration 0056 did.
 */

/** Longest first or last name the database keeps. */
export const NAME_PART_MAX_LENGTH = 100;

export interface PersonName {
	firstName: string;
	lastName: string;
}

/** « Margaux » + « Ferrand » → « Margaux Ferrand »; either may be empty. */
export function joinName(firstName: string | null | undefined, lastName: string | null | undefined): string {
	return [firstName, lastName]
		.map((part) => (part ?? '').trim())
		.filter(Boolean)
		.join(' ');
}

/**
 * A full name split at its first space, as migration 0056 split the names
 * already stored: « Jean-Pierre de la Tour » → « Jean-Pierre », « de la Tour ».
 */
export function splitName(full: string | null | undefined): PersonName {
	const name = (full ?? '').trim().replace(/\s+/g, ' ');
	const space = name.indexOf(' ');
	if (space < 0) return { firstName: name, lastName: '' };
	return { firstName: name.slice(0, space), lastName: name.slice(space + 1) };
}

/** The parts of a stored row: its two columns, else its old full name split. */
export function nameOf(row: {
	firstName: string | null | undefined;
	lastName: string | null | undefined;
	fullName: string | null | undefined;
}): PersonName {
	if (row.firstName != null || row.lastName != null) {
		return { firstName: (row.firstName ?? '').trim(), lastName: (row.lastName ?? '').trim() };
	}
	return splitName(row.fullName);
}

/** What a form or an API sends, trimmed: first and last name, or an old
 * client's single `name` split. */
export function nameFromInput(input: {
	firstName?: string | null;
	lastName?: string | null;
	name?: string | null;
}): PersonName {
	const firstName = (input.firstName ?? '').trim();
	const lastName = (input.lastName ?? '').trim();
	if (firstName || lastName) return { firstName, lastName };
	return splitName(input.name);
}

/** The three columns a Reservation or waitlist row is written with while
 * the old full-name column is still read by the previous app version. */
export function nameColumns(input: { firstName?: string | null; lastName?: string | null; name?: string | null }) {
	const { firstName, lastName } = nameFromInput(input);
	return {
		firstName: firstName.slice(0, NAME_PART_MAX_LENGTH),
		lastName: lastName.slice(0, NAME_PART_MAX_LENGTH),
		fullName: joinName(firstName, lastName),
	};
}
