<script lang="ts">
	import EventDetailLayout from '$lib/components/EventDetailLayout.svelte';
	import SessionSelector from '$lib/components/booking/SessionSelector.svelte';
	import { ArrowLeft } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { reveal } from '$lib/actions/reveal';
	import { t, locale } from 'svelte-i18n';

	let { data }: { data: PageData } = $props();

	const spotlightEvent = $derived(data.spotlightEvent);

	let sessions = $derived(
		spotlightEvent?.eventSessions?.map((s: any) => ({
			...s,
			soldOut: s.availableCapacity === 0,
			isPast: new Date(s.endTime) < new Date()
		})) ?? []
	);

	function getEventField(
		field: 'title' | 'description' | 'subtitle'
	): string {
		if (!spotlightEvent) return '';
		const enField = (field + 'En') as 'titleEn' | 'descriptionEn' | 'subtitleEn';
		const frField = (field + 'Fr') as 'titleFr' | 'descriptionFr' | 'subtitleFr';
		return $locale === 'en' ? (spotlightEvent[enField] || '') : (spotlightEvent[frField] || '');
	}
</script>

{#if spotlightEvent}
	<EventDetailLayout event={spotlightEvent}>
		{#if sessions.some((s: any) => !s.isPast)}
			<section class="mt-12 lg:mt-16" use:reveal={{ preset: 'fade-up', delay: 250 }}>
				<h2 class="text-2xl lg:text-3xl font-serif mb-6 lg:mb-8">
					{$t('events.bookTickets')}
				</h2>
				<SessionSelector
					sessions={sessions}
					eventTitle={getEventField('title')}
					eventSlug={spotlightEvent.slug}
				/>
			</section>
		{/if}
	</EventDetailLayout>
{:else}
	<div class="container mx-auto px-4 py-16 lg:py-32 max-w-8xl">
		<a
			href="/events"
			class="flex items-center gap-2 mb-6 lg:mb-8 cursor-pointer"
			use:reveal={{ preset: 'fade-in' }}
		>
			<ArrowLeft size={18} />
			<p class="text-700 text-sm lg:text-base">{$t('events.backToAll')}</p>
		</a>
		<div class="text-center py-16 lg:py-32" use:reveal={{ preset: 'fade-up' }}>
			<h1 class="text-2xl lg:text-3xl font-serif mb-3 lg:mb-4">{$t('spotlight.noEventTitle')}</h1>
			<p class="text-dark-500 text-base lg:text-lg mb-6 lg:mb-8 px-4">
				{$t('spotlight.noEventDescription')}
			</p>
			<a
				href="/events"
				class="inline-block px-5 py-2.5 lg:px-6 lg:py-3 bg-dark-900 text-white rounded-none hover:bg-dark-800 transition-colors text-sm lg:text-base"
			>
				{$t('spotlight.viewAllEvents')}
			</a>
		</div>
	</div>
{/if}
