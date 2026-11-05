<script lang="ts">
	/**
	 * Feuille d'installation iOS Staff (issue 062) : Safari iOS n'offre
	 * aucun évènement, on explique « Partager → Sur l'écran d'accueil ».
	 */
	import { fade, fly } from 'svelte/transition';
	import { Share, SquarePlus, X } from 'lucide-svelte';
	import { motion, cubicOut } from '$lib/components/staff/motion';
	import { installOffer } from './install-prompt.svelte';

	let { app }: { app: 'staff' | 'admin' } = $props();
	const appLabel = $derived(app === 'admin' ? "l'app Admin" : "l'app Staff");

	function close() {
		installOffer.showIOSSheet = false;
	}

	const STEP = 'flex items-start gap-3 rounded-lg border border-border-card p-3';
	const ICON = 'mt-0.5 size-5 shrink-0 text-foreground';
</script>

{#if installOffer.showIOSSheet}
	<div
		class="fixed inset-0 z-[59] bg-black/50"
		transition:fade={{ duration: motion(150) }}
		onclick={close}
		aria-hidden="true"
		data-no-swipe
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Installer l'app sur l'écran d'accueil"
		tabindex="-1"
		class="back-office fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border-card bg-background p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-lg"
		transition:fly={{ y: 320, duration: motion(250), easing: cubicOut }}
		onkeydown={(event) => event.key === 'Escape' && close()}
		data-no-swipe
	>
		<header class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold text-foreground">Installer {appLabel}</h2>
			<button
				type="button"
				onclick={close}
				aria-label="Fermer"
				class="min-h-11 min-w-11 rounded-full text-foreground hover:bg-muted"
			>
				<X size={20} aria-hidden="true" />
			</button>
		</header>

		<p class="mb-3 text-sm text-muted-foreground">
			Sur iPhone ou iPad, l'app s'installe depuis Safari en deux gestes :
		</p>

		<div class="space-y-2">
			<div class={STEP}>
				<Share class={ICON} aria-hidden="true" />
				<p class="text-sm text-foreground">
					<span class="font-semibold">1. Partager</span> — le bouton carré avec une flèche,
					dans la barre d'outils de Safari.
				</p>
			</div>
			<div class={STEP}>
				<SquarePlus class={ICON} aria-hidden="true" />
				<p class="text-sm text-foreground">
					<span class="font-semibold">2. « Sur l'écran d'accueil »</span> — faites défiler la
					liste, puis validez. Germinal s'ouvrira comme une app.
				</p>
			</div>
		</div>
	</div>
{/if}
