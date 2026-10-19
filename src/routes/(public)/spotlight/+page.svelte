<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { t } from 'svelte-i18n';
</script>

<!-- Only reached without a Spotlight: with one, this page leads to its Event. -->
<div class="container mx-auto px-4 py-16 lg:py-32 max-w-8xl">
	<div class="text-center py-16 lg:py-32" use:reveal={{ preset: 'fade-up' }}>
		<h1 class="text-2xl lg:text-3xl font-serif mb-3 lg:mb-4">{$t('spotlight.noEventTitle')}</h1>
		<p class="text-muted-foreground text-base lg:text-lg mb-6 lg:mb-8 px-4">
			{$t('spotlight.noEventDescription')}
		</p>
		<a
			href="/events"
			class="inline-block px-5 py-2.5 lg:px-6 lg:py-3 bg-foreground text-white rounded-none hover:bg-foreground-alt transition-colors text-sm lg:text-base"
		>
			{$t('spotlight.viewAllEvents')}
		</a>
	</div>
</div>
