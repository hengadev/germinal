<script lang="ts">
	import { ArrowLeft, MapPin, Clock, Info } from 'lucide-svelte';
	import type { Icon } from 'lucide-svelte';
	import { t, locale } from 'svelte-i18n';
	import { reveal } from '$lib/actions/reveal';

	type LocalizedField =
		| 'title'
		| 'description'
		| 'subtitle'
		| 'curator'
		| 'admissionInfo'
		| 'location'
		| 'venueName'
		| 'streetAddress'
		| 'district'
		| 'city'
		| 'country';

	type EnField =
		| 'titleEn'
		| 'descriptionEn'
		| 'subtitleEn'
		| 'curatorEn'
		| 'admissionInfoEn'
		| 'locationEn'
		| 'venueNameEn'
		| 'streetAddressEn'
		| 'districtEn'
		| 'cityEn'
		| 'countryEn';

	type FrField =
		| 'titleFr'
		| 'descriptionFr'
		| 'subtitleFr'
		| 'curatorFr'
		| 'admissionInfoFr'
		| 'locationFr'
		| 'venueNameFr'
		| 'streetAddressFr'
		| 'districtFr'
		| 'cityFr'
		| 'countryFr';

	let {
		event,
		children
	}: {
		event: {
			coverMedia?: { type: string; url: string } | null;
			postalCode?: string | null;
			collaborators?: string | null;
			timings?: string | null;
			[key: string]: any;
		} & { [K in EnField]?: string } & { [K in FrField]?: string };
		children: import('svelte').Snippet;
	} = $props();

	let collaborators = $derived(
		event.collaborators ? JSON.parse(event.collaborators) : []
	);

	let timings = $derived(event.timings ? JSON.parse(event.timings) : []);

	function getEventField(field: LocalizedField): string {
		const enField = (field + 'En') as EnField;
		const frField = (field + 'Fr') as FrField;
		return $locale === 'en' ? event[enField] || '' : event[frField] || '';
	}
</script>

<svelte:head>
	<title>{getEventField('title')} | Germinal</title>
	<meta name="description" content={getEventField('description').slice(0, 160)} />
</svelte:head>

<!-- Full-height hero -->
<section class="relative h-screen w-full overflow-hidden">
	<!-- Background media -->
	{#if event.coverMedia?.type === 'video'}
		<video
			src={event.coverMedia.url}
			autoplay
			muted
			loop
			playsinline
			class="absolute inset-0 w-full h-full object-cover"
		></video>
	{:else}
		<img
			src={event.coverMedia?.url ?? ''}
			alt={getEventField('title')}
			class="absolute inset-0 w-full h-full object-cover"
		/>
	{/if}

	<!-- Gradient overlay -->
	<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60"></div>

	<!-- Back button — sits below the fixed nav -->
	<a
		href="/events"
		class="absolute top-24 left-6 lg:left-12 z-10 flex items-center gap-2 text-white/90 hover:text-white transition-colors"
		use:reveal={{ preset: 'fade-in', duration: 600 }}
	>
		<ArrowLeft size={18} />
		<p class="text-sm lg:text-base">{$t('events.backToAll')}</p>
	</a>

	<!-- Title and subtitle at bottom -->
	<div
		class="absolute bottom-0 left-0 right-0 px-6 pb-12 lg:px-12 lg:pb-16 z-10"
		use:reveal={{ preset: 'fade-up', delay: 100, duration: 700 }}
	>
		<div class="flex flex-col gap-2">
			<h1 class="text-3xl lg:text-6xl font-medium text-white leading-tight">
				{getEventField('title')}
			</h1>
			{#if getEventField('subtitle')}
				<p class="text-white/70 text-base lg:text-xl font-light">
					{getEventField('subtitle')}
				</p>
			{/if}
		</div>
	</div>
</section>

<!-- Page content -->
<div class="container mx-auto px-4 py-16 lg:py-24 max-w-8xl">
	<article>
		<section
			class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-32 text-sm lg:text-base"
		>
			<div class="grid gap-6 lg:gap-8">
				<div use:reveal={{ preset: 'fade-up', delay: 100 }}>
					<p class="text-base lg:text-lg text-muted-foreground leading-relaxed">
						{getEventField('description')}
					</p>
				</div>
				{#if collaborators.length > 0}
					<div
						class="bg-surface/60 p-4 lg:p-8 grid gap-3 lg:gap-4"
						use:reveal={{ preset: 'fade-up', delay: 150 }}
					>
						<p
							class="text-xs text-muted-foreground font-semibold leading-relaxed uppercase"
						>
							{$t('events.inCollaborationWith')}
						</p>
						<div class="flex gap-6 lg:gap-12 items-center flex-wrap">
							{#each collaborators as collab}
								<div class="flex gap-2 items-center">
									<div
										class="rounded-full bg-muted-foreground w-10 h-10 lg:w-12 lg:h-12"
									></div>
									<div>
										<p class="text-foreground font-bold text-sm lg:text-base">
											{collab.name}
										</p>
										<p class="text-muted-foreground text-xs lg:text-sm">
											{collab.role}
										</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
			<div
				class="grid gap-6 lg:gap-8"
				use:reveal={{ preset: 'fade-up', delay: 150 }}
			>
				<div class="grid gap-3 lg:gap-4">
					{@render asideTitle($t('events.location'), MapPin)}
					<div class="text-muted-foreground text-sm lg:text-base">
						{#if getEventField('venueName')}
							<p>{getEventField('venueName')}</p>
						{/if}
						{#if getEventField('streetAddress')}
							<p>{getEventField('streetAddress')}</p>
						{/if}
						{#if getEventField('district') || getEventField('city') || event.postalCode}
							<p>
								{#if getEventField('district')}{getEventField('district')},
								{/if}
								{#if getEventField('city')}{getEventField('city')}
								{/if}
								{#if event.postalCode}{event.postalCode}{/if}
							</p>
						{/if}
						{#if getEventField('country')}
							<p>{getEventField('country')}</p>
						{/if}
					</div>
				</div>
				<div class="grid gap-3 lg:gap-4">
					{@render asideTitle($t('events.timings'), Clock)}
					<div class="text-muted-foreground text-sm lg:text-base">
						{#if timings.length > 0}
							{#each timings as timing}
								<p>{timing.label}: {timing.time}</p>
							{/each}
						{:else}
							<p>{$t('events.seeEventDates')}</p>
						{/if}
					</div>
				</div>
				<div class="grid gap-3 lg:gap-4">
					{@render asideTitle($t('events.details'), Info)}
					<div class="grid gap-2">
						{#if getEventField('curator')}
							{@render asideLastPart($t('events.curator'), getEventField('curator'))}
						{/if}
						{#if getEventField('admissionInfo')}
							{@render asideLastPart($t('events.admission'), getEventField('admissionInfo'))}
						{/if}
					</div>
				</div>
			</div>
		</section>

		{@render children()}
	</article>
</div>

{#snippet asideTitle(title: string, AsideIcon: typeof Icon)}
	<div class="flex items-center gap-2">
		<AsideIcon size={14} class="lg:size-[16px]" />
		<p class="capitalize text-foreground text-sm lg:text-base">{title}</p>
	</div>
{/snippet}

{#snippet asideLastPart(title: string, value: string)}
	<div class="grid gap-2">
		<div class="flex items-center justify-between gap-4">
			<p class="text-muted-foreground capitalize text-sm lg:text-base">{title}</p>
			<p class="text-foreground-alt text-sm lg:text-base text-right">{value}</p>
		</div>
		<div class="border border-border-input w-full"></div>
	</div>
{/snippet}
