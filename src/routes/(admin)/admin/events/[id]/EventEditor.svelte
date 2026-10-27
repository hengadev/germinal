<script module lang="ts">
	// Leaving the editor of an empty Draft deletes it (issue 015): the
	// beacon goes out once per visit. The admin layout mounts the page
	// twice, and coming back to the editor arms it again.
	const emptyDraftLeaveSent = new Set<string>();
</script>

<script lang="ts">
	// The Event editor (ADR 0008, issue 036): one tabbed screen, always on a
	// saved Event — « Nouvel événement » creates the Draft first (ADR 0010).
	// Each tab saves through the save controller (issue 016): a Draft's by
	// itself, a published Event's all at once, on confirmation (issue 020).
	// All panels stay mounted (just hidden) so what is typed survives
	// switching tabs.
	import { ArrowLeft, ChevronRight, Copy, Eye } from 'lucide-svelte';
	import { cn } from '$lib/utils/design-system';
	import { eventCompleteness, EVENT_EDITOR_TABS, type EventWarning } from '$lib/utils/event-warnings';
	import { liveEditorWarnings, type UnsavedEditorValues } from '$lib/utils/event-warnings-live';
	import type { MediaAltText } from '$lib/utils/media-alt';
	import { getToastContext, setQuietableToastContext } from '$lib/components/toast/state.svelte';
	import type { ActionData, PageData } from './$types';
	import { finishSaveBatch, startSaveBatch, type EditorEvent } from './editor-forms';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import DuplicateEventDialog from '$lib/components/admin/DuplicateEventDialog.svelte';
	import { servedKinds } from '$lib/utils/schedule-pattern';
	import { onMount, tick } from 'svelte';
	import { EditorSaveController, formatSavedAgo, type EditorSaveSnapshot } from '$lib/utils/editor-save';
	import { formTab, type FormTab } from '$lib/utils/editor-save-form';
	import { modifiedTabs, modifiedTabsLabel, saveAllReport, saveAllToast, tabOfUnit, type UnsavedTab } from '$lib/utils/editor-held';
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
	// The tabs' own toasts, quieted while a published Event's held edits
	// are saved all at once: that save is reported in one toast (issue 020).
	let savingAll = $state(false);
	setQuietableToastContext(() => savingAll);
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

	// « À vérifier » (issue 038, ADR 0008): what is missing for publishing;
	// the list stays visible once the Event is published. It follows what is
	// typed (issue 021, ADR 0010): the saved page data with each tab's
	// current values laid over it, read live off the tabs — so a tab back to
	// its saved values (held edits discarded) brings its items back.
	// Alt texts are saved per image as soon as they are typed in « Visuels »
	// (issue 043), without reloading the page data: the list follows them.
	let altOverrides: Record<string, MediaAltText> = $state({});
	function handleAltChange(mediaId: string, alt: MediaAltText) {
		altOverrides[mediaId] = alt;
	}
	let essentielTab: ReturnType<typeof Essentiel> | undefined = $state();
	let lieuTab: ReturnType<typeof Lieu> | undefined = $state();
	let seatingsTab: ReturnType<typeof Seatings> | undefined = $state();
	let pricingTab: ReturnType<typeof Pricing> | undefined = $state();
	let visualsTab: ReturnType<typeof Photos> | undefined = $state();
	let portfolioTab: ReturnType<typeof Portfolio> | undefined = $state();
	let programmeTab: ReturnType<typeof Programme> | undefined = $state();
	let practicalTab: ReturnType<typeof PracticalInfo> | undefined = $state();
	const unsavedValues: UnsavedEditorValues = $derived({
		essentiel: essentielTab?.warningValues(),
		lieu: lieuTab?.warningValues(),
		seatings: seatingsTab?.warningValues(),
		pricing: pricingTab?.warningValues(),
		visuels: visualsTab?.warningValues(),
		portfolio: portfolioTab?.warningValues(),
	});
	const liveWarnings = $derived(
		liveEditorWarnings(
			{ event: data.event, schedule: data.schedule ?? [], pricing: data.pricing ?? { services: [] } },
			unsavedValues,
			altOverrides
		)
	);
	const publishingWarnings = $derived(
		data.schedule && data.pricing ? liveWarnings.publishing : ([] as EventWarning[])
	);
	// The Portfolio list (issue 045): the Recap, Event Photos, their cover
	// and alt text. Always shown in « Portfolio »; joins « À vérifier » once
	// the Event is in the Portfolio. Warnings only, like publishing's.
	const portfolioWarnings = $derived(liveWarnings.portfolio);
	const warnings = $derived(
		event.isPortfolio ? [...publishingWarnings, ...portfolioWarnings] : publishingWarnings
	);
	// What is missing, per tab (issue 013's grouping): each tab label marks
	// its own (issue 021) — Portfolio's only for a Portfolio Event, as above.
	const missingByTab = $derived(
		new Map(eventCompleteness(warnings, { isPortfolio: event.isPortfolio === true }).tabs.map((tab) => [tab.tab as string, tab.warnings.length]))
	);

	// Save controller (issue 016, ADR 0010): each form of the Event's own
	// tabs is a unit it saves — the operational tabs keep their own actions.
	// It gives the header its save status, the tab labels their « modifié »
	// mark and the leave guard its answer. On a Draft, every tab saves
	// itself (issues 018, 019) and loses its save button — Seatings and
	// pricing as whole tabs, once valid, pricing after Seatings. A
	// published Event holds every edit: no save buttons, one bar to save
	// them all or discard them (issue 020).
	const modeOf = (visibility: string) => (visibility === 'draft' ? 'draft' : 'published');
	const AUTOSAVED_TABS: ReadonlySet<string> = new Set(['essentiel', 'lieu', 'dates-seances', 'tarifs', 'programme', 'visuels', 'pratique', 'portfolio']);
	// Pricing refers to Services « Dates & séances » saves: its save waits.
	const SAVED_AFTER: Record<string, string[]> = { tarifs: ['dates-seances'] };
	const autosaved = (tabId: string) => modeOf(event.visibility) === 'draft' && AUTOSAVED_TABS.has(tabId);
	const saves = new EditorSaveController();
	let saveState: EditorSaveSnapshot = $state(saves.snapshot());
	// A published Event holds its edits; the mode follows its Visibility.
	$effect(() => saves.setMode(modeOf(event.visibility)));
	$effect(() => {
		const unsubscribe = saves.subscribe((snapshot) => (saveState = snapshot));
		return () => void unsubscribe();
	});

	// Read off the Visibility, not the controller, so the page renders held
	// (no save buttons) from the start.
	const held = $derived(modeOf(event.visibility) === 'published');

	const formUnits = new Map<HTMLFormElement, { id: string; tab: FormTab }>();
	// Putting each unit back as saved (« Annuler », issue 020). A tab with
	// several forms (« Portfolio ») has a unit per form.
	const restorers: Record<string, () => void> = {
		essentiel: () => essentielTab?.restore(),
		lieu: () => lieuTab?.restore(),
		'dates-seances': () => seatingsTab?.restore(),
		tarifs: () => pricingTab?.restore(),
		programme: () => programmeTab?.restore(),
		visuels: () => visualsTab?.restore(),
		pratique: () => practicalTab?.restore(),
		'portfolio:recap': () => portfolioTab?.restoreRecap(),
		'portfolio:event-photos': () => portfolioTab?.restorePhotos(),
	};

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
				saves.register(
					unitId,
					{ serialize: tab.serialize, submit: tab.submit, restore: () => restorers[unitId]?.() },
					{ autosave: AUTOSAVED_TABS.has(id), after: SAVED_AFTER[id] }
				);
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
		// Hiding or closing the page saves what waits for its idle time.
		const flushHidden = () => document.visibilityState === 'hidden' && saves.flush();
		document.addEventListener('visibilitychange', flushHidden);
		// Closing or reloading the page leaves too: a beacon goes out once
		// nothing is still being saved — an in-flight save may not have
		// landed, and the sweep job catches whatever a lost beacon leaves.
		// In-app moves are handled in `beforeNavigate`, which waits for the
		// deletion so the page behind never shows the empty Draft.
		emptyDraftLeaveSent.delete(event.id);
		const pageLeaving = () => {
			if (!saves.isDirty()) sendLeaveBeacon();
		};
		document.addEventListener('pagehide', pageLeaving);
		return () => {
			document.removeEventListener('pagehide', pageLeaving);
			document.removeEventListener('visibilitychange', flushHidden);
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
		// A published Event saves only through the bar, once confirmed
		// (issue 020): Enter in a field saves nothing.
		if (held) return;
		saves.touch(unit.id);
		unit.tab.setSubmitter(submitEvent.submitter);
		// Out of this submit event: the browser ignores a nested one.
		setTimeout(() => void saves.save(unit.id));
	}

	const UNSAVED_STATES = new Set(['dirty', 'saving', 'invalid', 'failed']);
	function tabModified(tabId: string): boolean {
		return Object.entries(saveState.tabs).some(([unitId, state]) => tabOfUnit(unitId) === tabId && UNSAVED_STATES.has(state));
	}

	// A published Event's held edits (issue 020): a bar counts the modified
	// tabs; « Enregistrer » asks first, then saves them all in tab order
	// (« Dates & séances » before « Menus & tarifs »), reloads the page data
	// once and reports in one toast; « Annuler » puts them back as saved.
	const heldTabs = $derived(held ? modifiedTabs(saveState.tabs, EDITOR_TABS) : []);
	let confirmSaveOpen = $state(false);
	let discarding = $state(false);
	// Tabs the last save of them all left unsaved, with why, while they
	// still hold their edits.
	let unsavedAfterSave: UnsavedTab[] = $state([]);
	const stillUnsaved = $derived(unsavedAfterSave.filter((tab) => heldTabs.some((heldTab) => heldTab.id === tab.id)));
	let saveAllButton: HTMLButtonElement | undefined = $state();
	// Closing the dialog without saving gives the focus back to the bar.
	let confirmWasOpen = false;
	$effect(() => {
		if (confirmSaveOpen) {
			confirmWasOpen = true;
			return;
		}
		if (confirmWasOpen && !savingAll) saveAllButton?.focus();
		confirmWasOpen = false;
	});

	function askSaveAll() {
		if (savingAll || discarding) return;
		confirmSaveOpen = true;
	}

	async function saveAllHeld() {
		const root = rootEl;
		if (!root || savingAll) return;
		savingAll = true;
		confirmSaveOpen = false;
		startSaveBatch(root);
		let results: Awaited<ReturnType<typeof saves.saveAll>> = [];
		try {
			results = await saves.saveAll();
		} finally {
			await finishSaveBatch(root, results.some((result) => result.outcome.ok));
			savingAll = false;
		}
		const report = saveAllReport(results, EDITOR_TABS);
		unsavedAfterSave = report.unsaved;
		const summary = saveAllToast(report);
		if (summary.level === 'success') toast.success(summary.title, summary.message);
		else toast.error(summary.title, summary.message);
	}

	async function discardHeld() {
		if (savingAll || discarding) return;
		discarding = true;
		try {
			// Uploads and photo deletions are stored at once: what is saved
			// is what the server has now.
			await invalidateAll();
			saves.discardAll();
			unsavedAfterSave = [];
		} finally {
			discarding = false;
		}
	}

	// The header's one save status; « il y a 2 min » follows the clock.
	let now = $state(Date.now());
	const unsavedLabel = $derived(
		saveState.dirtyCount > 1 ? `${saveState.dirtyCount} onglets modifiés, non enregistrés` : 'Modifications non enregistrées'
	);
	// A published Event's bar announces its own count (issue 020).
	const saveAnnouncement = $derived(
		saveState.status === 'saving' ? 'Enregistrement…'
		: saveState.status === 'failed' ? 'Échec de l’enregistrement'
		: saveState.status === 'invalid' ? 'Non enregistré — à corriger'
		: saveState.status === 'dirty' ? (held ? '' : unsavedLabel)
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

	// Leaving an empty Draft deletes it (issue 015, ADR 0010): best
	// effort, the server alone deciding emptiness — a Draft with anything
	// saved in it, and any non-Draft Event, is never deleted. The beacon
	// goes out once per visit (the admin layout mounts the page twice, and
	// coming back to the editor arms it again); the sweep job catches
	// whatever a lost request leaves.
	const leaveUrl = () => `/admin/events/${data.event.id}/leave`;
	const emptyDraftLeavePending = () => event.visibility === 'draft' && !emptyDraftLeaveSent.has(event.id);
	// The deletion itself, awaitable: the leave guard holds the navigation
	// until the server has decided, so the page behind never shows the
	// empty Draft (issue 015).
	function deleteEmptyDraftOnLeave(): Promise<unknown> {
		if (!emptyDraftLeavePending()) return Promise.resolve();
		emptyDraftLeaveSent.add(event.id);
		return fetch(leaveUrl(), { method: 'POST', keepalive: true }).catch(() => {});
	}
	// A page being closed waits for nothing: a beacon, which survives it.
	function sendLeaveBeacon() {
		if (!emptyDraftLeavePending()) return;
		emptyDraftLeaveSent.add(event.id);
		if (!navigator.sendBeacon(leaveUrl())) void fetch(leaveUrl(), { method: 'POST', keepalive: true }).catch(() => {});
	}

	beforeNavigate((navigation) => {
		if (leaving) return;
		// A Draft's change waiting for its idle time is saved now (issue 018).
		saves.flush();
		if (!saves.isDirty()) {
			// An empty Draft is deleted before the page behind loads, so the
			// Events list never shows what was never filled in (issue 015).
			// Closing or reloading has no navigation to wait for: its beacon
			// fires on pagehide instead.
			if (navigation.type !== 'leave' && navigation.to && emptyDraftLeavePending()) {
				navigation.cancel();
				const { type, delta, willUnload, to } = navigation;
				pendingLeave = () => {
					leaving = true;
					if (type === 'popstate' && delta) history.go(delta);
					else if (willUnload) location.assign(to.url);
					else void goto(to.url).finally(() => (leaving = false));
				};
				void deleteEmptyDraftOnLeave().finally(() => leave());
			}
			return;
		}
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
		// Only saves on their way: leave once they are through, or ask if
		// one of them fails.
		if (Object.values(saves.snapshot().tabs).every((state) => !UNSAVED_STATES.has(state) || state === 'saving')) {
			void saves.idle().then(() => {
				if (saves.isDirty()) leaveDialogOpen = true;
				else leave();
			});
			return;
		}
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
	data-editor-root
	data-editor-held={held ? '' : undefined}
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
						<!-- A published Event retries through the bar's confirmation. -->
						<button
							type="button"
							onclick={() => (held ? askSaveAll() : void saves.retry())}
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
					{#if (missingByTab.get(tab.id) ?? 0) > 0}
						{@const missing = missingByTab.get(tab.id) ?? 0}
						<!-- Missing for publishing (issue 021): a hollow ring, where
						     « modifié » is a filled dot — told apart by shape, not
						     colour — and named for screen readers. The error mark
						     (issue 017) takes its own shape too. -->
						<span
							aria-hidden="true"
							class="ml-1.5 inline-block size-2 rounded-full border-[1.5px] border-current opacity-70"
							title={missing === 1 ? '1 point à vérifier' : `${missing} points à vérifier`}
						></span>
						<span class="sr-only">({missing === 1 ? '1 point à vérifier' : `${missing} points à vérifier`})</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	{#snippet panel(id: string, content: import('svelte').Snippet, guarded = true)}
		<div
			data-editor-tab={guarded ? id : undefined}
			data-editor-autosave={autosaved(id) ? '' : undefined}
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
		<Essentiel bind:this={essentielTab} {event} lastSeatingStart={data.lastSeatingStart ?? null} warnings={publishingWarnings} />
	{/snippet}
	{#snippet lieu()}
		<Lieu bind:this={lieuTab} {event} zones={data.timeZones ?? []} locked={data.timeZoneLocked ?? false} bind:timeZone />
	{/snippet}
	{#snippet seatings()}
		<Seatings bind:this={seatingsTab} {data} timeZone={data.event.timeZone} />
	{/snippet}
	{#snippet pricing()}
		<Pricing bind:this={pricingTab} {data} />
	{/snippet}
	{#snippet programme()}<Programme bind:this={programmeTab} {event} talents={data.talents ?? []} />{/snippet}
	{#snippet visuels()}<Photos bind:this={visualsTab} event={data.event} onAltChange={handleAltChange} />{/snippet}
	{#snippet pratique()}
		<PracticalInfo bind:this={practicalTab} {event} />
	{/snippet}
	{#snippet portfolio()}
		<Portfolio bind:this={portfolioTab} {event} lastSeatingStart={data.lastSeatingStart ?? null} warnings={portfolioWarnings} onAltChange={handleAltChange} />
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

	{#if held && heldTabs.length > 0}
		<!-- Held edits of a published Event (issue 020): nothing reaches
		     visitors or Ticket holders before « Enregistrer » is confirmed. -->
		<section
			aria-label="Modifications en attente"
			class="sticky bottom-4 z-20 mt-6 bg-background rounded-lg border border-border-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center"
		>
			<div class="text-sm">
				<p role="status" class="font-medium text-foreground">
					{savingAll ? 'Enregistrement…' : `${modifiedTabsLabel(heldTabs.length)}, non enregistré${heldTabs.length > 1 ? 's' : ''}`}
				</p>
				{#if stillUnsaved.length > 0 && !savingAll}
					<ul class="mt-1 space-y-0.5 text-red-700">
						{#each stillUnsaved as tab (tab.id)}
							<li>
								<button
									type="button"
									onclick={() => (activeTab = panelIndex(tab.id))}
									class="underline underline-offset-2 hover:text-red-900 transition-colors cursor-pointer"
								>« {tab.title} »</button>
								non enregistré{tab.message ? ` : ${tab.message}` : ''}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-muted-foreground">Rien n’est visible en ligne avant l’enregistrement.</p>
				{/if}
			</div>
			<div class="flex gap-3 sm:ml-auto">
				<button
					type="button"
					onclick={() => void discardHeld()}
					disabled={savingAll || discarding}
					class="px-4 py-2 text-sm font-medium text-foreground-alt bg-background border border-border-card rounded-lg hover:bg-surface transition-colors disabled:opacity-60"
				>
					Annuler
				</button>
				<button
					bind:this={saveAllButton}
					type="button"
					onclick={askSaveAll}
					disabled={savingAll || discarding}
					aria-haspopup="dialog"
					class="px-4 py-2 text-sm font-medium text-background bg-foreground rounded-lg hover:opacity-90 transition-colors disabled:opacity-60"
				>
					{savingAll ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</div>
		</section>
	{/if}
</div>

<Modal
	bind:isOpen={confirmSaveOpen}
	title="Enregistrer les modifications ?"
	description="Elles deviennent aussitôt visibles des visiteurs et des détenteurs d’un billet."
>
	<p class="text-sm text-foreground-alt">
		{heldTabs.length === 1 ? 'Onglet modifié :' : 'Onglets modifiés :'}
	</p>
	<ul class="my-2 space-y-1.5 text-sm text-foreground-alt list-disc pl-5">
		{#each heldTabs as tab (tab.id)}
			<li>{tab.title}</li>
		{/each}
	</ul>
	<div class="flex justify-end gap-3 mt-4">
		<button
			type="button"
			onclick={() => (confirmSaveOpen = false)}
			class="px-4 py-2 text-sm font-medium text-foreground-alt bg-background border border-border-card rounded-lg hover:bg-surface transition-colors"
		>
			Retour
		</button>
		<button
			type="button"
			onclick={() => void saveAllHeld()}
			class="px-4 py-2 text-sm font-medium text-background bg-foreground rounded-lg hover:opacity-90 transition-colors"
		>
			Enregistrer
		</button>
	</div>
</Modal>

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

<style>
	/* A Draft's tabs save themselves (issues 018, 019); a published
	   Event saves through its bar (issue 020). */
	:global([data-editor-autosave] [data-editor-save]),
	:global([data-editor-held] [data-editor-save]) {
		display: none;
	}
</style>
