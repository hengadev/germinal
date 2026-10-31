<script lang="ts">
	/**
	 * Le scanner en plein écran (issue 034) : le bouton flottant (mobile) ou
	 * le lien Scanner (bureau) l'ouvre au-dessus de tout, sans naviguer.
	 * Avec un seul événement dont le Jour est en cours, la caméra vient
	 * directement ; avec plusieurs, un court choix d'abord.
	 */
	import { fade, fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import Scanner from './Scanner.svelte';
	import { scanOverlay, closeScanOverlay } from './scan-overlay.svelte';

	let { targets }: { targets: { eventId: string; title: string }[] } = $props();

	const target = $derived(targets.find((t) => t.eventId === scanOverlay.eventId) ?? null);

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeScanOverlay();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if scanOverlay.picking || scanOverlay.eventId}
	<div
		class="fixed inset-0 z-[60] bg-background flex flex-col"
		transition:fade={{ duration: motion(150) }}
		role="dialog"
		aria-modal="true"
		aria-label="Scanner"
		data-no-swipe
	>
		<header class="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border-card bg-background px-4 py-3">
			<h2 class="min-w-0 truncate text-lg font-semibold text-foreground">
				{#if scanOverlay.picking}
					Quel événement scanner&nbsp;?
				{:else if target}
					{target.title}
				{/if}
			</h2>
			<button
				type="button"
				onclick={closeScanOverlay}
				aria-label="Fermer le scanner"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</header>

		{#if scanOverlay.picking}
			<!-- Grandes lignes, à portée de pouce. -->
			<nav class="flex-1 overflow-y-auto px-4 py-4" aria-label="Événements à scanner">
				<ul class="mx-auto max-w-lg space-y-3">
					{#each targets as t (t.eventId)}
						<li>
							<button
								type="button"
								onclick={() => {
									scanOverlay.eventId = t.eventId;
									scanOverlay.picking = false;
								}}
								class="w-full min-h-14 rounded-lg border border-border-card bg-background px-4 py-4 text-left text-lg font-semibold text-foreground transition-colors hover:bg-muted"
							>
								{t.title}
							</button>
						</li>
					{/each}
				</ul>
			</nav>
		{:else if scanOverlay.eventId}
			<div class="flex-1 overflow-y-auto px-4 py-4" in:fly={{ y: 320, duration: motion(250), easing: cubicOut }}>
				<Scanner eventId={scanOverlay.eventId} />
			</div>
		{/if}
	</div>
{/if}
