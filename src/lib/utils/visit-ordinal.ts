/**
 * Issue 051 — French ordinal for a visit number: « 1re », « 2e »,
 * « 21e ». The Arrivées party card shows it only from the second visit
 * (« 2e visite »), so a first visit renders nothing.
 */

/** The French ordinal of a visit number: 1 → « 1re », 2 → « 2e », 21 → « 21e ». */
export function visitOrdinalFr(n: number): string {
	return n === 1 ? '1re' : `${n}e`;
}
