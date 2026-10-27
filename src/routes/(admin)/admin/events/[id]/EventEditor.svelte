<script lang="ts">
	// The Event editor (ADR 0008, issue 036): one tabbed screen, always on a
	// saved Event — « Nouvel événement » creates the Draft first (ADR 0010).
	// Each tab keeps its own save, made through the save controller (issue
	// 016). All panels stay mounted (just hidden) so what is typed survives
	// switching tabs.
	import { ArrowLeft, ChevronRight, Copy, Eye } from 'lucide-svelte';
	import { cn } from '$lib/utils/design-system';
	import { editorEventWarnings, editorPortfolioWarnings, EVENT_EDITOR_TABS, type EventWarning } from '$lib/utils/event-warnings';
	import type { MediaAltText } from '$lib/utils/media-alt';
	import { getToastContext } from '$lib/components/toast/state.svelte';
	import type { ActionData, PageData } from './$types';
	import type { EditorEvent } from './editor-forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import DuplicateEventDialog from '$lib/components/admin/DuplicateEventDialog.svelte';
	import { servedKinds } from '$lib/utils/schedule-pattern';
	import { onMount, tick } from 'svelte';
	import { EditorSaveController, formatSavedAgo, type EditorSaveSnapshot } from '$lib/utils/editor-save';
	import { formTab, type FormTab } from '$lib/utils/editor-save-form';
	import { setEnglishAuto } from '$lib/components/admin/EnglishVersion.svelte';

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

	let { data, form = null }: { data: PageData; form?: ActionData } = $props();

	const toast = getToastContext();
	// Whether each tab's « Version anglaise » is generated or typed by hand.
	setEnglishAuto(() => data.englishAuto ?? false);

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

	const event = $derived(data.event as EditorEvent);

	// The eight Event tabs, shared with Draft completeness (issue 013).
	const EDITOR_TABS = EVENT_EDITOR_TABS;
	// Its team, tasks, Reservations and Promo Codes.
	const OPERATIONAL_TABS = [
		{ id: 'team', title: 'Team' },
		{ id: 'tasks', title: 'Tasks' },
		{ id: 'reservations', title: 'Réservations' },
		{ id: 'promotions', title: 'Promotions' },
	];
	const tabs = [...EDITOR_TABS, ...OPERATIONAL_TABS];

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

	// The Time Zone picked in Lieu; the Seatings follow the saved zone.
	let timeZone = $state(data.event.timeZone);

	// The admin layout mounts the page twice (mobile and desktop), so forms
	// are looked up within this editor only.
	let rootEl: HTMLElement | undefined = $state();

	// « À vérifier » (issue 038, ADR 0008): what is missing for publishing,
	// read off the saved Event's page data; the list stays visible once the
	// Event is published.
	// Alt texts are saved per image as soon as they are typed in « Visuels »
	// (issue 043), without reloading the page data: the list follows them.
	let altOverrides: Record<string, MediaAltText> = $state({});
	function handleAltChange(mediaId: string, alt: MediaAltText) {
		altOverrides[mediaId] = alt;
	}
	const publishingWarnings = $derived(
		data.schedule && data.pricing
			? editorEventWarnings(data.event, data.schedule, data.pricing, altOverrides)
			: ([] as EventWarning[])
	);
	// The Portfolio list (issue 045): the Recap, Event Photos, their cover
	// and alt text. Always shown in « Portfolio »; joins « À vérifier » once
	// the Event is in the Portfolio. Warnings only, like publishing's.
	const portfolioWarnings = $derived(editorPortfolioWarnings(data.event, altOverrides));
	const warnings = $derived(
		event.isPortfolio ? [...publishingWarnings, ...portfolioWarnings] : publishingWarnings
	);

	// Save controller (issue 016, ADR 0010): each form of the Event's own
	// tabs is a unit it saves — the operational tabs keep their own actions.
	// It gives the header its save status, the tab labels their « modifié »
	// mark and the leave guard its answer. Autosave stays off for now: the
	// save buttons submit through it.
	const modeOf = (visibility: string) => (visibility === 'draft' ? 'draft' : 'published');
	const saves = new EditorSaveController({ autosave: false });
	let saveState: EditorSaveSnapshot = $state(saves.snapshot());
	// A published Event holds its edits; the mode follows its Visibility.
	$effect(() => saves.setMode(modeOf(event.visibility)));
	$effect(() => {
		const unsubscribe = saves.subscribe((snapshot) => (saveState = snapshot));
		return () => void unsubscribe();
	});

	const formUnits = new Map<HTMLFormElement, { id: string; tab: FormTab }>();
	// A tab with several forms (« Portfolio ») has a unit per form.
	const tabOfUnit = (unitId: string) => unitId.split(':')[0];

	onMount(() => {
		const root = rootEl;
		if (!root) return;
		// In tab order: « Dates & séances » saves before « Menus & tarifs ».
		for (const { id } of EDITOR_TABS) {
			// A form marked `data-editor-skip` (« Publication », ADR 0010) saves
			// on its own: never a unit, so its changes and its submit pass by.
			const forms = [...(root.querySelector(`[data-editor-tab="${id}"]`)?.querySelectorAll<HTMLFormElement>('form:not([data-editor-skip])') ?? [])];
			forms.forEach((form, i) => {
				const unitId = forms.length > 1 ? `${id}:${form.dataset.editorForm ?? i}` : id;
				const tab = formTab(form);
				formUnits.set(form, { id: unitId, tab });
				saves.register(unitId, tab);
			});
		}
		// Changes no input event reports (an upload landing) show in the DOM.
		let frame = 0;
		const observer = new MutationObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => saves.refresh());
		});
		observer.observe(root, { childList: true, subtree: true });
		const clock = setInterval(() => (now = Date.now()), 30_000);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			clearInterval(clock);
		};
	});

	function unitOf(target: EventTarget | null) {
		const form = target instanceof Element ? target.closest('form') : null;
		return form ? formUnits.get(form) : undefined;
	}
	// The first interaction with a form, before it changes anything.
	function touchForm(domEvent: Event) {
		const unit = unitOf(domEvent.target);
		if (unit) saves.touch(unit.id);
	}
	// Once the change has reached the form (bound values, hidden fields).
	function changeForm(domEvent: Event) {
		const unit = unitOf(domEvent.target);
		if (unit) void tick().then(() => saves.changed(unit.id));
	}
	function blurForm(domEvent: Event) {
		const unit = unitOf(domEvent.target);
		if (unit) saves.blurred(unit.id);
	}
	// A save button posts through the controller, which never runs two
	// saves of a form at once. Its own post goes through untouched.
	function submitForm(submitEvent: SubmitEvent) {
		const unit = unitOf(submitEvent.target);
		if (!unit || unit.tab.owns(submitEvent)) return;
		submitEvent.preventDefault();
		submitEvent.stopPropagation();
		saves.touch(unit.id);
		unit.tab.setSubmitter(submitEvent.submitter);
		// Out of this submit event: the browser ignores a nested one.
		setTimeout(() => void saves.save(unit.id));
	}

	const UNSAVED_STATES = new Set(['dirty', 'saving', 'invalid', 'failed']);
	function tabModified(tabId: string): boolean {
		return Object.entries(saveState.tabs).some(([unitId, state]) => tabOfUnit(unitId) === tabId && UNSAVED_STATES.has(state));
	}

	// The header's one save status; « il y a 2 min » follows the clock.
	let now = $state(Date.now());
	const unsavedLabel = $derived(
		saveState.dirtyCount > 1 ? `${saveState.dirtyCount} onglets modifiés, non enregistrés` : 'Modifications non enregistrées'
	);
	const saveAnnouncement = $derived(
		saveState.status === 'saving' ? 'Enregistrement…'
		: saveState.status === 'failed' ? 'Échec de l’enregistrement'
		: saveState.status === 'invalid' ? 'Non enregistré — à corriger'
		: saveState.status === 'dirty' ? unsavedLabel
		: saveState.status === 'saved' ? 'Enregistré'
		: ''
	);

	// Unsaved-changes guard (issue 037): leaving with an edited tab asks
	// first — an in-page dialog for in-app moves, the browser's own prompt
	// for closing or reloading. Switching tabs is not leaving. Only the
	// Event's own tabs are guarded, not the operational ones.
	let leaveDialogOpen = $state(false);
	let pendingLeave: (() => void) | null = null;
	let leaving = false;

	beforeNavigate((navigation) => {
		if (leaving || !saves.isDirty()) return;
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

	// « Dupliquer » (issue 046): the copy's Days are asked first, each
	// pre-ticked with the meals this Event serves.
	let duplicateDialogOpen = $state(false);
	const duplicateKinds = $derived(servedKinds(data.schedule ?? []));

	const headerTitle = $derived(event.titleFr || event.titleEn || 'Sans titre');
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
	oninputcapture={(domEvent) => (touchForm(domEvent), changeForm(domEvent))}
	onchangecapture={(domEvent) => (touchForm(domEvent), changeForm(domEvent))}
	onclickcapture={changeForm}
	ondropcapture={changeForm}
	onfocusoutcapture={blurForm}
	onsubmitcapture={submitForm}
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
				<span aria-hidden="true">·</span>
				<button
					type="button"
					onclick={() => (duplicateDialogOpen = true)}
					class="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
					title="Créer une copie de cet événement sur d’autres jours"
				>
					<Copy size={14} />
					Dupliquer
				</button>
				<!-- The save status (issue 016). Screen readers hear each change
				     of state once, not every tick of « il y a … ». -->
				{#if saveState.status === 'saving'}
					<span aria-hidden="true">·</span>
					<span aria-hidden="true">Enregistrement…</span>
				{:else if saveState.status === 'failed'}
					<span aria-hidden="true">·</span>
					<span class="text-red-700">
						<span aria-hidden="true">Échec —</span>
						<button
							type="button"
							onclick={() => void saves.retry()}
							class="underline underline-offset-2 hover:text-red-900 transition-colors cursor-pointer"
						>
							Réessayer
						</button>
					</span>
				{:else if saveState.status === 'invalid'}
					<span aria-hidden="true">·</span>
					<span aria-hidden="true" class="text-red-700">Non enregistré — à corriger</span>
				{:else if saveState.status === 'dirty'}
					<span aria-hidden="true">·</span>
					<span aria-hidden="true">{unsavedLabel}</span>
				{:else if saveState.lastSavedAt !== null}
					<span aria-hidden="true">·</span>
					<span>Enregistré {formatSavedAgo(saveState.lastSavedAt, Math.max(now, saveState.lastSavedAt))}</span>
				{/if}
				<span role="status" class="sr-only">{saveAnnouncement}</span>
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
				{#if event.visibility !== 'draft'}
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
					{#if tabModified(tab.id)}
						<!-- Unsaved changes (issue 016): a shape, not only a colour, and
						     part of the tab's name for screen readers. -->
						<span aria-hidden="true" class="ml-1.5 inline-block size-1.5 rounded-full bg-current" title="Modifications non enregistrées"></span>
						<span class="sr-only">(modifications non enregistrées)</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	{#snippet panel(id: string, content: import('svelte').Snippet, guarded = true)}
		<div
			data-editor-tab={guarded ? id : undefined}
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
		<Essentiel {event} lastSeatingStart={data.lastSeatingStart ?? null} warnings={publishingWarnings} />
	{/snippet}
	{#snippet lieu()}
		<Lieu {event} zones={data.timeZones ?? []} locked={data.timeZoneLocked ?? false} bind:timeZone />
	{/snippet}
	{#snippet seatings()}
		<Seatings {data} timeZone={data.event.timeZone} />
	{/snippet}
	{#snippet pricing()}
		<Pricing {data} />
	{/snippet}
	{#snippet programme()}<Programme {event} talents={data.talents ?? []} />{/snippet}
	{#snippet visuels()}<Photos event={data.event} onAltChange={handleAltChange} />{/snippet}
	{#snippet pratique()}
		<PracticalInfo {event} />
	{/snippet}
	{#snippet portfolio()}
		<Portfolio {event} lastSeatingStart={data.lastSeatingStart ?? null} warnings={portfolioWarnings} onAltChange={handleAltChange} />
	{/snippet}

	{@render panel('essentiel', essentiel)}
	{@render panel('lieu', lieu)}
	{@render panel('dates-seances', seatings)}
	{@render panel('tarifs', pricing)}
	{@render panel('programme', programme)}
	{@render panel('visuels', visuels)}
	{@render panel('pratique', pratique)}
	{@render panel('portfolio', portfolio)}

	{#snippet team()}<Team {data} {form} />{/snippet}
	{#snippet tasks()}<Tasks {data} {form} />{/snippet}
	{#snippet reservations()}<Reservations {data} />{/snippet}
	{#snippet promotions()}<PromoCodes {data} {form} />{/snippet}
	{@render panel('team', team, false)}
	{@render panel('tasks', tasks, false)}
	{@render panel('reservations', reservations, false)}
	{@render panel('promotions', promotions, false)}
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

<DuplicateEventDialog
	bind:isOpen={duplicateDialogOpen}
	eventId={event.id}
	eventTitle={headerTitle}
	servedKinds={duplicateKinds}
	timeZone={event.timeZone}
/>
