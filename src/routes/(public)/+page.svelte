<script lang="ts">
	// PROTOTYPE — the home page: as it was (h0) or assembled from the parts
	// chosen in the first round (h4), seen with the next Event leading or
	// the studio leading (?spot=on|off). The chosen one replaces this switch.
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import HomeActuel from './prototype-home/HomeActuel.svelte';
	import HomeAssemblage from './prototype-home/HomeAssemblage.svelte';
	import Switcher from './prototype-home/Switcher.svelte';

	let { data }: { data: PageData } = $props();

	const variants = [
		{ id: 'h0', name: 'Actuel' },
		{ id: 'h4', name: 'Assemblage' },
	];
	const states = [
		{ id: 'on', name: 'Prochaine soirée' },
		{ id: 'off', name: 'Studio' },
	];
	const variant = $derived(variants.find((v) => v.id === page.url.searchParams.get('h')) ?? variants[1]);
	const state = $derived(states.find((s) => s.id === page.url.searchParams.get('spot')) ?? states[0]);

	const spotlight = $derived(state.id === 'on' ? (data.spotlightEvent ?? data.prototypeStandIn ?? null) : null);
	const projects = $derived(data.events.filter((e) => e.isPortfolio && e.coverMedia && !e.isSpotlight));
</script>

<svelte:head>
	<title>{$t('homeNext.metaTitle')}</title>
	<meta name="description" content={$t('homeNext.metaDescription')} />
</svelte:head>

{#key variant.id}
	{#if variant.id === 'h0'}
		<HomeActuel data={{ ...data, spotlightEvent: spotlight }} />
	{:else}
		<HomeAssemblage {spotlight} {projects} talents={data.talents} />
	{/if}
{/key}

<Switcher
	groups={[
		{ param: 'h', label: 'Accueil', variants, current: variant.id },
		{ param: 'spot', label: 'En tête', variants: states, current: state.id },
	]}
/>
