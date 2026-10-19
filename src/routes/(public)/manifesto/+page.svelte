<script lang="ts">
	// PROTOTYPE — the Manifesto in variants to choose from: the manifesto
	// itself (?v=…). « Ce que nous faisons » (Planches) and the ending
	// (Lettre) are settled. The chosen one replaces this switch.
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import VariantA2 from './prototype-manifesto/VariantA2.svelte';
	import VariantA3 from './prototype-manifesto/VariantA3.svelte';
	import DisciplinesPlanches from './prototype-manifesto/DisciplinesPlanches.svelte';
	import ClosingLettre from './prototype-manifesto/ClosingLettre.svelte';
	import Switcher from './prototype-manifesto/Switcher.svelte';

	let { data } = $props();

	const manifestos = [
		{ id: 'a2', name: 'Relais', component: VariantA2 },
		{ id: 'a3', name: 'Composition', component: VariantA3 },
	];
	const manifesto = $derived(manifestos.find((v) => v.id === page.url.searchParams.get('v')) ?? manifestos[0]);
</script>

<svelte:head>
	<title>{$t('manifesto.pageTitle')}</title>
	<meta name="description" content={$t('manifesto.metaDescription')} />
</svelte:head>

{#key manifesto.id}
	<manifesto.component photos={data.photos} />
{/key}

<DisciplinesPlanches photos={data.photos} />

<ClosingLettre />

<Switcher
	groups={[
		{ param: 'v', label: 'Manifeste', variants: manifestos, current: manifesto.id },
	]}
/>
