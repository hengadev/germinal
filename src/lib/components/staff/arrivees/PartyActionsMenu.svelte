<script lang="ts">
	/**
	 * Le menu ⋮ de la carte d'une partie (issue 041) : annuler sa
	 * réservation, ou rembourser une partie de ce qui a été payé en ligne.
	 * Uniquement pour qui a la permission « Annuler et rembourser » ; le
	 * remboursement n'est pas offert quand rien n'est remboursable (walk-ins
	 * et invitations offertes n'ont rien payé en ligne). Le menu est
	 * portallé hors du layout : la classe `back-office` y suit les styles.
	 */
	import { DropdownMenu } from 'bits-ui';
	import { Ban, EllipsisVertical, Undo2 } from 'lucide-svelte';
	import { openCancelRefund } from './cancel-refund.svelte';
	import type { DayGuestParty } from '$lib/server/services/day-guest-list';

	let {
		party,
		seatingLabel
	}: { party: DayGuestParty; /** L'heure de la Seating, « 12 h 30 ». */ seatingLabel: string } =
		$props();

	const refundable = $derived(party.refundable ?? 0);

	/** L'action choisie, jouée une fois le menu fermé (issue 038). */
	let chosen: (() => void) | null = null;

	const ITEM =
		'flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-3 text-sm outline-none select-none data-highlighted:bg-muted pointer-fine:min-h-9';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Actions pour {party.guestName}"
		class="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
	>
		<EllipsisVertical class="size-5" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			align="end"
			sideOffset={4}
			class="back-office z-50 min-w-56 rounded-lg border border-border-card bg-background p-1 text-foreground shadow-popover outline-none"
			onCloseAutoFocus={(event) => {
				if (!chosen) return;
				event.preventDefault();
				const run = chosen;
				chosen = null;
				run();
			}}
		>
			{#if refundable > 0 && party.id}
				<DropdownMenu.Item
					class={ITEM}
					onSelect={() =>
						(chosen = () =>
							party.id &&
							openCancelRefund('refund', {
								reservationId: party.id,
								guestName: party.guestName ?? null,
								quantity: party.quantity,
								seatingLabel,
								paidOnline: party.paidOnline ?? 0,
								refundable,
								suggested: party.suggestedRefund ?? null,
								currency: party.currency ?? 'EUR'
							}))}
				>
					<Undo2 class="size-4" aria-hidden="true" />
					Rembourser
				</DropdownMenu.Item>
			{/if}
			{#if party.id}
				<DropdownMenu.Item
					class="{ITEM} text-red-600 data-highlighted:bg-red-600/10"
					onSelect={() =>
						(chosen = () =>
							party.id &&
							openCancelRefund('cancel', {
								reservationId: party.id,
								guestName: party.guestName ?? null,
								quantity: party.quantity,
								seatingLabel,
								paidOnline: party.paidOnline ?? 0,
								refundable,
								suggested: party.suggestedRefund ?? null,
								currency: party.currency ?? 'EUR'
							}))}
				>
					<Ban class="size-4" aria-hidden="true" />
					Annuler la réservation
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
