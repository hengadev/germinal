<script lang="ts">
	import type { PageData } from './$types';
	import Arrivees from '$lib/components/staff/arrivees/Arrivees.svelte';
import Scanner from '$lib/components/staff/scanner/Scanner.svelte';
import NotesCuisine from '$lib/components/staff/arrivees/NotesCuisine.svelte';
import { noteCount as countNotes } from '$lib/components/staff/arrivees/helpers';
import { page } from '$app/state';
import { afterNavigate, replaceState } from '$app/navigation';
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import {
	swipeDirection,
	swipeStartIgnored,
	tabAfterSwipe,
	visibleTabs,
	type StaffEventTab
} from '$lib/components/staff/swipe';

	let { data }: { data: PageData } = $props();

	// At the door, Arrivées comes first; it only exists during a Day.
	// ?onglet=arrivees|cuisine|scanner lets a link open a tab directly.
	const fromUrl = page.url.searchParams.get('onglet');
	const tabFromUrl =
		fromUrl === 'arrivees' || fromUrl === 'cuisine' || fromUrl === 'scanner' ? fromUrl : null;
	let activeTab = $state<'arrivees' | 'cuisine' | 'scanner'>(
		tabFromUrl ??
			(data.access.canArrivees
				? 'arrivees'
				: data.access.canCuisine
					? 'cuisine'
					: data.access.canScan
						? 'scanner'
						: 'arrivees')
	);

	// ?onglet= follows the active tab, keeping ?service= and the other params.
	$effect(() => {
		const url = new URL(page.url.href);
		if (url.searchParams.get('onglet') !== activeTab) {
			url.searchParams.set('onglet', activeTab);
			replaceState(url, page.state);
		}
	});

	// Changing tab by tap or swipe: the content slides in from the side it
	// came from, and the active button scrolls into view if the bar overflows.
	let tabPanel = $state<HTMLElement | null>(null);
	let tabBar = $state<HTMLElement | null>(null);
	let tabDirection = $state(1);
	const reducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function goToTab(tab: StaffEventTab) {
		if (tab === activeTab) return;
		const order = visibleTabs({ ...data.access });
		tabDirection = order.indexOf(tab) > order.indexOf(activeTab) ? 1 : -1;
		activeTab = tab;
	}

	$effect(() => {
		activeTab;
		tabBar?.querySelector('[aria-current="page"]')?.scrollIntoView({
			block: 'nearest',
			inline: 'nearest'
		});
	});

	// A link to another tab of this page (the bar's Scan button) navigates
	// without remounting it: follow ?onglet=.
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		const tab = page.url.searchParams.get('onglet');
		if (tab && visibleTabs({ ...data.access }).includes(tab as StaffEventTab)) {
			goToTab(tab as StaffEventTab);
		}
	});

	// Swipe between tabs on a touch screen (issue 029). Touch events, not
	// pointer events: once the browser starts panning it cancels the pointer
	// and pointerup never comes, while touchend always does.
	let swipeStart: { x: number; y: number } | null = null;

	function onTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1 || !tabPanel) {
			swipeStart = null;
			return;
		}
		const touch = event.touches[0];
		swipeStart = swipeStartIgnored(event.target as Element, tabPanel)
			? null
			: { x: touch.clientX, y: touch.clientY };
	}

	function onTouchEnd(event: TouchEvent) {
		if (!swipeStart) return;
		const touch = event.changedTouches[0];
		const dx = touch.clientX - swipeStart.x;
		const dy = touch.clientY - swipeStart.y;
		swipeStart = null;
		const direction = swipeDirection(dx, dy);
		if (!direction) return;
		const next = tabAfterSwipe(direction, activeTab, { ...data.access });
		if (next) goToTab(next);
	}

	const title = $derived(data.event.titleFr || data.event.titleEn || 'Événement sans titre');

	// The Cuisine tab's badge: the parties with Dietary Requirements.
	const notes = $derived(data.arrivees ? countNotes(data.arrivees) : 0);

	const dayLabel = $derived(
		data.access.day
			? new Intl.DateTimeFormat('fr-FR', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC',
			}).format(new Date(`${data.access.day}T12:00:00Z`))
			: null
	);
</script>

<svelte:head>
	<title>{title} | Portail Staff</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<!-- En-tête : l'événement et le jour en cours -->
	<div class="mb-6">
		<h1 class="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
		<p class="text-sm text-muted-foreground mt-1">
			{#if data.staffRoleName}
				<span class="font-medium">Rôle :</span> {data.staffRoleName} —
			{/if}
			{#if dayLabel}
				Jour en cours : <span class="font-medium capitalize">{dayLabel}</span>
			{:else}
				Aucun jour en cours aujourd'hui.
			{/if}
		</p>
	</div>

	<!-- Onglets : seulement ce que l'accès autorise -->
	{#if !data.access.permissions.length}
		<div class="bg-background border border-border-card rounded-lg p-8 text-center">
			<p class="text-muted-foreground">
				Vous n'avez aucune permission sur cet événement. Contactez l'organisateur.
			</p>
		</div>
	{:else}
		<div class="border-b border-border-card mb-6">
			<nav
				class="flex gap-6 -mb-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				aria-label="Sections de l'événement"
				bind:this={tabBar}
			>
				{#if data.access.canArrivees}
					<button
						type="button"
						onclick={() => goToTab('arrivees')}
						aria-current={activeTab === 'arrivees' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'arrivees'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Arrivées
					</button>
				{/if}
				{#if data.access.canCuisine}
					<button
						type="button"
						onclick={() => goToTab('cuisine')}
						aria-current={activeTab === 'cuisine' ? 'page' : undefined}
						class="inline-flex items-center gap-1.5 px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'cuisine'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Cuisine
						<span class="rounded bg-muted px-1.5 text-xs leading-5 text-foreground tabular-nums">{notes}</span>
					</button>
				{/if}
				{#if data.access.canScan}
					<button
						type="button"
						onclick={() => goToTab('scanner')}
						aria-current={activeTab === 'scanner' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'scanner'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Scanner
					</button>
				{/if}
			</nav>
		</div>

		<!-- Contenu de l'onglet : balayable horizontalement sur mobile -->
		<div
			bind:this={tabPanel}
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
			ontouchcancel={() => (swipeStart = null)}
		>
			{#key activeTab}
				<div
					in:fly={{
					duration: reducedMotion ? 0 : 200,
					x: tabDirection * 320,
					easing: cubicOut
				}}
			>
			<!-- Onglet Arrivées -->
			{#if activeTab === 'arrivees' && data.access.canArrivees}
			<section aria-label="Arrivées">
				{#if data.arrivees}
					<Arrivees
						list={data.arrivees}
						fields={{
							guestList: data.access.permissions.includes('guest_list'),
							dietary: data.access.permissions.includes('dietary'),
							contact: data.access.permissions.includes('contact')
						}}
						timeZone={data.event.timeZone}
						canCheckIn={data.access.canManualCheckIn}
						canCorrect={data.access.canCorrect}
						canSettle={data.access.canSettle}
						canWalkIn={data.access.canWalkIn}
						canMove={data.access.canMove}
						canComp={data.access.canComp}
					/>
				{:else}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucun jour en cours : les invités ne sont visibles que le jour J.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Onglet Cuisine -->
		{#if activeTab === 'cuisine' && data.access.canCuisine}
			<section aria-label="Cuisine">
				{#if data.arrivees}
					<NotesCuisine list={data.arrivees} timeZone={data.event.timeZone} />
				{:else}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucun jour en cours : les invités ne sont visibles que le jour J.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Onglet Scanner -->
		{#if activeTab === 'scanner' && data.access.canScan}
			<section aria-label="Scanner">
				<Scanner onSearchByName={() => (activeTab = 'arrivees')} />
			</section>
		{/if}

			{#if !(activeTab === 'arrivees' && data.access.canArrivees) && !(activeTab === 'cuisine' && data.access.canCuisine) && !(activeTab === 'scanner' && data.access.canScan)}
				<div class="bg-background border border-border-card rounded-lg p-8 text-center">
					<p class="text-muted-foreground">
						Vos tâches sont réunies sur la page
						<a href="/staff/taches" class="text-foreground font-medium underline">Mes tâches</a>.
					</p>
				</div>
			{/if}
				</div>
			{/key}
		</div>
	{/if}
</div>
