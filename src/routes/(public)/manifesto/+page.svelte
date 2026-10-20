<script lang="ts">
	import { t } from 'svelte-i18n';
	import ManifestoPoster from '$lib/components/manifesto/ManifestoPoster.svelte';
	import ManifestoDisciplines from '$lib/components/manifesto/ManifestoDisciplines.svelte';
	import ClosingLetter from '$lib/components/ClosingLetter.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{$t('manifesto.pageTitle')}</title>
	<meta name="description" content={$t('manifesto.metaDescription')} />
</svelte:head>

<ManifestoPoster photos={data.photos} />

<ManifestoDisciplines photos={data.photos} />

<ClosingLetter />
