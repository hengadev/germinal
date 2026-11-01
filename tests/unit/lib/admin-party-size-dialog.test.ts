/**
 * Issue 046 — the « Modifier le nombre » dialog on the Admin Reservation
 * page: it opens with « − »/« + » and a typed field, recomputes the new
 * total and what is left to pay on site as the number changes, warns
 * « N places au-delà de la capacité » instead of refusing, and refuses a
 * number below the Guests already checked in. Rendered headless (jsdom)
 * against the real component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PartySizeChange from '$lib/components/admin/PartySizeChange.svelte';

// A confirmed party of 2 at 45.00, paid in full online, on a Seating with
// one seat left of ten.
function props(opts: { checkedIn?: number; availableCapacity?: number | null } = {}) {
	return {
		reservation: {
			quantity: 2,
			totalAmount: 9000,
			balanceAmount: 0,
			currency: 'USD',
			status: 'confirmed',
			isComp: false
		},
		party: {
			depositPaid: 9000,
			checkedIn: opts.checkedIn ?? 0,
			availableCapacity: opts.availableCapacity ?? 1,
			totalCapacity: 10
		},
		onsuccess: () => {},
		onerror: () => {}
	};
}

describe('PartySizeChange dialog', () => {
	it('shows the live total and what is left to pay on site as the number grows', async () => {
		render(PartySizeChange, { props: props() });

		await fireEvent.click(screen.getByRole('button', { name: 'Modifier le nombre' }));
		expect(screen.getByRole('heading', { name: 'Modifier le nombre de personnes' })).toBeVisible();

		// Nothing has changed yet: no quote shown.
		expect(screen.queryByText('Nouveau total')).toBeNull();

		// « + »: 3 Guests at 45.00 each; the added Guest pays on site.
		await fireEvent.click(screen.getByRole('button', { name: '+' }));
		expect(screen.getByText('Nouveau total')).toBeVisible();
		expect(screen.getByText('Reste à payer sur place')).toBeVisible();
		expect(screen.getByText(/45,00 /)).toBeVisible();
	});

	it('warns « N place au-delà de la capacité » instead of refusing', async () => {
		render(PartySizeChange, { props: props({ availableCapacity: 1 }) });

		await fireEvent.click(screen.getByRole('button', { name: 'Modifier le nombre' }));
		const input = screen.getByRole('spinbutton') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '4' } });

		// 2 added, 1 available: one seat beyond.
		expect(screen.getByText(/1 place au-delà de la capacité/)).toBeVisible();
		// The quote is still offered.
		expect(screen.getByText('Nouveau total')).toBeVisible();
	});

	it('refuses a number below the Guests already checked in', async () => {
		render(PartySizeChange, { props: props({ checkedIn: 2 }) });

		await fireEvent.click(screen.getByRole('button', { name: 'Modifier le nombre' }));
		const input = screen.getByRole('spinbutton') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '1' } });

		expect(screen.getByText(/déjà arrivées/)).toBeVisible();
		expect(screen.queryByText('Nouveau total')).toBeNull();
	});
});
