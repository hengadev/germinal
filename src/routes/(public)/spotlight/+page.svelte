<script lang="ts">
	import { ArrowLeft, MapPin, Calendar, Star } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { reveal } from '$lib/actions/reveal';

	let { data }: { data: PageData } = $props();

	const spotlightEvent = $derived(data.spotlightEvent);

	let collaborators = $derived(
		spotlightEvent?.collaborators ? JSON.parse(spotlightEvent.collaborators) : []
	);

	let timings = $derived(
		spotlightEvent?.timings ? JSON.parse(spotlightEvent.timings) : []
	);
</script>

<svelte:head>
	<title>Spotlight Event | Germinal</title>
	<meta name="description" content="Featured spotlight event" />
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">
	<a
		href="/events"
		class="flex items-center gap-2 mb-8 cursor-pointer"
		use:reveal={{ preset: 'fade-in' }}
	>
		<ArrowLeft />
		<p class="text-700">Back to All Events</p>
	</a>

	{#if spotlightEvent}
		<article>
			<header
				class="mb-16 grid gap-4"
				use:reveal={{ preset: 'fade-up', delay: 50 }}
			>
				<div class="flex items-center gap-2">
					<Star class="text-amber-500 fill-amber-500" size={24} />
					<span class="text-amber-600 font-semibold uppercase tracking-wide text-sm">Spotlight Event</span>
				</div>
				<h1 class="text-5xl font-bold">{spotlightEvent.title}</h1>
				{#if spotlightEvent.subtitle}
					<p class="text-dark-500 text-lg font-light">
						{spotlightEvent.subtitle}
					</p>
				{/if}
			</header>

			<div class="w-full border border-border-card/20 mb-16"></div>

			<section class="grid grid-cols-[1fr_auto] gap-32 text-sm">
				<div class="grid gap-8">
					<div use:reveal={{ preset: 'fade-up', delay: 100 }}>
						<p class="text-lg text-dark-500 leading-relaxed">
							{spotlightEvent.description}
						</p>
					</div>

					{#if collaborators.length > 0}
						<div
							class="bg-dark-50/60 p-8 grid gap-4"
							use:reveal={{ preset: 'fade-up', delay: 150 }}
						>
							<p class="text-md text-dark-300 text-bold leading-relaxed uppercase">
								In Collaboration With
							</p>
							<div class="flex gap-12 items-center flex-wrap">
								{#each collaborators as collab}
									<div class="flex gap-2 items-center">
										<div class="rounded-full bg-dark-400 w-12 h-12"></div>
										<div>
											<p class="text-dark-900 font-bold">
												{collab.name}
											</p>
											<p class="text-dark-500">{collab.role}</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div
					class="grid gap-8 min-w-90"
					use:reveal={{ preset: 'fade-up', delay: 150 }}
				>
					<div class="grid gap-4">
						<div class="flex items-center gap-2">
							<Calendar size={16} />
							<p class="capitalize text-dark-900">Dates</p>
						</div>
						<div class="text-dark-500">
							<p>
								{new Date(spotlightEvent.startDate).toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</p>
							{#if new Date(spotlightEvent.startDate).toDateString() !== new Date(spotlightEvent.endDate).toDateString()}
								<p>to {new Date(spotlightEvent.endDate).toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}</p>
							{/if}
						</div>
					</div>

					<div class="grid gap-4">
						<div class="flex items-center gap-2">
							<MapPin size={16} />
							<p class="capitalize text-dark-900">Location</p>
						</div>
						<div class="text-dark-500">
							{#if spotlightEvent.venueName}
								<p>{spotlightEvent.venueName}</p>
							{/if}
							{#if spotlightEvent.streetAddress}
								<p>{spotlightEvent.streetAddress}</p>
							{/if}
							{#if spotlightEvent.district || spotlightEvent.city || spotlightEvent.postalCode}
								<p>
									{#if spotlightEvent.district}{spotlightEvent.district},
									{/if}
									{#if spotlightEvent.city}{spotlightEvent.city}
									{/if}
									{#if spotlightEvent.postalCode}{spotlightEvent.postalCode}{/if}
								</p>
							{/if}
							{#if spotlightEvent.country}
								<p>{spotlightEvent.country}</p>
							{/if}
						</div>
					</div>

					{#if timings.length > 0}
						<div class="grid gap-4">
							<div class="flex items-center gap-2">
								<Calendar size={16} />
								<p class="capitalize text-dark-900">Timings</p>
							</div>
							<div class="text-dark-500">
								{#each timings as timing}
									<p>{timing.label}: {timing.time}</p>
								{/each}
							</div>
						</div>
					{/if}

					{#if spotlightEvent.admissionInfo}
						<div class="grid gap-4">
							<p class="capitalize text-dark-900">Admission</p>
							<p class="text-dark-500">{spotlightEvent.admissionInfo}</p>
						</div>
					{/if}
				</div>
			</section>

			{#if spotlightEvent.media && spotlightEvent.media.length > 0}
				<section
					class="mt-12"
					use:reveal={{ preset: 'fade-up', delay: 200 }}
				>
					<h2 class="text-3xl font-bold mb-6">Gallery</h2>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each spotlightEvent.media as mediaItem}
							<div class="aspect-video rounded-lg overflow-hidden bg-dark-100">
								<img
									src={mediaItem.url}
									alt={spotlightEvent.title}
									class="w-full h-full object-cover"
								/>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if spotlightEvent.eventSessions && spotlightEvent.eventSessions.length > 0}
				<section class="mt-16" use:reveal={{ preset: 'fade-up', delay: 250 }}>
					<h2 class="text-3xl font-bold mb-8">Book Tickets</h2>
					<div class="grid gap-4">
						{#each spotlightEvent.eventSessions as session}
							<a
								href="/events/{spotlightEvent.slug}/book/{session.id}"
								class="block p-6 bg-white border border-border-card rounded-lg hover:border-dark-900 transition-colors"
							>
								<div class="flex justify-between items-start">
									<div>
										<h3 class="font-bold text-lg">{session.title}</h3>
										{#if session.description}
											<p class="text-dark-500 text-sm mt-1">{session.description}</p>
										{/if}
										<p class="text-dark-500 text-sm mt-2">
											{new Date(session.startTime).toLocaleString('en-US', {
												weekday: 'short',
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit'
											})}
											-
											{new Date(session.endTime).toLocaleTimeString('en-US', {
												hour: '2-digit',
												minute: '2-digit'
											})}
										</p>
									</div>
									<div class="text-right">
										<p class="font-bold text-lg">
											{(session.priceAmount / 100).toFixed(2)} {session.currency}
										</p>
										<p class="text-dark-500 text-sm">
											{session.availableCapacity} spots left
										</p>
									</div>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</article>
	{:else}
		<div class="text-center py-32" use:reveal={{ preset: 'fade-up' }}>
			<Star class="mx-auto text-dark-200 mb-6" size={64} />
			<h1 class="text-3xl font-bold mb-4">No Spotlight Event</h1>
			<p class="text-dark-500 text-lg mb-8">
				There is currently no spotlight event. Check back soon for featured events.
			</p>
			<a
				href="/events"
				class="inline-block px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
			>
				View All Events
			</a>
		</div>
	{/if}
</div>
