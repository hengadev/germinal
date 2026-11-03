<script lang="ts">
	import type { PageData } from './$types';
	import Arrivees from '$lib/components/staff/arrivees/Arrivees.svelte';
import Aujourdhui from '$lib/components/staff/aujourdhui/Aujourdhui.svelte';
import NotesCuisine from '$lib/components/staff/arrivees/NotesCuisine.svelte';
import { noteCount as countNotes } from '$lib/components/staff/arrivees/helpers';
import { page } from '$app/state';
import { ArrowLeft } from 'lucide-svelte';
import EventActionsMenu from '$lib/components/staff/event-menu/EventActionsMenu.svelte';
import CloseBookings from '$lib/components/staff/event-menu/CloseBookings.svelte';
import Invite from '$lib/components/staff/event-menu/Invite.svelte';
import SpotForm from '$lib/components/staff/event-menu/SpotForm.svelte';
import CancelRefundSheet from '$lib/components/staff/arrivees/CancelRefundSheet.svelte';
import PartySizeSheet from '$lib/components/staff/arrivees/PartySizeSheet.svelte';
import { afterNavigate, replaceState } from '$app/navigation';
import { invalidateAll } from '$app/navigation';
import { deserialize } from '$app/forms';
import { fly } from 'svelte/transition';
import OfflineBanner from '$lib/components/staff/offline/OfflineBanner.svelte';
import { clearSnapshots, getSnapshot, refreshSnapshot, type StoredSnapshot } from '$lib/staff/offline/snapshot-store';
import { onlineState, markOffline } from '$lib/staff/offline/online-state.svelte';
import { replayQueue, type ArrivalEntry, type ArrivalSendResult } from '$lib/staff/offline/replay';
import { commitReplay, getArrivalQueue, queueState } from '$lib/staff/offline/arrival-queue.svelte';
import { settlePendingArrivals } from '$lib/staff/offline/pending-arrivals.svelte';
import { motion, cubicOut } from '$lib/components/staff/motion';
import { untrack } from 'svelte';
import {
	swipeDirection,
	swipeStartIgnored,
	tabAfterSwipe,
	visibleTabs,
	type StaffEventTab
} from '$lib/components/staff/swipe';

	let { data }: { data: PageData } = $props();

	// At the door, Arrivées comes first; it only exists during a Day.
	// ?onglet=arrivees|cuisine|brief lets a link open a tab directly
	// (the old ?onglet=scanner falls back to the default: no Scanner tab
	// any more, issue 034 — the floating button scans).
	const fromUrl = page.url.searchParams.get('onglet');
	const tabFromUrl =
		fromUrl === 'arrivees' || fromUrl === 'aujourdhui' || fromUrl === 'cuisine' || fromUrl === 'brief'
			? fromUrl
			: null;
	let activeTab = $state<'arrivees' | 'aujourdhui' | 'cuisine' | 'brief'>(
		tabFromUrl ??
			(!data.access.day
				? 'brief'
				: data.access.canArrivees
					? 'arrivees'
					: data.access.canCuisine
						? 'cuisine'
						: 'brief')
	);

	// ?onglet= follows the active tab, keeping ?service= and the other params.
	// Only the tab drives this, not the address: a navigation to another
	// ?onglet= is followed by afterNavigate below.
	$effect(() => {
		const tab = activeTab;
		untrack(() => {
			const url = new URL(page.url.href);
			if (url.searchParams.get('onglet') !== tab) {
				url.searchParams.set('onglet', tab);
				replaceState(url, page.state);
			}
		});
	});

	// Changing tab by tap or swipe: the content slides in from the side it
	// came from, and the active button scrolls into view if the bar overflows.
	let tabPanel = $state<HTMLElement | null>(null);
	let tabBar = $state<HTMLElement | null>(null);
	let tabDirection = $state(1);
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

	// Issue 060 : la copie du Jour sur le téléphone — actualisée au
	// chargement puis toutes les 3 minutes tant qu'il y a du réseau ;
	// le bandeau « Hors ligne » en montre l'âge.
	let snapshot = $state<StoredSnapshot | null>(null);
	const canSnapshot = $derived(
			Boolean(data.access.day && (data.access.canScan || data.access.canManualCheckIn))
		);
	$effect(() => {
		const id = data.event.id;
		const day = data.access.day;
		if (!canSnapshot || !day) return;
		getSnapshot(id).then((stored) => {
			if (stored && stored.day === day) snapshot = stored;
			// Another Day's copy must never answer a scan.
			else if (stored) clearSnapshots();
		});
		// Every 3 minutes online; offline, a try every 30 seconds, which is
		// also how a weak network that never fired « offline » comes back.
		let last = 0;
		const refresh = () => {
			last = Date.now();
			refreshSnapshot(id).then((fresh) => (snapshot = fresh ?? snapshot));
		};
		refresh();
		const timer = setInterval(() => {
			if (Date.now() - last >= (onlineState.online ? 3 * 60_000 : 30_000)) refresh();
		}, 30_000);
		const onOnline = () => refresh();
		addEventListener('online', onOnline);
		return () => {
			clearInterval(timer);
			removeEventListener('online', onOnline);
		};
	});

	// Issue 061 : le renvoi des arrivées enregistrées hors ligne, une par
	// une, la plus ancienne d'abord — au chargement, au retour du réseau
	// (l'événement « online » ou markOnline l'un et l'autre, via l'état
	// réactif). Chaque entrée porte son id de tentative (059) : rien ne
	// compte deux fois.
	let replaying = false;
	async function sendArrival(entry: ArrivalEntry): Promise<ArrivalSendResult> {
		try {
			// A form action called by hand: SvelteKit answers JSON only when
			// asked, in its own serialisation.
			const res = await fetch(
				`/staff/events/${entry.eventId}?/${entry.method === 'scan' ? 'scanCheckIn' : 'checkIn'}`,
				{
					method: 'POST',
					headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
					body: new URLSearchParams({
						reservationId: entry.reservationId,
						guests: String(entry.guests),
						clientId: entry.clientId
					})
				}
			);
			const action = deserialize(await res.text()) as {
				type: string;
				data?: { error?: string };
			};
			if (action.type === 'success') return 'ok';
			if (action.type === 'failure') {
				return { conflict: action.data?.error ?? 'Une erreur est survenue.' };
			}
			return { conflict: 'Une erreur est survenue.' };
		} catch (error) {
			if (error instanceof TypeError) markOffline();
			throw error;
		}
	}
	async function replayArrivals() {
		if (replaying || !onlineState.online) return;
		const entries = (await getArrivalQueue()).filter((entry) => entry.eventId === data.event.id);
		if (entries.length === 0) return;
		replaying = true;
		queueState.sending = true;
		try {
			const { remaining, conflicts } = await replayQueue(entries, sendArrival);
			const done = entries.filter(
				(entry) => !remaining.some((kept) => kept.clientId === entry.clientId)
			);
			await commitReplay(done, conflicts);
			if (done.length > 0) {
				// La page dit maintenant la vérité : on la recharge, puis les
				// compteurs locaux des entrées envoyées s'effacent.
				await invalidateAll();
				settlePendingArrivals(done);
			}
		} finally {
			queueState.sending = false;
			replaying = false;
		}
	}
	$effect(() => {
		if (onlineState.online) replayArrivals();
	});

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
	{#if canSnapshot}
		<OfflineBanner takenAt={snapshot?.takenAt ?? null} />
	{/if}
	<!-- En-tête : l'événement et le jour en cours -->
	<div class="mb-6">
		<div class="flex items-center gap-2">
			<a
				href="/staff?liste"
				aria-label="Retour aux événements"
				class="-ml-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<ArrowLeft size={22} aria-hidden="true" />
			</a>
			<h1 class="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
			<EventActionsMenu
				canWalkIn={data.access.canWalkIn}
				canComp={data.access.canComp}
				canCloseBookings={data.access.canCloseBookings}
				canInvite={data.access.canInvite}
				duringDay={Boolean(data.access.day && data.arrivees)}
			/>
		</div>
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

	<!-- Onglets : seulement ce que l'accès autorise, plus le Brief
	     (issue 032) pour tout membre du staff assigné -->
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
				{#if data.access.canAujourdhui}
					<button
						type="button"
						onclick={() => goToTab('aujourdhui')}
						aria-current={activeTab === 'aujourdhui' ? 'page' : undefined}
						class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'aujourdhui'
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					>
						Aujourd'hui
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
				<button
					type="button"
					onclick={() => goToTab('brief')}
					aria-current={activeTab === 'brief' ? 'page' : undefined}
					class="px-1 py-3 text-sm font-medium border-b-2 {activeTab === 'brief'
						? 'border-foreground text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
				>
					Brief
				</button>
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
					duration: motion(200),
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
						canMove={data.access.canMove}
						canCancelRefund={data.access.canCancelRefund}
					canChangeParty={data.access.canChangeParty}
					/>
				{:else}
					<div class="bg-background border border-border-card rounded-lg p-8 text-center">
						<p class="text-muted-foreground">Aucun jour en cours : les invités ne sont visibles que le jour J.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Onglet Aujourd'hui -->
		{#if activeTab === 'aujourdhui' && data.access.canAujourdhui && data.aujourdhui}
			<section aria-label="Aujourd'hui">
				<Aujourdhui attendance={data.aujourdhui} timeZone={data.event.timeZone} />
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

			<!-- Onglet Brief (issue 032) : le brief général puis la ou les
			     parties de rôle, en texte brut, sans Markdown -->
			{#if activeTab === 'brief'}
				<section aria-label="Brief" class="space-y-4">
					{#if !data.brief.general && !data.brief.roles.length}
						<div class="bg-background border border-border-card rounded-lg p-8 text-center">
							<p class="text-muted-foreground">Pas encore de brief pour cet événement.</p>
						</div>
					{:else}
						{#if data.brief.general}
							<div class="bg-background border border-border-card rounded-lg p-6">
								<h2 class="text-sm font-semibold text-foreground mb-2">Brief général</h2>
								<p class="text-sm text-foreground whitespace-pre-line">{data.brief.general}</p>
							</div>
						{/if}
						{#each data.brief.roles as role (role.staffRoleId)}
							<div class="bg-background border border-border-card rounded-lg p-6">
								<h2 class="text-sm font-semibold text-foreground mb-2">
									<!-- An Admin sees every role's part: no « votre ». -->
									{data.staffRoleName ? 'Pour votre rôle' : 'Rôle'} : {role.staffRoleName}
								</h2>
								<p class="text-sm text-foreground whitespace-pre-line">{role.body}</p>
							</div>
						{/each}
					{/if}
					{#if !data.access.permissions.length}
						<div class="bg-background border border-border-card rounded-lg p-8 text-center">
							<p class="text-muted-foreground">
								Vous n'avez aucune autre permission sur cet événement. Contactez l'organisateur.
							</p>
						</div>
					{/if}
				</section>
			{/if}
				</div>
			{/key}
		</div>

	<!-- Le formulaire walk-in / invitation du menu ⋮, par-dessus tout -->
	{#if data.arrivees}
		<SpotForm
			seatings={data.arrivees.seatings}
			timeZone={data.event.timeZone}
			onsaved={() => goToTab('arrivees')}
		/>
	{/if}

	<!-- La feuille Annuler / Rembourser du menu ⋮ d'une carte, par-dessus tout -->
	{#if data.arrivees && data.access.canCancelRefund}
		<CancelRefundSheet />
	{/if}

	<!-- La feuille « Modifier le nombre » du menu ⋮ d'une carte, par-dessus tout -->
	{#if data.arrivees && data.access.canChangeParty}
		<PartySizeSheet />
	{/if}

	<!-- La feuille « Fermer aux réservations » du menu ⋮, par-dessus tout -->
	{#if data.access.canCloseBookings}
		<CloseBookings
			seatings={data.closeBookings}
			timeZone={data.event.timeZone}
			isAdmin={!data.staffRoleName}
		/>
	{/if}

	<!-- La feuille « Nouvelle réservation » du menu ⋮, par-dessus tout -->
	{#if data.access.canInvite}
		<Invite seatings={data.invite} timeZone={data.event.timeZone} />
	{/if}
</div>
