<script lang="ts">
	/**
	 * Arrivées (issue 016): the Day's parties, one Service at a time
	 * (Déjeuner, Dîner), by Seating, shaped by the viewer's permissions. It
	 * opens on the Service under way. The search box and the Seating times
	 * stay on screen; one time at a time, or all of them, the one under way
	 * marked with a dot. A search looks across the whole Day: a party booked
	 * at 20 h 00 may well walk in at 20 h 45, or ask at lunch.
	 *
	 * Those with the Dietary Requirements permission also get « Notes
	 * cuisine », every party's Dietary Requirements by Seating; Cuisine
	 * (Dietary Requirements without the guest list) gets only that view.
	 *
	 * Parties fully arrived fold into one line under their Seating, last in
	 * first, so the list shrinks as the Day goes (issue 017).
	 */
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { ChefHat, Check, ChevronDown, Gift, LoaderCircle, Plus, Search, Users, X } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import type { DayGuestList, DayGuestParty } from '$lib/server/services/day-guest-list';
	import PartyCard from './PartyCard.svelte';
	import {
		capacityLabel,
		currentSeatingId,
		guests,
		matches,
		seatingTime,
		serviceLabel,
		servicesOf,
		type ArriveesFields,
	} from './helpers';

	let {
		list,
		fields,
		timeZone,
		canCheckIn = false,
		canCorrect = false,
		canSettle = false,
		canWalkIn = false,
		canComp = false
	}: {
		list: DayGuestList;
		fields: ArriveesFields;
		timeZone: string;
		canCheckIn?: boolean;
		canCorrect?: boolean;
		canSettle?: boolean;
		canWalkIn?: boolean;
		canComp?: boolean;
	} = $props();

	// The clock only moves the dot on the Seating under way, never the list.
	let now = $state(new Date());
	$effect(() => {
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});
	const currentId = $derived(currentSeatingId(list.seatings, now));

	/** The Service shown, kept in the address (`?service=diner`); by default the one under way. */
	const SERVICE_PARAM = 'service';
	const serviceKey = (kind: 'lunch' | 'dinner') => (kind === 'lunch' ? 'dejeuner' : 'diner');
	const services = $derived(servicesOf(list.seatings));
	// svelte-ignore state_referenced_locally
	let serviceId = $state<string | null>(
		servicesOf(list.seatings).find((s) => serviceKey(s.kind) === page.url.searchParams.get(SERVICE_PARAM))?.id ??
			list.seatings.find((s) => s.id === currentSeatingId(list.seatings, new Date()))?.serviceId ??
			null
	);
	const service = $derived(services.find((s) => s.id === serviceId) ?? services[0]);

	function showService(id: string) {
		serviceId = id;
		filterId = null;
		const url = new URL(page.url.href);
		const chosen = services.find((s) => s.id === id);
		if (chosen) url.searchParams.set(SERVICE_PARAM, serviceKey(chosen.kind));
		url.searchParams.delete(HOUR_PARAM);
		replaceState(url, page.state);
	}

	// Cuisine sees only the kitchen notes; others choose, the door first.
	let view = $state<'arrivees' | 'cuisine'>('arrivees');
	const shownView = $derived(fields.guestList ? view : 'cuisine');

	// The door's chase list (issue 019): the arrived parties of the Service
	// shown whose Balance is still to collect — flat, never folded away.
	let unsettledOnly = $state(false);
	const hasBalanceDue = (p: DayGuestParty) =>
		!p.isComp && (p.balanceAmount ?? 0) > 0 && p.balanceSettledAt === null;

	let query = $state('');

	// « Ajouter un walk-in » (issue 020) and « Offrir » (issue 021): one
	// inline form for both, black and white, on the Service shown — started
	// Seatings included, the one under way by default. A Comp differs only
	// in its action and its copy: it is offered and owes nothing.
	let spotKind = $state<'walk_in' | 'comp' | null>(null);
	const isCompForm = $derived(spotKind === 'comp');
	let walkInSubmitting = $state(false);
	let walkInSeating = $state('');
	let walkInName = $state('');
	let walkInQuantity = $state(2);
	let walkInEmail = $state('');
	let walkInPhone = $state('');
	const walkInError = $derived.by(() => {
		const form = page.form as { error?: string; walkIn?: boolean; comp?: boolean } | null;
		return form && form.error && (spotKind === 'comp' ? form.comp : form.walkIn)
			? form.error
			: null;
	});
	function closeWalkIn() {
		spotKind = null;
		walkInName = '';
		walkInEmail = '';
		walkInPhone = '';
		walkInQuantity = 2;
	}
	function openSpot(kind: 'walk_in' | 'comp') {
		walkInSeating = currentId ?? walkInSeatings[0]?.id ?? '';
		spotKind = kind;
	}
	function stepQuantity(delta: number) {
		walkInQuantity = Math.max(1, walkInQuantity + delta);
	}
	const walkInSeatings = $derived(services.length > 0 ? (service?.seatings ?? []) : list.seatings);
	const BTN =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const INPUT =
		'min-h-11 w-full rounded-md border border-border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none';
	const LABEL = 'block text-sm font-medium text-foreground';

	/** The Seating the list is filtered to, kept in the address (`?heure=20h30`). */
	const HOUR_PARAM = 'heure';
	const hourKey = (time: string) => time.replace(' h ', 'h');
	// svelte-ignore state_referenced_locally
	let filterId = $state<string | null>(
		list.seatings.find((s) => hourKey(seatingTime(s, timeZone)) === page.url.searchParams.get(HOUR_PARAM))
			?.id ?? null
	);
	const serviceSeatings = $derived(service?.seatings ?? []);
	const dueParties = $derived(
		unsettledOnly
			? serviceSeatings.flatMap((s) => s.parties).filter((p) => (p.arrived ?? 0) > 0 && hasBalanceDue(p))
			: []
	);
	const shownId = $derived(
		query.trim() || serviceSeatings.length < 2 || !serviceSeatings.some((s) => s.id === filterId)
			? null
			: filterId
	);

	function filterTo(id: string | null) {
		filterId = id;
		const url = new URL(page.url.href);
		const seating = list.seatings.find((s) => s.id === id);
		if (seating) url.searchParams.set(HOUR_PARAM, hourKey(seatingTime(seating, timeZone)));
		else url.searchParams.delete(HOUR_PARAM);
		replaceState(url, page.state);
	}

	// A party is still expected until every one of its Guests has arrived.
	function isExpected(party: { quantity?: number; arrived?: number }): boolean {
		return party.quantity === undefined || (party.arrived ?? 0) < party.quantity;
	}

	// A search covers the whole Day; otherwise the Service shown, or one of its times.
	const seatings = $derived(
		(query.trim() ? list.seatings : serviceSeatings)
			.filter((s) => shownId === null || s.id === shownId)
			.map((s) => ({ ...s, parties: s.parties.filter((p) => matches(p, query)) }))
			.filter((s) => !query.trim() || s.parties.length > 0)
	);
	const found = $derived(seatings.reduce((n, s) => n + s.parties.length, 0));
	// The chips count the parties still expected: those fully in fold away.
	const expectedCount = (s: { parties: { quantity?: number; arrived?: number }[] }) =>
		s.parties.filter(isExpected).length;
	const totalParties = $derived(serviceSeatings.reduce((n, s) => n + expectedCount(s), 0));
	const serviceBooked = $derived(serviceSeatings.reduce((n, s) => n + s.booked, 0));
	// Null when one of the Seatings has no capacity: there is no total to show.
	const serviceCapacity = $derived.by<number | null>(() => {
		let sum = 0;
		for (const s of serviceSeatings) {
			if (s.totalCapacity === null) return null;
			sum += s.totalCapacity;
		}
		return sum;
	});
	const noteCount = $derived(
		serviceSeatings.reduce((n, s) => n + s.parties.filter((p) => p.dietaryRequirements?.trim()).length, 0)
	);

	const CHIP =
		'inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none pointer-fine:h-9';
	const SELECTED = 'border-foreground bg-foreground text-background';
	const IDLE = 'border-border-card bg-background text-foreground hover:bg-muted';
</script>

<div class="space-y-4">
	{#if services.length > 1}
		<nav class="flex gap-1.5" aria-label="Service">
			{#each services as s (s.id)}
				<button
					type="button"
					onclick={() => showService(s.id)}
					aria-pressed={s.id === service?.id}
					class="min-h-11 flex-1 rounded-lg border px-4 text-base font-semibold transition-colors sm:flex-none pointer-fine:min-h-9 {s.id ===
					service?.id
						? 'border-foreground bg-foreground text-background'
						: 'border-border-card bg-background text-foreground hover:bg-muted'}"
				>
					{serviceLabel(s.kind)}
				</button>
			{/each}
		</nav>
	{/if}

	{#if service}
		<p class="text-sm text-muted-foreground tabular-nums">
			{#if services.length === 1}<span class="font-semibold text-foreground">{serviceLabel(service.kind)}</span> ·{/if}
			<span class="font-medium text-foreground"
				>{serviceBooked}{#if serviceCapacity !== null}&nbsp;/ {serviceCapacity}{/if}</span
			>
			{serviceBooked === 1 ? 'personne' : 'personnes'} · {totalParties}
			{totalParties === 1 ? 'réservation' : 'réservations'}
		</p>
	{/if}

	{#if fields.guestList}
		<div class="flex flex-wrap items-center gap-2">
			{#if fields.dietary}
				<div class="inline-flex rounded-lg border border-border-card p-0.5" role="group" aria-label="Vue">
					<button
						type="button"
						onclick={() => (view = 'arrivees')}
						aria-pressed={shownView === 'arrivees'}
						class="min-h-9 rounded-md px-3 text-sm font-medium {shownView === 'arrivees'
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Arrivées
					</button>
					<button
						type="button"
						onclick={() => (view = 'cuisine')}
						aria-pressed={shownView === 'cuisine'}
						class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium {shownView === 'cuisine'
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Notes cuisine
						<span class="rounded bg-muted px-1.5 text-xs leading-5 text-foreground tabular-nums">{noteCount}</span>
					</button>
				</div>
			{/if}
			<button
				type="button"
				onclick={() => (unsettledOnly = !unsettledOnly)}
				aria-pressed={unsettledOnly}
				class="{CHIP} {unsettledOnly ? SELECTED : IDLE}"
			>
				Arrivés, solde non réglé
			</button>
		</div>
	{/if}

	<!-- « Ajouter un walk-in » (issue 020) / « Offrir » (issue 021) -->
	{#if (canWalkIn || canComp) && fields.guestList}
		<div class="flex flex-wrap items-center gap-2">
			{#if spotKind !== null}
				<button
						type="button"
						onclick={closeWalkIn}
						class="{BTN} border-border-card bg-background text-foreground hover:bg-muted"
					>
					<X size={16} aria-hidden="true" /> Annuler
				</button>
			{:else}
				{#if canWalkIn}
					<button
						type="button"
						onclick={() => openSpot('walk_in')}
						class="{BTN} border-foreground bg-foreground text-background hover:bg-foreground/90"
					>
						<Plus size={16} aria-hidden="true" /> Ajouter un walk-in
					</button>
				{/if}
				{#if canComp}
					<button
						type="button"
						onclick={() => openSpot('comp')}
						class="{BTN} border-foreground bg-background text-foreground hover:bg-muted"
					>
						<Gift size={16} aria-hidden="true" /> Offrir
					</button>
				{/if}
			{/if}
		</div>
		{#if spotKind !== null}
			<form
				method="POST"
				action={isCompForm ? '?/comp' : '?/walkIn'}
				class="rounded-lg border border-border-card bg-background p-4"
				use:enhance={() => {
					walkInSubmitting = true;
					return async ({ update }) => {
						await update();
						walkInSubmitting = false;
						const form = page.form as { error?: string; walkIn?: boolean; comp?: boolean } | null;
						if (!(form && form.error && (isCompForm ? form.comp : form.walkIn))) closeWalkIn();
					};
				}}
			>
				<fieldset class="space-y-3" disabled={walkInSubmitting}>
					<legend class="text-base font-semibold text-foreground">
						{isCompForm ? 'Offrir un Comp' : 'Ajouter un walk-in'}
					</legend>
					{#if isCompForm}
						<p class="text-sm text-muted-foreground">Offert : rien à régler, aucun billet envoyé.</p>
					{/if}
					<div>
						<label class={LABEL} for="walk-in-seating">Séance</label>
						<select
							id="walk-in-seating"
							name="seatingId"
							bind:value={walkInSeating}
							class={INPUT}
							required
						>
							{#each walkInSeatings as seating (seating.id)}
								<option value={seating.id}>{seatingTime(seating, timeZone)}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class={LABEL} for="walk-in-name">Nom</label>
						<input id="walk-in-name" name="name" type="text" bind:value={walkInName} required class={INPUT} />
					</div>
					<div>
						<span class={LABEL} id="walk-in-quantity-label">Personnes</span>
						<div class="mt-1 inline-flex items-center gap-2" role="group" aria-labelledby="walk-in-quantity-label">
							<button
								type="button"
								onclick={() => stepQuantity(-1)}
								class="{BTN} border-border-card bg-background text-foreground hover:bg-muted"
								aria-label="Retirer une personne"
							>−</button
							>
							<span class="min-w-8 text-center text-lg font-semibold text-foreground tabular-nums">{walkInQuantity}</span>
							<button
								type="button"
								onclick={() => stepQuantity(1)}
								class="{BTN} border-border-card bg-background text-foreground hover:bg-muted"
								aria-label="Ajouter une personne"
							>+</button
							>
							<input type="hidden" name="quantity" value={walkInQuantity} />
						</div>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label class={LABEL} for="walk-in-email">E-mail (facultatif)</label>
							<input
								id="walk-in-email"
								name="email"
								type="email"
								bind:value={walkInEmail}
								class={INPUT}
							/>
						</div>
						<div>
							<label class={LABEL} for="walk-in-phone">Téléphone (facultatif)</label>
							<input id="walk-in-phone" name="phone" type="tel" bind:value={walkInPhone} class={INPUT} />
						</div>
					</div>
					{#if walkInError}
						<p class="text-sm font-medium text-red-600" role="alert">{walkInError}</p>
					{/if}
					<button
						type="submit"
						disabled={walkInSubmitting || walkInSeatings.length === 0}
						class="{BTN} w-full border-foreground bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
					>
						{#if walkInSubmitting}<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />{/if}
						{isCompForm ? 'Offrir' : 'Enregistrer'}
					</button>
				</fieldset>
			</form>
		{/if}
	{/if}

	<!-- The search box and the Seating times stay on screen while the list scrolls. -->
	<div class="sticky top-0 z-10 -mx-4 space-y-2 bg-background px-4 py-2">
		<div class="relative" role="search">
			<label for="arrivees-search" class="sr-only">
				{fields.contact ? 'Rechercher par nom, e-mail ou téléphone' : 'Rechercher par nom'}
			</label>
			<Search
				size={20}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			<input
				id="arrivees-search"
				type="search"
				bind:value={query}
				placeholder={fields.contact ? 'Nom, e-mail ou téléphone' : 'Nom'}
				autocomplete="off"
				enterkeyhint="search"
				class="h-12 w-full rounded-lg border border-border-input bg-background pr-3 pl-10 text-base text-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
			/>
		</div>

		{#if !query.trim() && serviceSeatings.length > 1}
			<nav
				aria-label="Filtrer par service"
				class="-mx-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<ul class="flex w-max gap-1.5">
					<li>
						<button
							type="button"
							onclick={() => filterTo(null)}
							aria-pressed={shownId === null}
							class="{CHIP} {shownId === null ? SELECTED : IDLE}"
						>
							Tous
							<span
								class="min-w-5 rounded-md px-1.5 text-center text-xs leading-5 {shownId === null
									? 'bg-background/20'
									: 'bg-muted'}">{totalParties}</span
							>
						</button>
					</li>
					{#each serviceSeatings as seating (seating.id)}
						{@const active = seating.id === shownId}
						{@const time = seatingTime(seating, timeZone)}
						<li>
							<button
								type="button"
								onclick={() => filterTo(seating.id)}
								aria-pressed={active}
								aria-current={seating.id === currentId ? 'time' : undefined}
								aria-label="{time} : {expectedCount(seating)} {expectedCount(seating) === 1
									? 'réservation'
									: 'réservations'}"
								class="{CHIP} {active ? SELECTED : IDLE} {expectedCount(seating) === 0 && !active
									? 'text-muted-foreground'
									: ''}"
							>
								{#if seating.id === currentId}
									<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
								{/if}
								{time}
								{#if seating.parties.length > 0}
									<span
										class="min-w-5 rounded-md px-1.5 text-center text-xs leading-5 {active
											? 'bg-background/20'
											: 'bg-muted'}">{expectedCount(seating)}</span
									>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</div>

	{#if query.trim()}
		<p class="text-sm text-muted-foreground" aria-live="polite">
			{found === 0
				? `Aucune réservation ne correspond à « ${query.trim()} ».`
				: `${found} réservation${found === 1 ? '' : 's'} pour « ${query.trim()} ».`}
			<button
				type="button"
				onclick={() => (query = '')}
				class="ml-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
			>
				Tout afficher
			</button>
		</p>
	{/if}

	{#if list.seatings.length === 0}
		<div class="rounded-lg border border-border-card bg-background p-8 text-center">
			<p class="text-muted-foreground">Aucun service ce jour.</p>
		</div>
	{/if}

	{#if unsettledOnly && shownView === 'arrivees'}
		<!-- Flat, never folded: exactly the Service's arrived parties with a
	     Balance still to collect. -->
		{#if dueParties.length === 0}
			<div class="rounded-lg border border-border-card bg-background p-8 text-center">
				<p class="text-muted-foreground">Aucun solde à récolter pour le moment.</p>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each dueParties as party, i (party.id ?? i)}
					<li>
						<PartyCard
							{party}
							{fields}
							{timeZone}
							canCheckIn={canCheckIn}
							canCorrect={canCorrect}
							canSettle={canSettle}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		{#each seatings as seating (seating.id)}
		{@const capacity = capacityLabel(seating)}
		{@const time = seatingTime(seating, timeZone)}
		<section class="space-y-2" aria-labelledby="seating-{seating.id}">
			<!-- The time, then how many are booked: an outlined figure, red over capacity. -->
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-card pb-2">
				<h2 id="seating-{seating.id}" class="text-lg leading-none font-semibold tabular-nums text-foreground">
					{#if query.trim() && services.length > 1}<span class="font-normal text-muted-foreground"
							>{serviceLabel(seating.serviceKind)} ·</span
						>{/if}
					{time}
				</h2>
				{#if seating.titleFr}
					<span class="text-sm text-muted-foreground">{seating.titleFr}</span>
				{/if}
				<p
					class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums {capacity.over
						? 'border-red-600 text-red-600'
						: 'border-border-card text-muted-foreground'}"
				>
					<Users size={14} aria-hidden="true" />
					{capacity.text} personnes
				</p>
			</div>

			{#if shownView === 'arrivees'}
				{@const stillExpected = seating.parties.filter(isExpected)}
				{@const folded = seating.parties
					.filter((p) => !isExpected(p))
					.slice()
					.sort(
						(a, b) =>
							(b.lastCheckInAt ? new Date(b.lastCheckInAt).getTime() : 0) -
							(a.lastCheckInAt ? new Date(a.lastCheckInAt).getTime() : 0)
					)}
				{#if folded.length > 0}
					<!-- The arrivals fold into one line under the Seating header, last in
					     first, so the list shrinks as the Day goes. -->
					<details class="group">
						<summary
							class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border-card bg-muted/40 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none [&::-webkit-details-marker]:hidden"
						>
							<Check class="size-4 shrink-0" aria-hidden="true" />
							<span class="shrink-0 font-semibold tabular-nums">
								{folded.length === 1 ? '1 arrivée' : `${folded.length} arrivées`}
							</span>
							<span class="shrink-0 text-muted-foreground tabular-nums">
								· {guests(folded.reduce((n, p) => n + (p.quantity ?? 0), 0))}
							</span>
							<span class="min-w-0 flex-1 truncate text-muted-foreground">
								· {folded.map((p) => p.guestName).join(', ')}
							</span>
							<ChevronDown
								class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
								aria-hidden="true"
							/>
						</summary>
						<ul class="mt-2 space-y-2">
							{#each folded as party, i (party.id ?? i)}
								<li>
									<PartyCard {party} {fields} {timeZone} canCheckIn={canCheckIn} canCorrect={canCorrect} canSettle={canSettle} />
								</li>
							{/each}
						</ul>
					</details>
				{/if}
				{#if stillExpected.length > 0}
					<ul class="space-y-2">
						{#each stillExpected as party, i (party.id ?? i)}
							<li>
								<PartyCard {party} {fields} {timeZone} canCheckIn={canCheckIn} canCorrect={canCorrect} canSettle={canSettle} />
							</li>
						{/each}
					</ul>
				{/if}
			{:else if seating.parties.length > 0}
				<!-- The kitchen's view: every party and its size, the Dietary Requirements outlined. -->
				<ul class="divide-y divide-border-card rounded-lg border border-border-card bg-background">
					{#each seating.parties as party, i (party.id ?? i)}
						<li class="space-y-1.5 px-4 py-3">
							<p class="text-sm text-foreground">
								<span class="font-semibold">{party.guestName}</span>
								{#if party.quantity !== undefined}
									<span class="text-muted-foreground">· {guests(party.quantity)}</span>
								{/if}
							</p>
							{#if party.dietaryRequirements?.trim()}
								<p class="flex gap-2.5 font-medium break-words text-foreground">
									<ChefHat size={16} class="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
									<span class="min-w-0">{party.dietaryRequirements}</span>
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			</section>
		{/each}
	{/if}
</div>
