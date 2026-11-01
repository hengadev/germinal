<script lang="ts">
	/**
	 * La feuille « Fermer aux réservations » (issue 039), ouverte depuis le
	 * menu ⋮. On choisit le Service (Déjeuner / Dîner ; pour un Admin, le
	 * Jour d'abord), puis tout le service ou des séances précises ; les
	 * séances déjà fermées se rouvrent une à une. Même feuille en bas
	 * d'écran que le formulaire walk-in (issue 038).
	 */
	import { fade, fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { LoaderCircle, Lock, LockOpen, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { StaffBookingSeating } from '$lib/server/services/staff-portal';
	import { closeBookingsForm, closeCloseBookingsForm } from './close-bookings-form.svelte';

	let {
		seatings,
		timeZone,
		isAdmin
	}: {
		seatings: StaffBookingSeating[];
		timeZone: string;
		/** Un Admin choisit d'abord le Jour : il voit toutes les séances à venir. */
		isAdmin: boolean;
	} = $props();

	const uid = $props.id();
	const toast = getToastContext();
	let sheetEl = $state<HTMLElement | null>(null);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let dayDate = $state('');
	let serviceId = $state('');
	/** true = tout le service ; sinon les séances cochées. */
	let whole = $state(true);
	let checked = $state<string[]>([]);

	const days = $derived.by(() => {
		const seen = new Map<string, StaffBookingSeating[]>();
		for (const s of seatings) {
			const list = seen.get(s.dayDate) ?? [];
			list.push(s);
			seen.set(s.dayDate, list);
		}
		return [...seen.entries()];
	});
	const daySeatings = $derived(days.find(([d]) => d === dayDate)?.[1] ?? []);
	const services = $derived.by(() => {
		const seen = new Map<string, StaffBookingSeating[]>();
		for (const s of daySeatings) {
			const list = seen.get(s.serviceId) ?? [];
			list.push(s);
			seen.set(s.serviceId, list);
		}
		return [...seen.entries()];
	});
	const service = $derived(services.find(([id]) => id === serviceId)?.[1] ?? []);

	function dayLabel(d: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			timeZone: 'UTC'
		}).format(new Date(`${d}T12:00:00Z`));
	}
	function timeLabel(s: StaffBookingSeating): string {
		return new Intl.DateTimeFormat('fr-FR', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		})
			.format(new Date(s.startTime))
			.replace(':', ' h ');
	}
	const kindLabel = (kind: 'lunch' | 'dinner') => (kind === 'lunch' ? 'Déjeuner' : 'Dîner');

	// Ouvrir la feuille : premier Jour (celui en cours pour un Staff) et
	// premier Service par défaut. Pas relu à la recharge : le choix reste.
	$effect(() => {
		if (closeBookingsForm.open) {
			if (!days.some(([d]) => d === dayDate)) {
				dayDate = days[0]?.[0] ?? '';
				serviceId = '';
				whole = true;
				checked = [];
			}
			if (!services.some(([id]) => id === serviceId)) serviceId = services[0]?.[0] ?? '';
			sheetEl?.focus();
		}
	});

	function close() {
		closeCloseBookingsForm();
		whole = true;
		checked = [];
		error = null;
	}

	function toggle(id: string) {
		checked = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
	}

	// Les deux actions, appelées comme use:enhance le fait (en-tête
	// x-sveltekit-action) : un succès ferme la feuille (ou rafraîchit), un
	// échec montre le message du serveur.
	async function post(action: string, data: FormData): Promise<boolean> {
		submitting = true;
		error = null;
		try {
			const response = await fetch(`?/${action}`, {
				method: 'POST',
				body: data,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type !== 'success') {
				const payload = result.type === 'failure' ? (result.data as { error?: string } | undefined) : undefined;
				error = payload?.error ?? 'Une erreur est survenue.';
				return false;
			}
			await invalidateAll();
			return true;
		} catch {
			error = 'Une erreur est survenue.';
			return false;
		} finally {
			submitting = false;
		}
	}

	async function submitClose(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const data = new FormData(form);
		// Une case non cochée ne doit pas partir : elle est retirée ici.
		if (!whole) {
			data.delete('seatingId');
			for (const id of checked) data.append('seatingId', id);
		}
		if (await post('closeBookings', data)) {
			toast.success('Réservations fermées', 'Les séances choisies sont fermées aux réservations.');
			close();
		}
	}

	async function submitReopen(event: SubmitEvent, s: StaffBookingSeating) {
		event.preventDefault();
		const data = new FormData();
		data.set('seatingId', s.id);
		if (await post('reopenBookings', data)) {
			toast.success('Réservations rouvertes', 'La séance reprend les réservations en ligne.');
		}
	}

	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const LABEL = 'block text-sm font-medium text-foreground';
	const SELECT =
		'flex min-h-11 items-center justify-between gap-2 rounded-md border border-border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
</script>

{#if closeBookingsForm.open}
	<div
		class="fixed inset-0 z-[59] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={close}
		aria-hidden="true"
		data-no-swipe
	></div>
	<div
		bind:this={sheetEl}
		role="dialog"
		aria-modal="true"
		aria-label="Fermer aux réservations"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">Fermer aux réservations</h2>
			<button
				type="button"
				onclick={close}
				aria-label="Fermer"
				class="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</header>

		{#if seatings.length === 0}
			<p class="text-sm text-muted-foreground">Aucune séance à fermer pour le moment.</p>
		{:else}
			<form method="POST" action="?/closeBookings" class="space-y-4" onsubmit={submitClose}>
				{#if isAdmin && days.length > 1}
					<div>
						<label class={LABEL} for="{uid}-day">Jour</label>
						<select
							id="{uid}-day"
							bind:value={dayDate}
							onchange={() => {
								serviceId = '';
								checked = [];
							}}
							class="min-h-11 w-full rounded-md border border-border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
						>
							{#each days as [d] (d)}
								<option value={d}>{dayLabel(d)}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if services.length > 1}
					<div>
						<span class={LABEL}>Service</span>
						<div class="mt-1 grid grid-cols-2 gap-2">
							{#each services as [id, list] (id)}
								<button
									type="button"
									class={SELECT + (serviceId === id ? ' border-foreground font-semibold' : '')}
									aria-pressed={serviceId === id}
									onclick={() => {
										serviceId = id;
										checked = [];
									}}
								>
									{kindLabel(list[0].serviceKind)}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<fieldset class="space-y-2">
					<legend class={LABEL}>Séances</legend>
					<label class="flex min-h-11 items-center gap-3 text-sm text-foreground">
						<input
							type="checkbox"
							bind:checked={whole}
							onchange={() => (checked = [])}
							class="size-5 accent-foreground"
						/>
						Tout le service ({kindLabel(service[0]?.serviceKind ?? 'dinner')})
					</label>
					{#if !whole}
						<div class="space-y-1 pl-8">
							{#each service as s (s.id)}
								<label class="flex min-h-11 items-center gap-3 text-sm text-foreground">
									<input
										type="checkbox"
										checked={checked.includes(s.id)}
										onchange={() => toggle(s.id)}
										class="size-5 accent-foreground"
									/>
									<span class="tabular-nums">{timeLabel(s)}</span>
									{#if s.closed}<span class="text-xs font-medium text-muted-foreground">Fermée</span>{/if}
								</label>
							{/each}
						</div>
					{/if}
				</fieldset>

				{#if whole}
					<!-- Envoyées en champs cachés : tout le service choisi. -->
					{#each service as s (s.id)}
						<input type="hidden" name="seatingId" value={s.id} />
					{/each}
				{/if}

				{#if error}
					<p role="alert" class="text-sm font-medium text-red-600">{error}</p>
				{/if}

				<button
					type="submit"
					disabled={submitting || service.length === 0 || (!whole && checked.length === 0)}
					class={BTN + ' w-full border-foreground bg-foreground text-background disabled:opacity-50'}
				>
					{#if submitting}
						<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
					{:else}
						<Lock class="size-4" aria-hidden="true" />
					{/if}
					Fermer aux réservations
				</button>
			</form>

			<!-- Les séances déjà fermées se rouvrent une à une. -->
			{#if seatings.filter((s) => s.closed).length > 0}
				<div class="mt-4 border-t border-border-card pt-4">
					<h3 class="mb-2 text-sm font-semibold text-foreground">Séances fermées</h3>
					<ul class="space-y-1">
						{#each seatings.filter((s) => s.closed) as s (s.id)}
							<li class="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground">
								<span>
									<span class="text-muted-foreground">{kindLabel(s.serviceKind)} ·</span>
									<span class="tabular-nums">{timeLabel(s)}</span>
									{#if isAdmin && days.length > 1}
										<span class="text-muted-foreground"> · {dayLabel(s.dayDate)}</span>
									{/if}
								</span>
								<form
									method="POST"
									action="?/reopenBookings"
									onsubmit={(event) => submitReopen(event, s)}
								>
									<input type="hidden" name="seatingId" value={s.id} />
									<button
										type="submit"
										disabled={submitting}
										class={BTN + ' min-h-9 px-3 border-border-input text-foreground'}
									>
										<LockOpen class="size-4" aria-hidden="true" />
										Rouvrir
									</button>
								</form>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	</div>
{/if}
