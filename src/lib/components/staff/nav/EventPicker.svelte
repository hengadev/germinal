<script lang="ts">
	/**
	 * La feuille « Pour quel événement ? » des raccourcis de l'en-tête :
	 * un bouton par événement possible ; le choix ouvre l'événement avec la
	 * feuille du raccourci.
	 */
	import { fade, fly } from 'svelte/transition';
	import { ChevronRight, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { eventPicker, closeEventPicker, type PickableEvent } from './event-picker.svelte';

	let sheetEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (eventPicker.action) sheetEl?.focus();
	});

	function choose(event: PickableEvent) {
		const onpick = eventPicker.onpick;
		closeEventPicker();
		onpick(event);
	}
</script>

{#if eventPicker.action}
	<div
		class="fixed inset-0 z-[59] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={closeEventPicker}
		aria-hidden="true"
	></div>
	<div
		bind:this={sheetEl}
		role="dialog"
		aria-modal="true"
		aria-label={eventPicker.action}
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 [@media(display-mode:standalone)]:pb-8 shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && closeEventPicker()}
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<h2 class="text-lg font-semibold text-foreground">{eventPicker.action}</h2>
				<p class="text-sm text-muted-foreground">Pour quel événement ?</p>
			</div>
			<button
				type="button"
				onclick={closeEventPicker}
				aria-label="Fermer"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" class="mx-auto" />
			</button>
		</header>
		<ul class="divide-y divide-border-card rounded-lg border border-border-card">
			{#each eventPicker.events as event (event.eventId)}
				<li>
					<button
						type="button"
						onclick={() => choose(event)}
						class="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
					>
						<span class="min-w-0 truncate">{event.title}</span>
						<ChevronRight size={18} aria-hidden="true" class="shrink-0 text-muted-foreground" />
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}
