<script lang="ts">
	/**
	 * Les raccourcis de l'en-tête du portail Staff, utilisables dès
	 * l'ouverture de l'app (comme l'en-tête de l'admin bancpublic) : « + »
	 * pour une Nouvelle réservation, et un menu ⋮ — Fermer aux réservations,
	 * Ajouter un walk-in, Actualiser, le thème, Se déconnecter.
	 *
	 * Un raccourci agit sur l'événement ouvert s'il en fait partie ; sinon
	 * sur le seul événement possible, ou demande lequel. Il ouvre alors la
	 * page de l'événement avec la feuille du raccourci (celles du menu ⋮ de
	 * l'événement, issues 038–040).
	 */
	import { DropdownMenu } from 'bits-ui';
	import { EllipsisVertical, Download, LoaderCircle, Lock, LogOut, Moon, Plus, RefreshCw, Sun, UserPlus } from 'lucide-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { adminDarkMode } from '$lib/stores/adminDarkMode.svelte';
	import { openSpotForm } from '$lib/components/staff/event-menu/spot-form.svelte';
	import { canOfferStaffInstall, openStaffInstall } from '$lib/components/staff/install/install-prompt.svelte';
	import { openCloseBookingsForm } from '$lib/components/staff/event-menu/close-bookings-form.svelte';
	import { openInviteForm } from '$lib/components/staff/event-menu/invite-form.svelte';
	import { pickEvent, type PickableEvent } from './event-picker.svelte';
	import type { HeaderActionTargets } from '$lib/server/services/staff-portal';

	let { targets }: { targets: HeaderActionTargets } = $props();

	const isDark = $derived(adminDarkMode.get());
	const canInstall = $derived(canOfferStaffInstall());

	/** Lance un raccourci sur l'événement ouvert, le seul possible, ou celui choisi. */
	function start(action: string, events: PickableEvent[], open: () => void) {
		const here = page.route.id?.startsWith('/(staff)/staff/events/[id]') ? page.params.id : null;
		if (events.some((event) => event.eventId === here)) {
			open();
			return;
		}
		const go = async (event: PickableEvent) => {
			await goto(`/staff/events/${event.eventId}`);
			open();
		};
		if (events.length === 1) go(events[0]);
		else pickEvent(action, events, go);
	}

	const newReservation = () => start('Nouvelle réservation', targets.invite, openInviteForm);

	let reloading = $state(false);
	async function reload() {
		reloading = true;
		try {
			await invalidateAll();
		} finally {
			reloading = false;
		}
	}

	let logoutForm = $state<HTMLFormElement | null>(null);

	/** L'action choisie, jouée une fois le menu fermé (la feuille reçoit le focus). */
	let chosen: (() => void) | null = null;

	const ITEM =
		'flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-3 text-sm outline-none select-none data-highlighted:bg-muted pointer-fine:min-h-9';
</script>

<div class="flex shrink-0 items-center gap-1">
	{#if targets.invite.length > 0}
		<button
			type="button"
			onclick={newReservation}
			aria-label="Nouvelle réservation"
			title="Nouvelle réservation"
			class="inline-flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 ease-out hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 motion-reduce:transition-none"
		>
			<Plus class="size-5" aria-hidden="true" />
		</button>
	{/if}

	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			aria-label="Menu"
			class="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground"
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
				{#if targets.closeBookings.length > 0}
					<DropdownMenu.Item
						class={ITEM}
						onSelect={() =>
							(chosen = () => start('Fermer aux réservations', targets.closeBookings, openCloseBookingsForm))}
					>
						<Lock class="size-4" aria-hidden="true" />
						Fermer aux réservations
					</DropdownMenu.Item>
				{/if}
				{#if targets.walkIn.length > 0}
					<DropdownMenu.Item
						class={ITEM}
						onSelect={() =>
							(chosen = () => start('Ajouter un walk-in', targets.walkIn, () => openSpotForm('walk_in')))}
					>
						<UserPlus class="size-4" aria-hidden="true" />
						Ajouter un walk-in
					</DropdownMenu.Item>
				{/if}
				{#if targets.closeBookings.length > 0 || targets.walkIn.length > 0}
					<DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
				{/if}
				<DropdownMenu.Item class={ITEM} disabled={reloading} onSelect={reload}>
					<RefreshCw class="size-4" aria-hidden="true" />
					Actualiser
				</DropdownMenu.Item>
				{#if canInstall}
					<DropdownMenu.Item class={ITEM} onSelect={() => (chosen = openStaffInstall)}>
						<Download class="size-4" aria-hidden="true" />
						Installer l'app
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item class={ITEM} closeOnSelect={false} onSelect={() => adminDarkMode.toggle()}>
					{#if isDark}
						<Sun class="size-4" aria-hidden="true" />
						Mode clair
					{:else}
						<Moon class="size-4" aria-hidden="true" />
						Mode sombre
					{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
				<DropdownMenu.Item class={ITEM} onSelect={() => logoutForm?.requestSubmit()}>
					<LogOut class="size-4" aria-hidden="true" />
					Se déconnecter
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
	<form method="POST" action="/logout" bind:this={logoutForm} hidden></form>
</div>
