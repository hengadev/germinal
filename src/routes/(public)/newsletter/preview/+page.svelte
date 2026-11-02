<script lang="ts">
	import NewsletterSignup from '$lib/components/NewsletterSignup.svelte';
	import { t } from 'svelte-i18n';
</script>

<svelte:head>
	<title>{$t('newsletterSignup.previewTitle')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-2xl">
	<h1 class="text-3xl lg:text-4xl font-serif mb-8">{$t('newsletterSignup.previewTitle')}</h1>
	<NewsletterSignup />
</div>
