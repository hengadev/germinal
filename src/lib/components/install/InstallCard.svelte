<script lang="ts">
	/**
	 * Carte flottante d'installation (issue 075) : en bas de l'écran au-dessus
	 * de la barre mobile (`bottomOffset`, barre + bouton Scanner + zone de
	 * sécurité), en bas à droite (~20rem) sur bureau. Sur Android quand le
	 * navigateur a fourni son invite, sur iPhone pour ouvrir la feuille
	 * « Partager → Sur l'écran d'accueil ». Écartée pour 14 jours.
	 */
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/components/staff/motion';
	import {
		installOffer,
		initInstall,
		isInstallDismissed,
		dismissInstall,
		canOfferInstall,
		openInstall
	} from './install-prompt.svelte';

	let { app, bottomOffset = '1rem' }: { app: 'staff' | 'admin'; bottomOffset?: string } = $props();

	const appLabel = $derived(app === 'admin' ? "l'app Admin" : "l'app Staff");	const icon = $derived(app === 'admin' ? '/pwa-admin-192x192.png' : '/pwa-192x192.png');

	let visible = $state(false);

	onMount(() => {
		initInstall();
	});

	$effect(() => {
		visible = canOfferInstall() && !isInstallDismissed();
	});

	function later() {
		visible = false;
		dismissInstall();
	}
</script>

{#if visible}
	<!-- fixed: elle ne pousse jamais le contenu de la page. -->
	<div
		class="fixed left-4 right-4 z-50 rounded-xl border border-border-card bg-background p-4 shadow-popover lg:left-auto lg:right-4 lg:w-80"
		style="bottom: {bottomOffset};"
		role="region"
		aria-label="Installer {appLabel}"
		transition:slide={{ duration: motion(200) }}
	>
		<div class="flex items-start gap-3">
			<img
				src={icon}
				alt="Germinal"
				class="h-10 w-10 shrink-0 rounded-xl"
				aria-hidden="true"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground">Installer {appLabel}</p>
				<p class="mt-0.5 text-xs text-muted-foreground">
					{app === 'admin'
						? "L'admin s'ouvrira en plein écran depuis l'écran d'accueil."
						: "Le portail s'ouvrira en plein écran depuis l'écran d'accueil."}
				</p>
				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						onclick={() => {
							if (installOffer.platform === 'ios') visible = false;
							openInstall();
						}}
						class="min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85"
					>
						{installOffer.platform === 'ios' ? 'Comment faire' : 'Installer'}
					</button>
					<button
						type="button"
						onclick={later}
						class="min-h-10 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
					>
						Plus tard
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
