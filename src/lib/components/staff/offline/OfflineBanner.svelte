<script lang="ts">
	/**
	 * Issue 060 — le bandeau « Hors ligne » du portail Staff : il apparaît
	 * quand le réseau tombe, avec l'âge de la copie du Jour stockée sur le
	 * téléphone, et disparaît avec le retour du réseau.
	 */
	import { WifiOff } from 'lucide-svelte';
	import { onlineState } from '$lib/staff/offline/online-state.svelte';

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
</script>

{#if !onlineState.online}
	<div
		class="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-foreground bg-background px-4 text-sm font-semibold text-foreground"
		role="status"
	>
		<WifiOff size={16} aria-hidden="true" />
		Hors ligne{#if copyLabel}&nbsp;· copie de {copyLabel}{/if}
	</div>
{/if}
