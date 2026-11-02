<script lang="ts">
	/**
	 * Issue 060/061 — le bandeau « Hors ligne » du portail Staff : il
	 * apparaît quand le réseau tombe, avec l'âge de la copie du Jour
	 * stockée sur le téléphone. Issue 061 : il reste visible tant qu'il y
	 * a des arrivées en attente ou des refus à vérifier, même en ligne —
	 * « Hors ligne · N en attente », « Envoi… » pendant le renvoi, et
	 * « N à vérifier » ouvre la feuille des conflits.
	 */
	import { AlertTriangle, LoaderCircle, WifiOff } from 'lucide-svelte';
	import { onlineState } from '$lib/staff/offline/online-state.svelte';
	import { queueState } from '$lib/staff/offline/arrival-queue.svelte';
	import ArrivalConflictsSheet from './ArrivalConflictsSheet.svelte';

	let { takenAt }: { takenAt: string | null } = $props();

	const copyLabel = $derived.by(() => {
		if (!takenAt) return null;
		const parts = new Intl.DateTimeFormat('fr-FR', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).formatToParts(new Date(takenAt));
		const hour = parts.find((p) => p.type === 'hour')?.value;
		const minute = parts.find((p) => p.type === 'minute')?.value;
		return hour && minute ? `${hour === '24' ? '00' : hour} h ${minute}` : null;
	});

	const pending = $derived(queueState.pending);
	const conflicts = $derived(queueState.conflicts.length);
	const visible = $derived(!onlineState.online || pending > 0 || conflicts > 0 || queueState.sending);
	let sheetOpen = $state(false);
</script>

{#if visible}
	<div
		class="mb-6 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border-2 border-foreground bg-background px-4 text-sm font-semibold text-foreground"
		role="status"
	>
		{#if queueState.sending}
			<span class="inline-flex items-center gap-2">
				<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
				Envoi…
			</span>
		{:else if !onlineState.online}
			<span class="inline-flex items-center gap-2">
				<WifiOff size={16} aria-hidden="true" />
				Hors ligne{#if pending > 0}&nbsp;· {pending} en attente{:else if copyLabel}&nbsp;· copie de {copyLabel}{/if}
			</span>
		{:else if pending > 0}
			<span class="inline-flex items-center gap-2">
				<WifiOff size={16} aria-hidden="true" />
				{pending} en attente
			</span>
		{/if}
		{#if conflicts > 0}
			<button
				type="button"
				onclick={() => (sheetOpen = true)}
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-foreground px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
			>
				<AlertTriangle size={14} aria-hidden="true" />
				{conflicts} à vérifier
			</button>
		{/if}
	</div>
{/if}

<ArrivalConflictsSheet open={sheetOpen} onClose={() => (sheetOpen = false)} />
