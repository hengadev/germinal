<script lang="ts">
	/**
	 * La feuille « Carte cadeau » d'une partie (issue 066) : le Staff
	 * saisit le code, voit le solde de la carte, puis confirme. La carte
	 * paie jusqu'au solde restant ; ce qu'elle ne couvre pas reste à
	 * payer sur le terminal. Après l'encaissement, la feuille montre ce
	 * qui reste sur la carte. Le serveur revérifie la permission
	 * « Régler un solde » et le jour en cours.
	 */
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { AlertCircle, Check, CreditCard, LoaderCircle, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { formatCurrency } from '$lib/utils/currency';
	import { giftCardForm, closeGiftCard } from './gift-card-form.svelte';

	// The page renders twice (mobile and desktop): ids unique per copy.
	const uid = $props.id();

	const target = $derived(giftCardForm.target);

	let sheetEl = $state<HTMLElement | null>(null);
	let code = $state('');
	let checking = $state(false);
	let paying = $state(false);
	let error = $state<string | null>(null);
	/** Le solde de la carte vérifiée, en centimes. */
	let balance = $state<number | null>(null);
	/** Le résultat de l'encaissement, montré avant de fermer. */
	let outcome = $state<{
		applied: number;
		cardBalanceLeft: number;
		remainder: number;
		settled: boolean;
	} | null>(null);

	$effect(() => {
		if (giftCardForm.target) {
			code = '';
			error = null;
			balance = null;
			outcome = null;
			sheetEl?.focus();
		}
	});

	const eur = (cents: number) => formatCurrency(cents, 'EUR', 'fr-FR');

	// Appelée comme use:enhance le fait (en-tête x-sveltekit-action) : le
	// résultat désérialisé arrive sans recharger la page.
	async function call(action: string, data: FormData): Promise<
		| { type: 'success'; data: Record<string, unknown> }
		| { type: 'failure'; error: string }
		| { type: 'error' }
	> {
		try {
			const response = await fetch(`?/${action}`, {
				method: 'POST',
				body: data,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				return { type: 'success', data: result.data as Record<string, unknown> };
			}
			if (result.type === 'failure') {
				const payload = result.data as { error?: string } | undefined;
				return { type: 'failure', error: payload?.error ?? 'Une erreur est survenue.' };
			}
			return { type: 'error' };
		} catch {
			return { type: 'error' };
		}
	}

	async function check() {
		if (!target || !code.trim()) return;
		checking = true;
		error = null;
		balance = null;
		const data = new FormData();
		data.set('code', code);
		const result = await call('validateGiftCard', data);
		if (result.type === 'success') {
			balance = result.data.giftCardBalance as number;
		} else {
			error = result.type === 'failure' ? result.error : 'Une erreur est survenue.';
		}
		checking = false;
	}

	async function pay() {
		if (!target || !code.trim()) return;
		paying = true;
		error = null;
		const data = new FormData();
		data.set('reservationId', target.reservationId);
		data.set('code', code);
		const result = await call('settleBalanceWithGiftCard', data);
		if (result.type === 'success' && result.data.giftCardSettlement) {
			outcome = result.data.giftCardSettlement as NonNullable<typeof outcome>;
			balance = outcome!.cardBalanceLeft;
			await invalidateAll();
		} else {
			error = result.type === 'failure' ? result.error : 'Une erreur est survenue.';
		}
		paying = false;
	}

	const BTN =
		'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-center text-lg font-semibold uppercase tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
</script>

{#if target}
	<div
		class="fixed inset-0 z-[59] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={closeGiftCard}
		aria-hidden="true"
		data-no-swipe
	></div>
	<div
		bind:this={sheetEl}
		role="dialog"
		aria-modal="true"
		aria-label="Régler avec une carte cadeau"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 pb-8 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && closeGiftCard()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">Carte cadeau</h2>
			<button
				type="button"
				onclick={closeGiftCard}
				aria-label="Fermer"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</header>

		<p class="mb-3 text-sm text-muted-foreground">
			{target.guestName ?? '—'} · {target.seatingLabel}{#if !outcome}{` · reste sur place ${eur(target.balance)}`}{/if}
		</p>

		{#if outcome}
			<!-- Encaissé : ce que la carte a payé, ce qui reste dessus, et le
			     reste à prendre sur le terminal si elle ne couvrait pas tout. -->
			<div class="space-y-2">
				<p class="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-foreground bg-foreground px-2.5 text-sm font-semibold text-background">
					<Check size={14} aria-hidden="true" />
					{eur(outcome.applied)} déduits de la carte
				</p>
				<p class="text-sm text-foreground">
					Il reste <span class="font-semibold tabular-nums">{eur(outcome.cardBalanceLeft)}</span> sur la carte.
				</p>
				{#if !outcome.settled}
					<p class="text-sm font-medium text-foreground">
						Reste <span class="tabular-nums">{eur(outcome.remainder)}</span> à payer sur le terminal&nbsp;: le solde reste ouvert.
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">Le solde est réglé.</p>
				{/if}
				<button type="button" onclick={closeGiftCard} class="{BTN} border-foreground bg-background text-foreground hover:bg-muted">
					Fermer
				</button>
			</div>
		{:else}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					if (balance === null) check();
					else pay();
				}}
				class="space-y-3"
			>
				<div>
					<label for="gift-card-code-{uid}" class="mb-1 block text-sm font-medium text-foreground">Code de la carte</label>
					<input
						id="gift-card-code-{uid}"
						name="code"
						bind:value={code}
						inputmode="text"
						autocomplete="off"
						spellcheck="false"
						placeholder="GERM-XXXX-XXXX"
						oninput={() => {
							balance = null;
							error = null;
						}}
						class={INPUT}
					/>
				</div>

				{#if balance !== null}
					<p class="rounded-md border border-border-card bg-muted px-3 py-2 text-sm text-foreground">
						<CreditCard size={14} class="mr-1 inline align-[-2px]" aria-hidden="true" />
						Solde de la carte&nbsp;: <span class="font-semibold tabular-nums">{eur(balance)}</span>
					</p>
				{/if}

				{#if error}
					<p class="flex items-start gap-2 text-sm text-foreground" role="alert">
						<AlertCircle size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
						{error}
					</p>
				{/if}

				{#if balance === null}
					<button type="submit" disabled={checking || !code.trim()} aria-busy={checking} class="{BTN} border-foreground bg-foreground text-background hover:opacity-90">
						{#if checking}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
						Vérifier
					</button>
				{:else}
					<button type="submit" disabled={paying} aria-busy={paying} class="{BTN} border-foreground bg-foreground text-background hover:opacity-90">
						{#if paying}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
						Encaisser{balance < target.balance ? ` ${eur(balance)}` : ''}
					</button>
					<button type="button" onclick={() => (balance = null)} class="{BTN} border-border-card bg-background text-muted-foreground hover:bg-muted hover:text-foreground">
						Changer de carte
					</button>
				{/if}
			</form>
		{/if}
	</div>
{/if}
