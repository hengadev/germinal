<script lang="ts">
	/**
	 * Bannière d'installation Staff (issue 062), affichée sur Android quand
	 * le navigateur a émis son évènement beforeinstallprompt et que
	 * l'offre n'a pas été écartée depuis moins de 14 jours. iOS est traité
	 * par la feuille dédiée, pas par cette bannière.
	 */
	import { onMount } from 'svelte';
	import { Download } from 'lucide-svelte';
	import {
		staffInstall,
		initStaffInstall,
		isStaffInstallDismissed,
		dismissStaffInstall,
		promptStaffInstall
	} from './install-prompt.svelte';

	let visible = $state(false);

	onMount(() => {
		initStaffInstall();
	});

	$effect(() => {
		visible =
			staffInstall.platform === 'android' &&
			staffInstall.deferredPrompt !== null &&
			!isStaffInstallDismissed();
	});

	function later() {
		visible = false;
		dismissStaffInstall();
	}
</script>

<div
	class="back-office fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-2xl border-t border-border-card bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
	style="transition: opacity 300ms; opacity: {visible ? 1 : 0}; pointer-events: {visible
		? 'auto'
		: 'none'};"
	aria-hidden={!visible}
>
	<div class="flex items-center gap-3">
		<Download class="size-6 shrink-0 text-foreground" aria-hidden="true" />
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-foreground">Installer l'app Staff</p>
			<p class="mt-0.5 text-xs text-muted-foreground">
				Un appui suffira pour ouvrir le portail, même hors connexion.
			</p>
		</div>
		<button
			type="button"
			onclick={later}
			class="min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
		>
			Plus tard
		</button>
		<button
			type="button"
			onclick={promptStaffInstall}
			class="min-h-11 rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85"
		>
			Installer
		</button>
	</div>
</div>
