<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ArrowLeft, MapPin, Type, FileText } from 'lucide-svelte';
	import MediaUpload from '$lib/components/MediaUpload.svelte';
	import DaysServicesPicker, { type PickedDay } from '$lib/components/admin/DaysServicesPicker.svelte';
	import SeatingsEditor, {
		newSeatingService,
		type DraftSeatingService,
	} from '$lib/components/admin/SeatingsEditor.svelte';
	import PricingEditor, {
		newPricingService,
		toDraftDeposit,
		toDraftRefund,
		type DraftDeposit,
		type DraftMenu,
		type DraftPricingService,
		type DraftRefund,
	} from '$lib/components/admin/PricingEditor.svelte';
	import type { ActionData } from './$types';
	import type { Media } from '$lib/types/media';
	import type { PageData } from './$types';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { cn } from '$lib/utils/design-system';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const toast = getToastContext();

	const TABS = [
		{ id: 'essentiel', title: 'Essentiel' },
		{ id: 'lieu', title: 'Lieu' },
		{ id: 'dates-seances', title: 'Dates & séances' },
		{ id: 'tarifs', title: 'Menus & tarifs' },
		{ id: 'programme', title: 'Programme' },
		{ id: 'visuels', title: 'Visuels' },
	];

	// Base classes of bits-components/TabsList + TabsTrigger, then the overrides used on /admin/events/[id]
	const TAB_LIST_CLASS = cn(
		'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
		'inline-flex items-center w-fit bg-transparent gap-2 md:gap-1 text-sm font-semibold border-b-1 border-border-card md:p-1 md:leading-[0.01em]'
	);
	const TAB_TRIGGER_CLASS = cn(
		'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-mini',
		'data-[state=inactive]:hover:bg-accent hover:text-accent-foreground',
		'px-2 py-1.75 md:px-4 md:py-2 md:h-8 rounded-none bg-transparent border-b-3 data-[state=active]:shadow-none mb-[-2px] data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-transparent data-[state=inactive]:hover:text-foreground-alt transition-colors cursor-pointer whitespace-nowrap'
	);

	let activeTab = $state(0);
	let tabEls: HTMLButtonElement[] = $state([]);
	let panelEls: HTMLElement[] = $state([]);
	let submitting = $state(false);

	// All panels stay mounted (just hidden) so values and uploads survive switching tabs.
	// The form is novalidate because the browser can't point at a field on a hidden panel:
	// fields are checked per panel here instead, still with the browser's own rules and bubbles.
	function firstInvalidField(index: number) {
		return panelEls[index]?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:invalid, textarea:invalid') ?? null;
	}

	// Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern)
	function handleTabKeydown(event: KeyboardEvent) {
		const last = TABS.length - 1;
		const target =
			event.key === 'ArrowRight' ? (activeTab === last ? 0 : activeTab + 1)
			: event.key === 'ArrowLeft' ? (activeTab === 0 ? last : activeTab - 1)
			: event.key === 'Home' ? 0
			: event.key === 'End' ? last
			: null;
		if (target === null) return;
		event.preventDefault();
		activeTab = target;
		tabEls[target]?.focus();
	}

	// The Days cannot use browser validity (the payload is a hidden input),
	// so the enhance handler checks them before the per-field pass.
	function pickedDaysError(): string | null {
		if (days.length === 0) {
			return 'Sélectionnez au moins un jour sur le calendrier.';
		}
		if (days.some((day) => day.kinds.length === 0)) {
			return 'Cochez au moins un repas (déjeuner ou dîner) pour chaque jour sélectionné.';
		}
		return null;
	}

	function createEventEnhance({ cancel }: { cancel: () => void }) {
		const dayError = pickedDaysError();
		if (dayError !== null) {
			cancel();
			activeTab = 2;
			toast.error('Erreur', dayError);
			requestAnimationFrame(() => daysPicker?.focus());
			return;
		}
		const invalidTab = TABS.findIndex((_, i) => firstInvalidField(i));
		if (invalidTab !== -1) {
			cancel();
			activeTab = invalidTab;
			// Wait for the panel to be shown before the browser can point at the field
			requestAnimationFrame(() => firstInvalidField(invalidTab)?.reportValidity());
			return;
		}
		const editorChecks: [number, { id: string; message: string } | null][] = [
			[2, seatingsEditor?.firstBlockingField() ?? null],
			[3, pricingEditor?.firstBlockingField() ?? null],
		];
		for (const [tab, blocking] of editorChecks) {
			if (!blocking) continue;
			cancel();
			activeTab = tab;
			toast.error('Erreur', blocking.message);
			requestAnimationFrame(() => document.getElementById(blocking.id)?.focus());
			return;
		}
		submitting = true;
		return async ({ result }: { result: import('@sveltejs/kit').ActionResult }) => {
			submitting = false;
			if (result.type === 'success') {
				toast.success('Succès', (result.data as { success?: string })?.success ?? 'Événement créé');
				goto('/admin/events');
			} else if (result.type === 'failure') {
				toast.error('Erreur', (result.data as { error?: string })?.error ?? 'Une erreur est survenue');
			}
		};
	}

	let titleEn = $state('');
	let titleFr = $state('');
	let descriptionEn = $state('');
	let descriptionFr = $state('');
	let subtitleEn = $state('');
	let subtitleFr = $state('');
	// Days picked on the calendar (issue 019) — the Event's start/end dates
	// are derived from the first and last Day.
	let days: PickedDay[] = $state([]);
	let daysPicker: ReturnType<typeof DaysServicesPicker> | undefined = $state();
	// Venue Capacity (issue 021): inherited by every Seating unless overridden.
	let venueCapacity: number | null = $state(null);

	// « Séances » and « Menus & tarifs »: the event page's editors, on the
	// Services just picked. Each Day + meal gets a placeholder id, kept while
	// it stays picked; `serviceRefs` tells the server which Service each
	// placeholder stands for (see new-event-schedule.ts).
	let seatingServices: DraftSeatingService[] = $state([]);
	let pricingServices: DraftPricingService[] = $state([]);
	let menus: DraftMenu[] = $state([]);
	let deposit: DraftDeposit = $state(toDraftDeposit(undefined));
	let refund: DraftRefund = $state(toDraftRefund(undefined, true));
	let seatingsEditor: ReturnType<typeof SeatingsEditor> | undefined = $state();
	let pricingEditor: ReturnType<typeof PricingEditor> | undefined = $state();

	const placeholderIds = new Map<string, string>();
	function placeholderId(date: string, kind: 'lunch' | 'dinner'): string {
		const key = `${date}:${kind}`;
		let id = placeholderIds.get(key);
		if (!id) {
			id = crypto.randomUUID();
			placeholderIds.set(key, id);
		}
		return id;
	}

	// Follow the Days picker: a newly picked meal gets empty drafts, a meal
	// still picked keeps what was typed, an unpicked one is dropped.
	$effect(() => {
		const picked = days.flatMap((day) => day.kinds.map((kind) => ({ date: day.date, kind })));
		untrack(() => {
			seatingServices = picked.map(({ date, kind }) =>
				seatingServices.find((service) => service.date === date && service.kind === kind)
					?? newSeatingService(placeholderId(date, kind), date, kind)
			);
			pricingServices = picked.map(({ date, kind }) =>
				pricingServices.find((service) => service.date === date && service.kind === kind)
					?? newPricingService(placeholderId(date, kind), date, kind)
			);
		});
	});

	const serviceRefs = $derived(
		JSON.stringify(seatingServices.map((service) => ({ ref: service.serviceId, date: service.date, kind: service.kind })))
	);

	function seatingCountOf(serviceId: string): number {
		return seatingServices.find((service) => service.serviceId === serviceId)?.seatings.length ?? 0;
	}
	let locationEn = $state('');
	let locationFr = $state('');
	let venueNameEn = $state('');
	let venueNameFr = $state('');
	let streetAddressEn = $state('');
	let streetAddressFr = $state('');
	let districtEn = $state('');
	let districtFr = $state('');
	let cityEn = $state('');
	let cityFr = $state('');
	let postalCode = $state('');
	let countryEn = $state('');
	let countryFr = $state('');
	let collaborators = $state<Array<{talentId: string, name: string, role: string}>>([]);
	let timings = $state<Array<{label: string, time: string}>>([]);
	let curatorEn = $state('');
	let curatorFr = $state('');
	let admissionInfoEn = $state('');
	let admissionInfoFr = $state('');
	// Events are created as drafts; publish after adding sessions
	// let published = $state(false);
	let isSpotlight = $state(false);

	// Media upload state
	let coverMediaId: string | null = $state(null);
	let galleryMediaIds: string[] = $state([]);

	function handleCoverUpload(media: Media[]) {
		if (media.length > 0) {
			coverMediaId = media[0].id;
		}
	}

	function handleCoverRemove(mediaId: string) {
		if (coverMediaId === mediaId) {
			coverMediaId = null;
		}
	}

	function handleGalleryUpload(media: Media[]) {
		const newIds = media.map(m => m.id);
		galleryMediaIds = [...galleryMediaIds, ...newIds];
		// First gallery image becomes cover if no explicit cover
		if (!coverMediaId && galleryMediaIds.length > 0) {
			coverMediaId = galleryMediaIds[0];
		}
	}

	function handleGalleryRemove(mediaId: string) {
		galleryMediaIds = galleryMediaIds.filter(id => id !== mediaId);
		if (coverMediaId === mediaId) {
			// Set new cover from remaining gallery
			coverMediaId = galleryMediaIds.length > 0 ? galleryMediaIds[0] : null;
		}
	}

	function handleGalleryReorder(mediaIds: string[]) {
		galleryMediaIds = mediaIds;
	}
</script>

<svelte:head>
	<title>Nouvel Événement | Tableau de bord Admin</title>
</svelte:head>

<div class="px-4 py-8 lg:py-12">
		<div class="flex items-start gap-3 mb-8">
			<a
				href="/admin/events"
				aria-label="Retour aux événements"
				title="Retour aux événements"
				class="shrink-0 inline-flex items-center justify-center size-9 lg:size-10 -ml-2 rounded-md text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
			>
				<ArrowLeft size={20} />
			</a>
			<div>
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Créer un Nouvel Événement</h1>
				<p class="text-muted-foreground">
					Remplissez les détails pour créer un nouvel événement
				</p>
			</div>
		</div>

		<div class="sm:bg-background sm:rounded-lg sm:p-6 lg:p-8">
			<!-- Tabs: same classes the bits-ui Tabs on /admin/events/[id] end up with, so both pages look alike.
			     Hand-rolled because bits-ui unmounts inactive panels, which would drop their fields from the form. -->
			<div class="overflow-x-auto w-full mb-6">
				<div role="tablist" aria-label="Sections du formulaire" class={TAB_LIST_CLASS}>
					{#each TABS as tab, i}
						<button
							bind:this={tabEls[i]}
							type="button"
							role="tab"
							id="tab-{tab.id}"
							aria-selected={i === activeTab}
							aria-controls="panel-{tab.id}"
							data-state={i === activeTab ? 'active' : 'inactive'}
							tabindex={i === activeTab ? 0 : -1}
							onclick={() => (activeTab = i)}
							onkeydown={handleTabKeydown}
							class={TAB_TRIGGER_CLASS}
						>
							{tab.title}
						</button>
					{/each}
				</div>
			</div>

			<form method="POST" novalidate use:enhance={createEventEnhance} class="space-y-6">
				<!-- Tab 1: Essentiel -->
				<div bind:this={panelEls[0]} hidden={activeTab !== 0} role="tabpanel" id="panel-{TABS[0].id}" aria-labelledby="tab-{TABS[0].id}" class="space-y-6">
					<!-- Titles: side by side on desktop -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Title (English) -->
						<div>
							<label for="titleEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Titre (Anglais) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<Type
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="titleEn"
									name="titleEn"
									type="text"
									bind:value={titleEn}
									required
									placeholder="Summer Music Festival 2026"
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>

						<!-- Title (French) -->
						<div>
							<label for="titleFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Titre (Français) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<Type
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="titleFr"
									name="titleFr"
									type="text"
									bind:value={titleFr}
									required
									placeholder="Festival de musique d'été 2026"
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>
					</div>

					<!-- Subtitles: side by side on desktop -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Subtitle (English) -->
						<div>
							<label for="subtitleEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Sous-titre (Anglais) (Optionnel)
							</label>
							<div class="relative">
								<FileText
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="subtitleEn"
									name="subtitleEn"
									type="text"
									bind:value={subtitleEn}
									placeholder="A short tagline for the event..."
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>

						<!-- Subtitle (French) -->
						<div>
							<label for="subtitleFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Sous-titre (Français) (Optionnel)
							</label>
							<div class="relative">
								<FileText
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="subtitleFr"
									name="subtitleFr"
									type="text"
									bind:value={subtitleFr}
									placeholder="Une courte phrase accrocheuse pour l'événement..."
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>
					</div>

					<!-- Descriptions: side by side on desktop -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Description (English) -->
						<div>
							<label for="descriptionEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Description (Anglais) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<FileText
									size={18}
									class="absolute left-3 top-3 text-muted-foreground"
								/>
								<textarea
									id="descriptionEn"
									name="descriptionEn"
									bind:value={descriptionEn}
									required
									rows="5"
									placeholder="Describe your event..."
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
								></textarea>
							</div>
						</div>

						<!-- Description (French) -->
						<div>
							<label for="descriptionFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Description (Français) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<FileText
									size={18}
									class="absolute left-3 top-3 text-muted-foreground"
								/>
								<textarea
									id="descriptionFr"
									name="descriptionFr"
									bind:value={descriptionFr}
									required
									rows="5"
									placeholder="Décrivez votre événement..."
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent resize-none"
								></textarea>
							</div>
						</div>
					</div>
				</div>

				<!-- Tab 2: Lieu -->
				<div bind:this={panelEls[1]} hidden={activeTab !== 1} role="tabpanel" id="panel-{TABS[1].id}" aria-labelledby="tab-{TABS[1].id}" class="space-y-6">
					<!-- Locations: side by side on desktop -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Location (English) -->
						<div>
							<label for="locationEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Lieu (Anglais) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<MapPin
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="locationEn"
									name="locationEn"
									type="text"
									bind:value={locationEn}
									required
									placeholder="Central Park, New York"
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>

						<!-- Location (French) -->
						<div>
							<label for="locationFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Lieu (Français) <span class="text-red-500">*</span>
							</label>
							<div class="relative">
								<MapPin
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									id="locationFr"
									name="locationFr"
									type="text"
									bind:value={locationFr}
									required
									placeholder="Central Park, New York"
									class="w-full pl-10 pr-4 py-3 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent"
								/>
							</div>
						</div>
					</div>

					<!-- Venue Details -->
					<details open class="space-y-4">
						<summary class="cursor-pointer text-sm font-medium text-foreground-alt hover:text-foreground">Adresse détaillée (Optionnel)</summary>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="venueNameEn" class="block text-sm font-medium text-foreground-alt mb-2">
									Nom du Lieu (Anglais)
								</label>
								<input
									id="venueNameEn"
									name="venueNameEn"
									type="text"
									bind:value={venueNameEn}
									placeholder="e.g., Central Convention Center"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="venueNameFr" class="block text-sm font-medium text-foreground-alt mb-2">
									Nom du Lieu (Français)
								</label>
								<input
									id="venueNameFr"
									name="venueNameFr"
									type="text"
									bind:value={venueNameFr}
									placeholder="ex: Centre de Conventions Central"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="streetAddressEn" class="block text-sm font-medium text-foreground-alt mb-2">
									Adresse Rue (Anglais)
								</label>
								<input
									id="streetAddressEn"
									name="streetAddressEn"
									type="text"
									bind:value={streetAddressEn}
									placeholder="e.g., 123 Main Street"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="streetAddressFr" class="block text-sm font-medium text-foreground-alt mb-2">
									Adresse Rue (Français)
								</label>
								<input
									id="streetAddressFr"
									name="streetAddressFr"
									type="text"
									bind:value={streetAddressFr}
									placeholder="ex: 123 rue Principale"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="districtEn" class="block text-sm font-medium text-foreground-alt mb-2">
									District (Anglais)
								</label>
								<input
									id="districtEn"
									name="districtEn"
									type="text"
									bind:value={districtEn}
									placeholder="e.g., Downtown"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="districtFr" class="block text-sm font-medium text-foreground-alt mb-2">
									District (Français)
								</label>
								<input
									id="districtFr"
									name="districtFr"
									type="text"
									bind:value={districtFr}
									placeholder="ex: Centre-ville"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<label for="cityEn" class="block text-sm font-medium text-foreground-alt mb-2">
									Ville (Anglais)
								</label>
								<input
									id="cityEn"
									name="cityEn"
									type="text"
									bind:value={cityEn}
									placeholder="e.g., Tokyo"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="cityFr" class="block text-sm font-medium text-foreground-alt mb-2">
									Ville (Français)
								</label>
								<input
									id="cityFr"
									name="cityFr"
									type="text"
									bind:value={cityFr}
									placeholder="ex: Tokyo"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="postalCode" class="block text-sm font-medium text-foreground-alt mb-2">
									Code Postal
								</label>
								<input
									id="postalCode"
									name="postalCode"
									type="text"
									bind:value={postalCode}
									placeholder="e.g., 12345"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="countryEn" class="block text-sm font-medium text-foreground-alt mb-2">
									Pays (Anglais)
								</label>
								<input
									id="countryEn"
									name="countryEn"
									type="text"
									bind:value={countryEn}
									placeholder="e.g., Japan"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
							<div>
								<label for="countryFr" class="block text-sm font-medium text-foreground-alt mb-2">
									Pays (Français)
								</label>
								<input
									id="countryFr"
									name="countryFr"
									type="text"
									bind:value={countryFr}
									placeholder="ex: Japon"
									class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
								/>
							</div>
						</div>
					</details>
				</div>

				<!-- Tab 3: Dates & séances — the Seatings follow the Days and meals
				     picked just above (Venue Capacity included, as on the event page) -->
				<div bind:this={panelEls[2]} hidden={activeTab !== 2} role="tabpanel" id="panel-{TABS[2].id}" aria-labelledby="tab-{TABS[2].id}" class="space-y-8">
					<!-- Days & meals: the Event's dates are derived from its Days (ADR 0005) -->
					<DaysServicesPicker bind:this={daysPicker} bind:days idPrefix="new-event-days" />

					<input type="hidden" name="serviceRefs" value={serviceRefs} />
					<SeatingsEditor
						bind:this={seatingsEditor}
						bind:services={seatingServices}
						bind:venueCapacity
					/>
				</div>

				<!-- Tab 4: Menus & tarifs (Menus, Deposit, Refund Policy, price per meal) -->
				<div bind:this={panelEls[3]} hidden={activeTab !== 3} role="tabpanel" id="panel-{TABS[3].id}" aria-labelledby="tab-{TABS[3].id}">
					<PricingEditor
						bind:this={pricingEditor}
						bind:menus
						bind:deposit
						bind:refund
						bind:services={pricingServices}
						daysTabName="Dates & séances"
						{seatingCountOf}
					/>
				</div>

				<!-- Tab 5: Programme -->
				<div bind:this={panelEls[4]} hidden={activeTab !== 4} role="tabpanel" id="panel-{TABS[4].id}" aria-labelledby="tab-{TABS[4].id}" class="space-y-6">
					<!-- Timings -->
					<div>
						<label class="block text-sm font-medium text-foreground-alt mb-2">
							Horaires de l'Événement (Optionnel)
						</label>
						<p class="text-xs text-muted-foreground mb-3">Ajoutez des informations de programmation pour différentes sessions</p>

						<div class="space-y-2">
							{#each timings as timing, i}
								<div class="flex gap-2">
									<input
										type="text"
										bind:value={timings[i].label}
										placeholder="e.g., Opening Night"
										class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
									/>
									<input
										type="text"
										bind:value={timings[i].time}
										placeholder="e.g., 18:00 - 22:00"
										class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
									/>
									<button
										type="button"
										onclick={() => timings = timings.filter((_, idx) => idx !== i)}
										class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
									>
										Supprimer
									</button>
								</div>
							{/each}

							<button
								type="button"
								onclick={() => timings = [...timings, {label: "", time: ""}]}
								class="text-sm text-foreground-alt hover:text-foreground font-medium"
							>
								+ Ajouter un Horaire
							</button>
						</div>

						<input type="hidden" name="timings" value={JSON.stringify(timings.filter(t => t.label.trim() && t.time.trim()))} />
					</div>

					<!-- Collaborators -->
					<div>
						<label class="block text-sm font-medium text-foreground-alt mb-2">
							Collaborateurs (Optionnel)
						</label>
						<p class="text-xs text-muted-foreground mb-3">Ajoutez des talents ou partenaires collaborateurs</p>

						<div class="space-y-2">
							{#each collaborators as collab, i}
								<div class="flex gap-2 items-center">
									<select
										bind:value={collaborators[i].talentId}
										onchange={() => {
											const talent = (data.talents || []).find(t => t.id === collaborators[i].talentId);
											if (talent) collaborators[i].name = talent.firstName + ' ' + talent.lastName;
										}}
										class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
									>
										<option value="">Sélectionner un talent...</option>
										{#each (data.talents || []) as talent}
											<option value={talent.id}>{talent.firstName} {talent.lastName}</option>
										{/each}
									</select>
									<input
										type="text"
										bind:value={collaborators[i].role}
										placeholder="Rôle"
										class="flex-1 px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
									/>
									<button
										type="button"
										onclick={() => collaborators = collaborators.filter((_, idx) => idx !== i)}
										class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
									>
										Supprimer
									</button>
								</div>
							{/each}

							<button
								type="button"
								onclick={() => collaborators = [...collaborators, {talentId: "", name: "", role: ""}]}
								class="text-sm text-foreground-alt hover:text-foreground font-medium"
							>
								+ Ajouter un Collaborateur
							</button>
						</div>

						<input type="hidden" name="collaborators" value={JSON.stringify(collaborators.filter(c => c.name.trim() && c.role.trim()))} />
					</div>

					<!-- Event Details -->
					<div class="space-y-4">
						<h3 class="text-sm font-medium text-foreground-alt">Détails Supplémentaires (Optionnel)</h3>

						<div>
							<label for="curatorEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Commissaire (Anglais)
							</label>
							<input
								id="curatorEn"
								name="curatorEn"
								type="text"
								bind:value={curatorEn}
								placeholder="e.g., John Smith"
								class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
							/>
						</div>

						<div>
							<label for="curatorFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Commissaire (Français)
							</label>
							<input
								id="curatorFr"
								name="curatorFr"
								type="text"
								bind:value={curatorFr}
								placeholder="ex: Jean Smith"
								class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
							/>
						</div>

						<div>
							<label for="admissionInfoEn" class="block text-sm font-medium text-foreground-alt mb-2">
								Informations d'Admission (Anglais)
							</label>
							<input
								id="admissionInfoEn"
								name="admissionInfoEn"
								type="text"
								bind:value={admissionInfoEn}
								placeholder="e.g., Free, $25, Members Only"
								class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
							/>
						</div>

						<div>
							<label for="admissionInfoFr" class="block text-sm font-medium text-foreground-alt mb-2">
								Informations d'Admission (Français)
							</label>
							<input
								id="admissionInfoFr"
								name="admissionInfoFr"
								type="text"
								bind:value={admissionInfoFr}
								placeholder="ex: Gratuit, 25$, Membres seulement"
								class="w-full px-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm"
							/>
						</div>
					</div>
				</div>

				<!-- Tab 6: Visuels -->
				<div bind:this={panelEls[5]} hidden={activeTab !== 5} role="tabpanel" id="panel-{TABS[5].id}" aria-labelledby="tab-{TABS[5].id}" class="space-y-6">
					<!-- Cover Photo Section -->
					<div class="form-section">
						<label class="block text-sm font-medium text-foreground-alt mb-2">
							Photo de Couverture
						</label>
						<p class="text-xs text-muted-foreground mb-3">Image principale affichée dans les listes d'événements</p>
						<MediaUpload
							mode="single"
							entityType="event"
							maxSizeMB={10}
							onUpload={handleCoverUpload}
							onRemove={handleCoverRemove}
						/>
						<input type="hidden" name="coverMediaId" value={coverMediaId ?? ''} />
					</div>

					<!-- Gallery Section -->
					<div class="form-section">
						<label class="block text-sm font-medium text-foreground-alt mb-2">
							Galerie de l'Événement
						</label>
						<p class="text-xs text-muted-foreground mb-3">Jusqu'à 10 photos supplémentaires. Glissez pour réorganiser. La première image deviendra la couverture si aucune couverture explicite n'est définie.</p>
						<MediaUpload
							mode="multiple"
							maxFiles={10}
							entityType="event"
							maxSizeMB={10}
							onUpload={handleGalleryUpload}
							onReorder={handleGalleryReorder}
							onRemove={handleGalleryRemove}
						/>
						<input type="hidden" name="galleryMediaIds" value={JSON.stringify(galleryMediaIds)} />
					</div>

					<!-- Spotlight Status -->
					<div class="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
						<input
							id="isSpotlight"
							name="isSpotlight"
							type="checkbox"
							value="true"
							bind:checked={isSpotlight}
							class="w-5 h-5 text-amber-900 border-amber-300 rounded focus:ring-amber-900"
						/>
						<div>
							<label for="isSpotlight" class="block text-sm font-medium text-amber-900 cursor-pointer">
								Marquer comme Événement à la Une
							</label>
							<p class="text-xs text-amber-600">
								Les événements à la une sont mis en vedette sur le site. Un seul événement peut être à la une à la fois.
							</p>
						</div>
					</div>
				</div>

				<!-- Actions: available from every tab -->
				<div class="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-border-card">
					<a
						href="/admin/events"
						class="flex-1 px-6 py-3 bg-background border border-border-input text-foreground-alt rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium text-center"
					>
						Annuler
					</a>
					<button
						type="submit"
						name="action"
						value="create"
						disabled={submitting}
						class="flex-1 px-6 py-3 bg-foreground text-background rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 transition-colors font-medium disabled:opacity-50"
					>
						{submitting ? 'Création…' : "Créer l'Événement"}
					</button>
				</div>
			</form>
		</div>
</div>
