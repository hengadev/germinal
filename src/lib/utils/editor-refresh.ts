/**
 * Refreshing a tab from saved data without overwriting the Admin (ADR
 * 0010, issue 018).
 *
 * A Draft saves while the Admin keeps typing, then the page data is
 * reloaded. A tab takes back from it what the server made of the save
 * (the English generated from the French), but only for the fields still
 * holding what was sent: a field changed since the save started keeps
 * what the Admin typed, and is saved by the next save.
 */

/**
 * `current`, with each field still as it was `sent` taking its `saved`
 * value instead.
 */
export function keepEdits<T extends Record<string, unknown>>(
	sent: Readonly<T>,
	current: Readonly<T>,
	saved: Readonly<T>
): T {
	const next: T = { ...current };
	for (const key of Object.keys(current) as (keyof T)[]) {
		if (Object.is(current[key], sent[key])) next[key] = saved[key];
	}
	return next;
}
