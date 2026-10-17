<script lang="ts">
	// The Event editor (ADR 0008, issue 036): one tabbed screen for a saved
	// Event and for « Nouvel événement », which opens it with no Event. Each
	// tab keeps its own save; on a new Event the first save of any tab
	// creates the Draft and lands on its page. All panels stay mounted (just
	// hidden) so what is typed survives switching tabs.
	import { ArrowLeft, ChevronRight, Eye } from 'lucide-svelte';
	import { cn } from '$lib/utils/design-system';
	import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';
	import { editorEventWarnings, editorPortfolioWarnings, type EventWarning } from '$lib/utils/event-warnings';
	import type { MediaAltText } from '$lib/utils/media-alt';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import { toSeatingDrafts, type DraftSeatingService } from '$lib/components/admin/SeatingsEditor.svelte';
	import type { ActionData, PageData as EventPageData } from './$types';
	import type { PageData as NewEventPageData } from '../new/$types';
	import { mergeFormFields, type EditorEvent } from './editor-forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { EDITOR_SAVED_EVENT, LeaveGuard, type EditorSavedDetail } from '$lib/utils/leave-guard';

	import Essentiel from './Essentiel.svelte';
	import Lieu from './Lieu.svelte';
	import Seatings from './Seatings.svelte';
	import Pricing from './Pricing.svelte';
	import Programme from './Programme.svelte';
	import Photos from './Photos.svelte';
	import PracticalInfo from './PracticalInfo.svelte';
	import Portfolio from './Portfolio.svelte';
	import Team from './Team.svelte';
	import Tasks from './Tasks.svelte';
	import Reservations from './Reservations.svelte';
	import PromoCodes from './PromoCodes.svelte';

	let { data, form = null }: { data: EventPageData | NewEventPageData; form?: ActionData } = $props();

	const toast = getToastContext();

	// Toasts for the operational tabs, whose forms update `form`.
	$effect(() => {
		if (form?.success) {
			toast.success('Succès', form.success || 'Modifications enregistrées');
		}
	});
	$effect(() => {
		if (form?.error) {
			toast.error('Erreur', form.error);
		}
	});

	// The route changes on the first save, so this holds for the editor's life.
	const isNew = data.event === null;
	const event = $derived(data.event as EditorEvent | null);
	// A saved Event's page data, for its operational tabs.
	const saved = $derived(data.event === null ? null : (data as EventPageData));

	const EDITOR_TABS = [
		{ id: 'essentiel', title: 'Essentiel' },
		{ id: 'lieu', title: 'Lieu' },
		{ id: 'dates-seances', title: 'Dates & séances' },
		{ id: 'tarifs', title: 'Menus & tarifs' },
		{ id: 'programme', title: 'Programme' },
		{ id: 'visuels', title: 'Visuels' },
		{ id: 'pratique', title: 'Infos pratiques' },
		{ id: 'portfolio', title: 'Portfolio' },
	];
	// What only a saved Event has: its team, tasks, Reservations and Promo Codes.
	const OPERATIONAL_TABS = [
		{ id: 'team', title: 'Team' },
		{ id: 'tasks', title: 'Tasks' },
		{ id: 'reservations', title: 'Réservations' },
		{ id: 'promotions', title: 'Promotions' },
	];
	const tabs = isNew ? EDITOR_TABS : [...EDITOR_TABS, ...OPERATIONAL_TABS];

	// Base classes of bits-components/TabsList + TabsTrigger, with the editor's overrides.
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

	// Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern)
	function handleTabKeydown(keyEvent: KeyboardEvent) {
		const last = tabs.length - 1;
		const target =
			keyEvent.key === 'ArrowRight' ? (activeTab === last ? 0 : activeTab + 1)
			: keyEvent.key === 'ArrowLeft' ? (activeTab === 0 ? last : activeTab - 1)
			: keyEvent.key === 'Home' ? 0
			: keyEvent.key === 'End' ? last
			: null;
		if (target === null) return;
		keyEvent.preventDefault();
		activeTab = target;
		tabEls[target]?.focus();
	}

	const panelIndex = (id: string) => tabs.findIndex((tab) => tab.id === id);

	// The Time Zone picked in Lieu: a new Event's Seatings are typed on it
	// before anything is saved. A saved Event's Seatings follow its saved zone.
	let timeZone = $state(data.event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE);

	// « Dates & séances » meals, followed live by a new Event's prices: its
	// meals are not saved yet, so « Menus & tarifs » prices the ones picked.
	let seatingServices: DraftSeatingService[] = $state(toSeatingDrafts(data.schedule ?? []));
	function seatingCountOf(serviceId: string): number {
		return seatingServices.find((service) => service.serviceId === serviceId)?.seatings.length ?? 0;
	}

	// On a new Event, the first save of either schedule tab carries both
	// (Days, Seatings and prices are saved with it), with the Lieu zone.
	// The admin layout mounts the page twice (mobile and desktop), so the
	// other form is looked up within this editor only.
	let rootEl: HTMLElement | undefined = $state();
	function extendWith(otherForm: 'seatings' | 'pricing') {
		return (formData: FormData) => {
			mergeFormFields(formData, rootEl?.querySelector<HTMLFormElement>(`form[data-editor-form="${otherForm}"]`) ?? null);
			formData.set('timeZone', timeZone);
		};
	}

	// « À vérifier » (issue 038, ADR 0008): what is missing for publishing,
	// read off the saved Event's page data. A new Event has nothing saved
	// yet, so there is nothing to check; the list stays visible once the
	// Event is published.
	// Alt texts are saved per image as soon as they are typed in « Visuels »
	// (issue 043), without reloading the page data: the list follows them.
	let altOverrides: Record<string, MediaAltText> = $state({});
	function handleAltChange(mediaId: string, alt: MediaAltText) {
		altOverrides[mediaId] = alt;
	}
	const publishingWarnings = $derived(
		data.event !== null && data.schedule && data.pricing
			? editorEventWarnings(data.event, data.schedule, data.pricing, altOverrides)
			: ([] as EventWarning[])
	);
	// The Portfolio list (issue 045): the Recap, Event Photos, their cover
	// and alt text. Always shown in « Portfolio »; joins « À vérifier » once
	// the Event is in the Portfolio. Warnings only, like publishing's.
	const portfolioWarnings = $derived(
		data.event !== null ? editorPortfolioWarnings(data.event, altOverrides) : ([] as EventWarning[])
	);
	const warnings = $derived(
		event?.isPortfolio ? [...publishingWarnings, ...portfolioWarnings] : publishingWarnings
	);

	// Unsaved-changes guard (issue 037): leaving with an edited tab asks
	// first — an in-page dialog for in-app moves, the browser's own prompt
	// for closing or reloading. Switching tabs is not leaving. Only the
	// Event's own tabs are guarded, not the operational ones.
	const guard = new LeaveGuard();
	let leaveDialogOpen = $state(false);
	let pendingLeave: (() => void) | null = null;
	let leaving = false;

	function guardedForm(target: EventTarget | null): HTMLFormElement | null {
		const form = target instanceof Element ? target.closest('form') : null;
		return form?.closest('[data-leave-guard]') && rootEl?.contains(form) ? form : null;
	}
	// The first interaction with a form, before it changes anything.
	function touchForm(domEvent: Event) {
		const form = guardedForm(domEvent.target);
		if (form) guard.touch(form);
	}

	$effect(() => {
		const root = rootEl;
		if (!root) return;
		const onSaved = (domEvent: Event) => {
			const form = domEvent.target;
			if ((domEvent as CustomEvent<EditorSavedDetail>).detail?.leaving) {
				// A new Event's first save moves on to its Draft's page.
				guard.clear();
				leaving = true;
			} else if (form instanceof HTMLFormElement) {
				guard.saved(form);
			}
		};
		root.addEventListener(EDITOR_SAVED_EVENT, onSaved);
		return () => root.removeEventListener(EDITOR_SAVED_EVENT, onSaved);
	});

	beforeNavigate((navigation) => {
		if (leaving || !guard.isDirty()) return;
		navigation.cancel();
		// Closing, reloading or leaving the site: the browser asks.
		if (navigation.type === 'leave' || !navigation.to) return;
		const url = navigation.to.url;
		const { type, delta, willUnload } = navigation;
		pendingLeave = () => {
			leaving = true;
			if (type === 'popstate' && delta) history.go(delta);
			else if (willUnload) location.assign(url);
			else void goto(url).finally(() => (leaving = false));
		};
		leaveDialogOpen = true;
	});

	function stay() {
		pendingLeave = null;
		leaveDialogOpen = false;
	}
	function leave() {
		const proceed = pendingLeave;
		pendingLeave = null;
		leaveDialogOpen = false;
		proceed?.();
	}

	const headerTitle = $derived(
		event ? event.titleFr || event.titleEn || 'Sans titre' : 'Nouvel événement'
	);
</script>

<svelte:head>
	<title>{headerTitle} | Admin</title>
</svelte:head>

<div
	bind:this={rootEl}
	onfocusincapture={touchForm}
	onpointerdowncapture={touchForm}
	onkeydowncapture={touchForm}
	ondragentercapture={touchForm}
	oninputcapture={touchForm}
	onchangecapture={touchForm}
	class="container mx-auto px-4 py-8 lg:py-12"
>
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
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">{headerTitle}</h1>
			<p class="text-muted-foreground flex items-center gap-2 flex-wrap">
				{#if event}
					<span>Gérer cet événement</span>
					<span aria-hidden="true">·</span>
					<!-- Aperçu (issue 033) : ouvre la page publique — un brouillon
					     n'y est visible que pour un Admin, avec la réservation coupée. -->
					<a
						href="/events/{event.id}"
						target="_blank"
						rel="noopener"
						class="inline-flex items-center gap-1 hover:text-foreground transition-colors"
						title="Voir la page publique"
					>
						<Eye size={14} />
						Aperçu
					</a>
				{:else}
					<span>Rien n’est obligatoire : le premier enregistrement d’un onglet crée le brouillon.</span>
				{/if}
			</p>
		</div>
	</div>

	{#if form?.error}
		<div class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
			<p class="text-sm font-medium">{form.error}</p>
		</div>
	{/if}

	{#if form?.success}
		<div class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
			<p class="text-sm font-medium">{form.success}</p>
		</div>
	{/if}

	{#if warnings.length > 0}
		<!-- « À vérifier » (issue 038): what is missing for publishing. Each
		     item opens the tab that fixes it; publishing is never refused
		     (ADR 0008), and the list stays while the Event is published. -->
		<section class="mb-6 bg-background rounded-lg border border-border-card p-6" aria-label="À vérifier">
			<h2 class="text-base font-semibold text-foreground mb-1">À vérifier</h2>
			<p class="text-sm text-muted-foreground mb-4">
				{#if event && event.visibility !== 'draft'}
				Cet événement est publié ; ces points lui manquent toujours.
			{:else}
				Rien n’oblige à les compléter avant de publier : la décision vous reste.
				{/if}
				Chaque point ouvre l’onglet qui le corrige.
			</p>
			<ul class="divide-y divide-border-card">
				{#each warnings as warning, i (i)}
					<li>
						<button
							type="button"
							onclick={() => (activeTab = panelIndex(warning.tab))}
							class="group w-full flex items-center justify-between gap-4 py-2.5 text-left text-sm text-foreground-alt hover:text-foreground transition-colors"
						>
							<span>{warning.message}</span>
							<span class="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground whitespace-nowrap">
								{tabs.find((tab) => tab.id === warning.tab)?.title}
								<ChevronRight size={14} aria-hidden="true" />
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Hand-rolled tabs: bits-ui unmounts inactive panels, which would drop
	     what was typed in them. -->
	<div class="overflow-x-auto w-full mb-6">
		<div role="tablist" aria-label="Sections de l’événement" class={TAB_LIST_CLASS}>
			{#each tabs as tab, i (tab.id)}
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

	{#snippet panel(id: string, content: import('svelte').Snippet, guarded = true)}
		<div
			data-leave-guard={guarded ? '' : undefined}
			hidden={activeTab !== panelIndex(id)}
			role="tabpanel"
			id="panel-{id}"
			aria-labelledby="tab-{id}"
			class="p-6"
		>
			{@render content()}
		</div>
	{/snippet}

	{#snippet essentiel()}
		<Essentiel {event} lastSeatingStart={saved?.lastSeatingStart ?? null} warnings={publishingWarnings} />
	{/snippet}
	{#snippet lieu()}
		<Lieu {event} zones={data.timeZones ?? []} locked={data.timeZoneLocked ?? false} bind:timeZone />
	{/snippet}
	{#snippet seatings()}
		<Seatings
			{data}
			{isNew}
			timeZone={isNew ? timeZone : data.event?.timeZone}
			bind:services={seatingServices}
			extend={isNew ? extendWith('pricing') : undefined}
		/>
	{/snippet}
	{#snippet pricing()}
		<Pricing
			{data}
			follow={isNew ? seatingServices : undefined}
			seatingCountOf={isNew ? seatingCountOf : undefined}
			extend={isNew ? extendWith('seatings') : undefined}
		/>
	{/snippet}
	{#snippet programme()}<Programme {event} talents={data.talents ?? []} />{/snippet}
	{#snippet visuels()}<Photos event={data.event} onAltChange={handleAltChange} />{/snippet}
	{#snippet pratique()}
		<PracticalInfo {event} />
	{/snippet}
	{#snippet portfolio()}
		<Portfolio {event} warnings={portfolioWarnings} onAltChange={handleAltChange} />
	{/snippet}

	{@render panel('essentiel', essentiel)}
	{@render panel('lieu', lieu)}
	{@render panel('dates-seances', seatings)}
	{@render panel('tarifs', pricing)}
	{@render panel('programme', programme)}
	{@render panel('visuels', visuels)}
	{@render panel('pratique', pratique)}
	{@render panel('portfolio', portfolio)}

	{#if saved}
		{@const savedData = saved}
		{#snippet team()}<Team data={savedData} {form} />{/snippet}
		{#snippet tasks()}<Tasks data={savedData} {form} />{/snippet}
		{#snippet reservations()}<Reservations data={savedData} />{/snippet}
		{#snippet promotions()}<PromoCodes data={savedData} {form} />{/snippet}
		{@render panel('team', team, false)}
		{@render panel('tasks', tasks, false)}
		{@render panel('reservations', reservations, false)}
		{@render panel('promotions', promotions, false)}
	{/if}
</div>

<Modal
	bind:isOpen={leaveDialogOpen}
	title="Quitter sans enregistrer ?"
	description="Les modifications non enregistrées de cet événement seront perdues."
>
	<div class="flex justify-end gap-3 mt-4">
		<button
			type="button"
			onclick={stay}
			class="px-4 py-2 text-sm font-medium text-foreground-alt bg-background border border-border-card rounded-lg hover:bg-surface transition-colors"
		>
			Rester
		</button>
		<button
			type="button"
			onclick={leave}
			class="px-4 py-2 text-sm font-medium text-background bg-foreground rounded-lg hover:opacity-90 transition-colors"
		>
			Quitter
		</button>
	</div>
</Modal>
