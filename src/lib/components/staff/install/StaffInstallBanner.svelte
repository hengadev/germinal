<script lang="ts">
	/**
	 * Bannière d'installation Staff (issue 062) : sur Android quand le
	 * navigateur a fourni son invite, sur iPhone pour ouvrir la feuille
	 * « Partager → Sur l'écran d'accueil ». Écartée pour 14 jours.
	 */
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/components/staff/motion';
	import { Download } from 'lucide-svelte';
	import {
		staffInstall,
		initStaffInstall,
		isStaffInstallDismissed,
		dismissStaffInstall,
		canOfferStaffInstall,
		openStaffInstall
	} from './install-prompt.svelte';

	let visible = $state(false);

	onMount(() => {
		initStaffInstall();
	});

	$effect(() => {
		visible = canOfferStaffInstall() && !isStaffInstallDismissed();
	});

	function later() {
		visible = false;
		dismissStaffInstall();
	}
</script>

<!-- A strip under the header, in the page's flow: it never covers the
     bottom bar or the Scanner button. Gone once dismissed or installed. -->
{#if visible}
	<div
		class="border-b border-border-card bg-background px-4 py-3"
		role="region"
		aria-label="Installer l'app Staff"
		transition:slide={{ duration: motion(200) }}
	>
		<div class="flex items-start gap-3">
			<Download class="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground">Installer l'app Staff</p>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Le portail s'ouvrira en plein écran depuis l'écran d'accueil.
				</p>
				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						onclick={() => {
							if (staffInstall.platform === 'ios') visible = false;
							openStaffInstall();
						}}
						class="min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85"
					>
						{staffInstall.platform === 'ios' ? 'Comment faire' : 'Installer'}
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
