<script lang="ts">
	/**
	 * Le menu ⋮ à droite du titre de la page Événement du portail Staff
	 * (issue 038) : tout ce que le membre du staff peut faire sur
	 * l'événement. Chaque action part une fois le menu fermé, pour que la
	 * feuille ouverte reçoive le focus plutôt que le bouton. Les issues
	 * suivantes (039–041) ajoutent leurs entrées ici.
	 */
	import { DropdownMenu } from 'bits-ui';
	import { EllipsisVertical, CalendarPlus, Gift, LoaderCircle, Lock, Plus, RefreshCw } from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { openSpotForm } from './spot-form.svelte';
	import { openCloseBookingsForm } from './close-bookings-form.svelte';
	import { openInviteForm } from './invite-form.svelte';

	let {
		canWalkIn = false,
		canComp = false,
		canCloseBookings = false,
		canInvite = false,
		/** Un Jour est-il en cours, avec la liste des invités chargée ? */
		duringDay = false
	}: { canWalkIn?: boolean; canComp?: boolean; canCloseBookings?: boolean; canInvite?: boolean; duringDay?: boolean } = $props();

	// Le walk-in et l'invitation se font sur la liste des invités d'un Jour
	// en cours, comme avant (issue 020–021).
	const spots = $derived(duringDay && (canWalkIn || canComp));

	let reloading = $state(false);
	async function reload() {
		reloading = true;
		try {
			await invalidateAll();
		} finally {
			reloading = false;
		}
	}

	/** L'action choisie, jouée une fois le menu fermé. */
	let chosen: (() => void) | null = null;

	const ITEM =
		'flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-3 text-sm outline-none select-none data-highlighted:bg-muted pointer-fine:min-h-9';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Plus d'actions"
		class="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
	>
		{#if reloading}
			<LoaderCircle class="size-5 animate-spin" aria-hidden="true" />
		{:else}
			<EllipsisVertical class="size-5" aria-hidden="true" />
		{/if}
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
			{#if canWalkIn && duringDay}
				<DropdownMenu.Item class={ITEM} onSelect={() => (chosen = () => openSpotForm('walk_in'))}>
					<Plus class="size-4" aria-hidden="true" />
					Ajouter un walk-in
				</DropdownMenu.Item>
			{/if}
			{#if canComp && duringDay}
				<DropdownMenu.Item class={ITEM} onSelect={() => (chosen = () => openSpotForm('comp'))}>
					<Gift class="size-4" aria-hidden="true" />
					Offrir une invitation
				</DropdownMenu.Item>
			{/if}
			{#if spots || canCloseBookings || canInvite}
				<DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
			{/if}
			{#if canInvite}
				<DropdownMenu.Item class={ITEM} onSelect={() => (chosen = openInviteForm)}>
					<CalendarPlus class="size-4" aria-hidden="true" />
					Nouvelle réservation
				</DropdownMenu.Item>
			{/if}
			{#if canCloseBookings}
				<DropdownMenu.Item class={ITEM} onSelect={() => (chosen = openCloseBookingsForm)}>
					<Lock class="size-4" aria-hidden="true" />
					Fermer aux réservations
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item class={ITEM} disabled={reloading} onSelect={reload}>
				<RefreshCw class="size-4" aria-hidden="true" />
				Actualiser
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
