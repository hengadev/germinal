<script lang="ts">
	/**
	 * La feuille « Nouvelle réservation » (issue 040), ouverte depuis le
	 * menu ⋮ : une invitation (un Comp) sur n'importe quelle séance publiée
	 * à venir de l'événement, pas seulement celle du jour. Même feuille en
	 * bas d'écran que « Fermer aux réservations » (issue 039).
	 */
	import { fade, fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { CalendarPlus, LoaderCircle, Minus, Plus, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { StaffInviteSeating } from '$lib/server/services/staff-portal';
	import { inviteForm, closeInviteForm } from './invite-form.svelte';

	let { seatings, timeZone }: { seatings: StaffInviteSeating[]; timeZone: string } = $props();

	const uid = $props.id();
	const toast = getToastContext();
	let sheetEl = $state<HTMLElement | null>(null);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let seatingId = $state('');
	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let quantity = $state(1);

	// Le jour en cours sur l'horloge de l'événement, pour le mettre en avant.
	const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

	// Séances groupées par Jour puis Service (« samedi 31 octobre » → Dîner → 19 h 00).
	const groups = $derived.by(() => {
		const byDay = new Map<string, StaffInviteSeating[]>();
		for (const s of seatings) {
			const list = byDay.get(s.dayDate) ?? [];
			list.push(s);
			byDay.set(s.dayDate, list);
		}
		return [...byDay.entries()].map(([dayDate, list]) => ({
			dayDate,
			services: [...list
				.reduce((byKind, s) => {
					const l = byKind.get(s.serviceKind) ?? [];
					l.push(s);
					byKind.set(s.serviceKind, l);
					return byKind;
				}, new Map<'lunch' | 'dinner', StaffInviteSeating[]>())
			]
		}));
	});

	function dayLabel(d: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			timeZone: 'UTC'
		}).format(new Date(`${d}T12:00:00Z`));
	}
	function timeLabel(s: StaffInviteSeating): string {
		return new Intl.DateTimeFormat('fr-FR', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		})
			.format(new Date(s.startTime))
			.replace(':', ' h ');
	}
	const kindLabel = (kind: 'lunch' | 'dinner') => (kind === 'lunch' ? 'Déjeuner' : 'Dîner');

	// Ouvrir la feuille : la première séance non complète est choisie.
	$effect(() => {
		if (inviteForm.open) {
			if (!seatings.some((s) => s.id === seatingId)) {
				seatingId = seatings.find((s) => s.remaining === null || s.remaining > 0)?.id ?? '';
			}
			sheetEl?.focus();
		}
	});

	function close() {
		closeInviteForm();
		error = null;
	}

	// L'action invite, appelée comme use:enhance le fait (en-tête
	// x-sveltekit-action) : un succès ferme la feuille et rafraîchit (la
	// liste des arrivées du jour montre alors l'invitation), un échec
	// montre le message du serveur.
	async function submitInvite(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		submitting = true;
		error = null;
		try {
			const response = await fetch('?/invite', {
				method: 'POST',
				body: new FormData(form),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type !== 'success') {
				const payload =
					result.type === 'failure' ? (result.data as { error?: string } | undefined) : undefined;
				error = payload?.error ?? 'Une erreur est survenue.';
				return;
			}
			await invalidateAll();
			const message =
				result.data && typeof result.data === 'object' && 'message' in result.data
					? String(result.data.message)
					: `Invitation envoyée à ${name}`;
			toast.success('Invitation envoyée', message);
			name = '';
			email = '';
			phone = '';
			quantity = 1;
			close();
		} catch {
			error = 'Une erreur est survenue.';
		} finally {
			submitting = false;
		}
	}

	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const LABEL = 'block text-sm font-medium text-foreground';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const ROW =
		'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border border-border-input bg-background px-3 text-left text-sm text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
</script>

{#if inviteForm.open}
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
		aria-label="Nouvelle invitation"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">Nouvelle invitation</h2>
			<button
				type="button"
				onclick={close}
				aria-label="Fermer"
				class="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</header>
		<p class="mb-4 text-sm text-muted-foreground">
			Offerte : rien à payer, le billet est envoyé par email.
		</p>

		{#if seatings.length === 0}
			<p class="text-sm text-muted-foreground">Aucune séance à venir pour le moment.</p>
		{:else}
			<form method="POST" action="?/invite" class="space-y-4" onsubmit={submitInvite}>
				<fieldset class="space-y-4">
					<legend class={LABEL}>Séance</legend>
					{#each groups as { dayDate, services } (dayDate)}
						<div>
							<p class="mb-1 text-sm font-medium capitalize text-foreground">
								{dayLabel(dayDate)}{dayDate === today ? ' (aujourd’hui)' : ''}
							</p>
							{#each services as [kind, list] (kind)}
								<p class="mb-1 pl-1 text-xs font-medium text-muted-foreground">
									{kindLabel(kind)}
								</p>
								<div class="mb-2 space-y-1">
									{#each list as s (s.id)}
										<label class={ROW + (seatingId === s.id ? ' border-foreground font-semibold' : '')}>
											<input
												type="radio"
												name="seatingId"
												value={s.id}
												bind:group={seatingId}
												class="size-5 accent-foreground"
											/>
											<span class="tabular-nums">{timeLabel(s)}</span>
											{#if s.remaining === 0}
												<span class="text-xs font-medium text-muted-foreground">Complet</span>
											{:else if s.remaining !== null}
												<span class="text-xs text-muted-foreground">{s.remaining} place{ s.remaining > 1 ? 's' : '' }</span>
											{/if}
										</label>
									{/each}
								</div>
							{/each}
						</div>
					{/each}
				</fieldset>

				<div>
					<label class={LABEL} for="{uid}-name">Nom</label>
					<input id="{uid}-name" name="name" type="text" bind:value={name} required
						autocomplete="name" class={INPUT + ' mt-1'} />
				</div>
				<div>
					<label class={LABEL} for="{uid}-email">Email</label>
					<input id="{uid}-email" name="email" type="email" bind:value={email} required
						autocomplete="email" inputmode="email" class={INPUT + ' mt-1'} />
				</div>
				<div>
					<label class={LABEL} for="{uid}-phone">Téléphone <span class="font-normal text-muted-foreground">(facultatif)</span></label>
					<input id="{uid}-phone" name="phone" type="tel" bind:value={phone}
						autocomplete="tel" inputmode="tel" class={INPUT + ' mt-1'} />
				</div>

				<div>
					<span class={LABEL}>Nombre d’invités</span>
					<div class="mt-1 flex items-center gap-3">
						<button
							type="button"
							aria-label="Un invité de moins"
							onclick={() => (quantity = Math.max(1, quantity - 1))}
							class={BTN + ' size-11 border-border-input p-0 text-foreground'}
						>
							<Minus class="size-4" aria-hidden="true" />
						</button>
						<input name="quantity" type="number" min="1" value={quantity} readonly
							class="w-16 rounded-md border border-border-input bg-background py-2 text-center text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none" />
						<button
							type="button"
							aria-label="Un invité de plus"
							onclick={() => (quantity = quantity + 1)}
							class={BTN + ' size-11 border-border-input p-0 text-foreground'}
						>
							<Plus class="size-4" aria-hidden="true" />
						</button>
					</div>
				</div>

				{#if error}
					<p role="alert" class="text-sm font-medium text-red-600">{error}</p>
				{/if}

				<button
					type="submit"
					disabled={submitting || !seatingId}
					class={BTN + ' w-full border-foreground bg-foreground text-background disabled:opacity-50'}
				>
					{#if submitting}
						<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
					{:else}
						<CalendarPlus class="size-4" aria-hidden="true" />
					{/if}
					Envoyer l’invitation
				</button>
			</form>
		{/if}
	</div>
{/if}
