/**
 * Format amount in cents to currency string
 * Example: formatCurrency(2500, 'EUR') => '€25.00'
 *
 * Accepts an optional BCP 47 locale (e.g. the Guest's active site locale) so
 * number-formatting conventions (decimal separator, symbol placement, etc.)
 * match the viewer's language. Defaults to 'en-US' for callers that have no
 * notion of an active locale (server-side emails, exports, admin back office).
 */
export function formatCurrency(
	amountInCents: number,
	currency: string,
	locale: string = 'en-US'
): string {
	const amount = amountInCents / 100;

	const formatter = new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: currency.toUpperCase(),
	});

	return formatter.format(amount);
}

/**
 * Parse currency string to cents
 * Example: parseCurrency('25.00') => 2500
 */
export function parseCurrency(amountString: string): number {
	const parsed = parseFloat(amountString);
	if (isNaN(parsed)) {
		throw new Error('Invalid amount');
	}
	return Math.round(parsed * 100);
}

/**
 * Validate currency code (ISO 4217)
 */
export function isValidCurrency(currency: string): boolean {
	const validCurrencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
	return validCurrencies.includes(currency.toUpperCase());
}
