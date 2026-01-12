/**
 * Format amount in cents to currency string
 * Example: formatCurrency(2500, 'EUR') => '€25.00'
 */
export function formatCurrency(amountInCents: number, currency: string): string {
	const amount = amountInCents / 100;

	const formatter = new Intl.NumberFormat('en-US', {
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
