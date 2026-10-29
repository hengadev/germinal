<script lang="ts">
	/**
	 * L'onglet Scanner (issue 018) : le lecteur QR en continu, et pour
	 * chaque scan soit la fiche du groupe avec « Faire entrer », soit le
	 * refus en français. Noir et blanc, grandes cibles, comme Arrivées.
	 */
	import { tick } from 'svelte';
	import { deserialize } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Ban, Check, Search } from 'lucide-svelte';
	import QrScanner from '$lib/components/staff/QrScanner.svelte';
	import { parseTicketToken } from '$lib/staff/ticket-qr';
	import ResultA from './ResultA.svelte';
	import ResultB from './ResultB.svelte';
	import ResultC from './ResultC.svelte';
	import type { ScanParty } from './types';

	let { onSearchByName }: { onSearchByName: () => void } = $props();

	// <!-- VARIANT-SWITCHER -->
	let variant = $state<'a' | 'b' | 'c'>(
		['a', 'b', 'c'].includes(page.url.searchParams.get('variante') ?? '')
			? ((page.url.searchParams.get('variante') as 'a' | 'b' | 'c'))
			: 'a'
	);

	type ScanResult = { kind: 'party'; party: ScanParty } | { kind: 'refusal'; message: string };

	let result = $state<ScanResult | null>(null);
	let scanning = $state(false);
	let flash = $state('');
	let simulate = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	// The camera keeps reading the Ticket still in front of it: the same one
	// is ignored for a few seconds, so a party just let in is not refused
	// as « déjà entré » the instant after.
	let lastToken = '';
	let lastAt = 0;

	async function handleScan(rawToken: string) {
		const token = parseTicketToken(rawToken) ?? rawToken.trim();
		// A party on screen waits for its answer; a refusal gives way to the next Ticket.
		if (!token || scanning || result?.kind === 'party') return;
		if (token === lastToken && Date.now() - lastAt < 4000) return;
		lastToken = token;
		lastAt = Date.now();
		scanning = true;
		try {
			// A form action called by hand: SvelteKit answers JSON only when asked,
			// in its own serialisation.
			const res = await fetch('?/scan', {
				method: 'POST',
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				body: new URLSearchParams({ token }),
			});
			const action = deserialize(await res.text()) as {
				type: string;
				data?: { scan?: { party: ScanParty }; scanRefusal?: string };
			};
			if (action.type === 'success' && action.data?.scan) {
				result = { kind: 'party', party: action.data.scan.party };
			} else {
				result = { kind: 'refusal', message: action.data?.scanRefusal ?? 'Billet inconnu.' };
			}
		} catch {
			result = { kind: 'refusal', message: 'Billet inconnu.' };
		} finally {
			scanning = false;
			simulate = '';
		}
	}

	function checkedIn(guests: number) {
		result = null;
		lastAt = Date.now();
		flash = `${guests} ${guests === 1 ? 'personne entrée' : 'personnes entrées'}.`;
		if (flashTimer !== null) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = ''), 2000);
	}

	async function searchByName() {
		result = null;
		const url = new URL(page.url.href);
		url.searchParams.set('onglet', 'arrivees');
		replaceState(url, page.state);
		onSearchByName();
		await tick();
		document.getElementById('arrivees-search')?.focus();
	}
</script>

<div class="mx-auto max-w-lg">
	<!-- VARIANT-SWITCHER -->
	<div class="mb-3 flex items-center justify-center gap-2" aria-label="Variante du résultat de scan">
		<span class="text-xs text-muted-foreground">Variante</span>
		{#each ['a', 'b', 'c'] as v (v)}
			<button
				type="button"
				onclick={() => (variant = v as 'a' | 'b' | 'c')}
				aria-label="Variante {v.toUpperCase()}"
				aria-pressed={variant === v}
				class="min-h-9 min-w-9 rounded-md border text-sm font-semibold {variant === v
					? 'border-foreground bg-foreground text-background'
					: 'border-border-card bg-background text-foreground hover:bg-muted'}"
			>
				{v.toUpperCase()}
			</button>
		{/each}
	</div>

	{#if flash}
		<p
			class="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-base font-semibold text-background"
			role="status"
		>
			<Check size={18} aria-hidden="true" />
			{flash}
		</p>
	{/if}

	{#if result?.kind === 'refusal'}
		<div class="mb-3 rounded-lg border-2 border-foreground bg-background p-4" role="status">
			<p class="flex items-center gap-2 text-base font-semibold text-foreground">
				<Ban size={18} aria-hidden="true" />
				{result.message}
			</p>
		</div>
	{/if}

	<!-- Variante B remplace la caméra par la fiche ; A et C la gardent. -->
	{#if result?.kind === 'party' && variant === 'b'}
		<ResultB party={result.party} onDone={checkedIn} />
	{:else}
		<QrScanner onScan={handleScan} />
	{/if}

	{#if result?.kind === 'party' && variant === 'a'}
		<ResultA party={result.party} onDone={checkedIn} onDismiss={() => (result = null)} />
	{:else if result?.kind === 'party' && variant === 'c'}
		<div class="mt-3">
			<ResultC party={result.party} onDone={checkedIn} onDismiss={() => (result = null)} />
		</div>
	{/if}

	<div class="mt-4 flex flex-col gap-3">
		<button
			type="button"
			onclick={searchByName}
			class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-card bg-background px-4 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
		>
			<Search size={16} aria-hidden="true" />
			Chercher un nom
		</button>

		{#if import.meta.env.DEV}
			<!-- Développement seulement : essayer les variantes sans imprimer de billets. -->
			<form
				class="flex gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					handleScan(simulate);
				}}
			>
				<input
					type="text"
					bind:value={simulate}
					placeholder="Simuler un scan : jeton ou lien /tickets/…"
					class="min-h-11 flex-1 rounded-lg border border-border-input bg-background px-3 text-base text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
				/>
				<button
					type="submit"
					disabled={scanning || result !== null}
					class="min-h-11 rounded-lg border border-border-card px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
				>
					Simuler
				</button>
			</form>
		{/if}
	</div>
</div>
