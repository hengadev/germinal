<script lang="ts">
	/**
	 * Le formulaire walk-in / invitation (issues 020–021), dans une feuille
	 * en bas d'écran (issue 038) ouverte depuis le menu ⋮. Mêmes champs,
	 * mêmes actions `?/walkIn` et `?/comp`, mêmes retours qu'avant. La
	 * Seating se choisit parmi celles de tout le Jour ; après un succès la
	 * feuille se ferme et l'onglet Arrivées s'affiche.
	 */
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fade, fly } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { LoaderCircle, Minus, Plus, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import type { DayGuestList } from '$lib/server/services/day-guest-list';
	import { currentSeatingId, seatingTime } from '$lib/components/staff/arrivees/helpers';
	import { spotForm, closeSpotForm } from './spot-form.svelte';

	let {
		seatings,
		timeZone,
		onsaved
	}: {
		seatings: DayGuestList['seatings'];
		timeZone: string;
		/** Appelé après un walk-in ou une invitation enregistré : montre Arrivées. */
		onsaved?: () => void;
	} = $props();

	// The page renders twice (mobile and desktop): ids unique per copy.
	const uid = $props.id();
	const isCompForm = $derived(spotForm.kind === 'comp');
	let sheetEl = $state<HTMLElement | null>(null);
	let submitting = $state(false);
	let seatingId = $state('');
	let name = $state('');
	let quantity = $state(2);
	let email = $state('');
	let phone = $state('');

	$effect(() => {
		if (spotForm.kind) {
			// La Séance en cours par défaut, sinon la première du Jour. Pas
			// relue quand la liste se recharge : le choix fait reste.
			untrack(() => {
				seatingId = currentSeatingId(seatings, new Date()) ?? seatings[0]?.id ?? '';
			});
			sheetEl?.focus();
		}
	});

	const error = $derived.by(() => {
		const form = page.form as { error?: string; walkIn?: boolean; comp?: boolean } | null;
		return form && form.error && (isCompForm ? form.comp : form.walkIn) ? form.error : null;
	});

	function close() {
		closeSpotForm();
		name = '';
		email = '';
		phone = '';
		quantity = 2;
	}

	function stepQuantity(delta: number) {
		quantity = Math.max(1, quantity + delta);
	}

	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const LABEL = 'block text-sm font-medium text-foreground';
</script>

{#if spotForm.kind}
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
		aria-label={isCompForm ? 'Offrir une invitation' : 'Ajouter un walk-in'}
		tabindex="-1"
		class="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">
				{isCompForm ? 'Offrir une invitation' : 'Ajouter un walk-in'}
			</h2>
			<button
				type="button"
				onclick={close}
				aria-label="Fermer"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</header>
		<form
			method="POST"
			action={isCompForm ? '?/comp' : '?/walkIn'}
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
					const form = page.form as { error?: string; walkIn?: boolean; comp?: boolean } | null;
					if (!(form && form.error && (isCompForm ? form.comp : form.walkIn))) {
						close();
						onsaved?.();
					}
				};
			}}
		>
			<fieldset class="space-y-3" disabled={submitting}>
				{#if isCompForm}
					<p class="text-sm text-muted-foreground">Offert : rien à régler, aucun billet envoyé.</p>
				{/if}
				<div>
					<label class={LABEL} for="{uid}-seating">Séance</label>
					<select id="{uid}-seating" name="seatingId" bind:value={seatingId} class={INPUT} required>
						{#each seatings as seating (seating.id)}
							<option value={seating.id}>{seatingTime(seating, timeZone)}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={LABEL} for="{uid}-name">Nom</label>
					<input id="{uid}-name" name="name" type="text" bind:value={name} required class={INPUT} />
				</div>
				<div>
					<span class={LABEL} id="{uid}-quantity-label">Personnes</span>
					<div
						class="mt-1 inline-flex items-center gap-2"
						role="group"
						aria-labelledby="{uid}-quantity-label"
					>
						<button
							type="button"
							onclick={() => stepQuantity(-1)}
							class="{BTN} border-border-card bg-background text-foreground hover:bg-muted"
							aria-label="Retirer une personne"
						>
							<Minus size={16} aria-hidden="true" />
						</button>
						<span class="min-w-8 text-center text-lg font-semibold text-foreground tabular-nums">{quantity}</span>
						<button
							type="button"
							onclick={() => stepQuantity(1)}
							class="{BTN} border-border-card bg-background text-foreground hover:bg-muted"
							aria-label="Ajouter une personne"
						>
							<Plus size={16} aria-hidden="true" />
						</button>
						<input type="hidden" name="quantity" value={quantity} />
					</div>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={LABEL} for="{uid}-email">E-mail (facultatif)</label>
						<input id="{uid}-email" name="email" type="email" bind:value={email} class={INPUT} />
					</div>
					<div>
						<label class={LABEL} for="{uid}-phone">Téléphone (facultatif)</label>
						<input id="{uid}-phone" name="phone" type="tel" bind:value={phone} class={INPUT} />
					</div>
				</div>
				{#if error}
					<p class="text-sm font-medium text-red-600" role="alert">{error}</p>
				{/if}
				<button
					type="submit"
					disabled={submitting || seatings.length === 0}
					class="{BTN} w-full border-foreground bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
				>
					{#if submitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
					{isCompForm ? 'Offrir' : 'Enregistrer'}
				</button>
			</fieldset>
		</form>
	</div>
{/if}
