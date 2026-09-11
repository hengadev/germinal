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
 * Format only the numeric portion of a currency amount (no symbol), using the
 * given locale's number-formatting conventions (decimal/thousands separators).
 * Example: formatCurrencyAmount(123455, 'fr') => '1\u202F234,55'
 *
 * Trailing zero decimals are dropped so whole amounts stay compact
 * (2500 => '25') — pairs with getCurrencySymbol() for split symbol/amount
 * typography like the SessionSelector price display.
 */
export function formatCurrencyAmount(
	amountInCents: number,
	locale: string = 'en-US'
): string {
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(amountInCents / 100);
}

/**
 * Extract the currency symbol (e.g. '€', '$') as rendered by the given
 * locale. Falls back to the raw currency code when Intl rejects it.
 * Example: getCurrencySymbol('EUR', 'en') => '€'
 */
export function getCurrencySymbol(
	currency: string,
	locale: string = 'en-US'
): string {
	try {
		return (0)
			.toLocaleString(locale, {
				style: 'currency',
				currency: currency.toUpperCase(),
				minimumFractionDigits: 0,
				maximumFractionDigits: 0
			})
			.replace(/[\d\s,.]/g, '')
			.trim();
	} catch {
		return currency;
	}
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
