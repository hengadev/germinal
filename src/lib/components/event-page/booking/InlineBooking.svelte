<script lang="ts">
	// The booking on the Event's page, as on Banc Public: how many → which
	// day → which meal (said, not asked, when the day has one) → what time
	// → the chosen Seating → the guest's details and the button saying what
	// it does. Each answer opens the next step, brought into view on a
	// phone. Beside the steps (from lg), the Menu of the meal picked, and
	// the summary of the booking.
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { EventPage, MenuView, PageDay } from '$lib/utils/event-page';
	import BookingDetails from './BookingDetails.svelte';
	import MenuSheet from '../MenuSheet.svelte';
	import DrinksSheet from '../DrinksSheet.svelte';
	import { Choice } from './choice.svelte';
	import {
		MAX_GUESTS,
		TAP_GUESTS,
		dayFits,
		dayOver,
		fits,
		guestsWord,
		menuFor,
		quietNote,
		quote,
		serviceFits,
		serviceOver,
		shortDay,
		timeNote,
		type BookingExtra,
	} from '$lib/utils/inline-booking';
	import BookingSummary from './BookingSummary.svelte';

	let {
		view,
		schedule,
		menus,
		extras = [],
		asksDietary = false,
		/** The Admin preview of a Draft: the steps are shown, never submitted. */
		preview = false,
	}: {
		view: EventPage;
		schedule: PageDay[];
		menus: MenuView[];
		extras?: BookingExtra[];
		asksDietary?: boolean;
		preview?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	const choice = new Choice(() => view);
	let more = $state(false);

	/** The Menu can change from one day to the next: it shows once the day (and its meal) is known. */
	const menu = $derived(
		choice.day && choice.service ? menuFor(view, schedule, menus, choice.day.date, choice.service.kind) : undefined
	);
	const menuHead = $derived(choice.day && choice.service ? `${choice.service.label} · ${shortDay(choice.day, view.lang)}` : '');
	const q = $derived(choice.ready ? quote(view, choice.seating!, choice.guests) : null);

	/** Under the steps: each meal's deposit is said at the meal, the refund policy in the details. */
	const depositNotes = $derived(new Set(view.days.flatMap((d) => d.services.map((s) => s.depositNote))));
	const conditions = $derived(
		view.conditions.filter(
			(text, i) =>
				!depositNotes.has(text) &&
				!(choice.ready && i > 0 && /rembours|refund/i.test(text)) &&
				!(choice.ready && asksDietary && /allerg/i.test(text))
		)
	);

	/** A step appearing for the first time comes into view on a phone. */
	async function reveal(id: string, wasShown: boolean) {
		if (wasShown) return;
		await tick();
		if (!matchMedia('(max-width: 1023px)').matches) return;
		const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
	}

	const q1 = 'font-serif text-xl mb-3';
	const opt =
		'flex cursor-pointer flex-col items-center justify-center gap-0.5 border border-border-input px-2 py-2.5 text-center transition-colors hover:border-foreground/60 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:disabled]:hover:border-border-input has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground';
</script>

<div class="grid gap-12 lg:grid-cols-[3fr_2fr] lg:gap-20">
	<div class="flex flex-col gap-9">
		<fieldset>
			<legend class={q1}>{$t('events.booking.guestsQ')}</legend>
			<div class="grid grid-cols-7 gap-1.5">
				{#each Array.from({ length: TAP_GUESTS }, (_, i) => i + 1) as n (n)}
					<label class="{opt} h-12 font-mono tabular-nums">
						<input
							type="radio"
							class="sr-only"
							name="b-guests"
							checked={!more && choice.guests === n}
							onchange={() => {
								more = false;
								choice.setGuests(n);
							}}
						/>
						{n}
					</label>
				{/each}
				<label class="{opt} h-12 text-xs">
					<input
						type="radio"
						class="sr-only"
						name="b-guests"
						checked={more}
						onchange={() => {
							more = true;
							choice.setGuests(Math.max(choice.guests, TAP_GUESTS + 1));
						}}
					/>
					{TAP_GUESTS + 1}+
				</label>
			</div>
			{#if more}
				<div class="mt-3 flex items-center gap-3">
					<button
						type="button"
						class="size-11 border border-border-input text-lg hover:border-foreground disabled:opacity-40"
						aria-label={$t('events.booking.oneLess')}
						disabled={choice.guests <= TAP_GUESTS + 1}
						onclick={() => choice.setGuests(choice.guests - 1)}>−</button
					>
					<span class="w-28 text-center font-serif text-lg" aria-live="polite">{guestsWord($t, choice.guests)}</span>
					<button
						type="button"
						class="size-11 border border-border-input text-lg hover:border-foreground disabled:opacity-40"
						aria-label={$t('events.booking.oneMore')}
						disabled={choice.guests >= MAX_GUESTS}
						onclick={() => choice.setGuests(choice.guests + 1)}>+</button
					>
				</div>
				<p class="mt-2 text-sm text-foreground-alt">
					{$t('events.booking.largerParty', { values: { n: MAX_GUESTS } })}
					<a href="/contact" class="underline underline-offset-4">{$t('events.booking.contact')}</a>
				</p>
			{/if}
		</fieldset>

		<fieldset>
			<legend class={q1}>{$t('events.booking.dayQ')}</legend>
			<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
				{#each view.days as d (d.date)}
					{@const ok = dayFits(d, choice.guests)}
					<label class="{opt} min-h-14">
						<input
							type="radio"
							class="sr-only"
							name="b-day"
							checked={choice.dayDate === d.date}
							disabled={!ok}
							onchange={() => {
								const was = Boolean(choice.day);
								choice.pickDay(d);
								reveal('b-meal', was);
							}}
						/>
						<span class="font-serif leading-tight text-balance first-letter:uppercase">{d.label}</span>
						{#if !ok}
							<span class="text-xxs italic">{dayOver(d) ? $t('events.booking.ended') : quietNote(d.services.flatMap((s) => s.seatings), choice.guests, $t)}</span>
						{/if}
					</label>
				{/each}
			</div>
		</fieldset>

		{#if choice.day}
			<fieldset id="b-meal" class="scroll-mt-24">
				{#if choice.day.services.length > 1}
					<legend class={q1}>{$t('events.booking.mealQ')}</legend>
					<div class="grid grid-cols-2 gap-1.5">
						{#each choice.day.services as s (s.kind)}
							{@const ok = serviceFits(s, choice.guests)}
							<label class="{opt} min-h-16">
								<input type="radio" class="sr-only" name="b-meal" checked={choice.kind === s.kind} disabled={!ok} onchange={() => choice.pickService(s)} />
								<span class="font-serif text-lg leading-tight">{s.label}</span>
								<span class="text-xs text-foreground-alt">
									{#if ok}<span class="text-foreground">{s.price}</span> {#if s.priced}{$t('events.booking.perGuest')}{/if}{:else}<span class="italic">{serviceOver(s) ? $t('events.booking.ended') : quietNote(s.seatings, choice.guests, $t)}</span>{/if}
								</span>
							</label>
						{/each}
					</div>
				{:else if choice.service}
					<p class="flex items-baseline justify-between gap-4">
						<span class="font-serif text-lg">{choice.service.label}</span>
						<span class="text-sm text-foreground-alt"><span class="text-foreground">{choice.service.price}</span> {#if choice.service.priced}{$t('events.booking.perGuest')}{/if}</span>
					</p>
				{/if}
				{#if choice.service?.depositNote}<p class="mt-2 text-xs text-muted-foreground">{choice.service.depositNote}</p>{/if}
			</fieldset>
		{/if}

		{#if menu}
			<!-- The Menu of the day picked, in the flow right under the day and meal, as on Banc Public. -->
			{#key menu.name}
				<MenuSheet {menu} heading={menuHead} class="py-6" />
			{/key}
		{/if}

		{#if choice.service && view.drinks}
			<!-- The Drinks card (issue 086), after the Menu: paid on site. -->
			<DrinksSheet drinks={view.drinks} class="py-6" />
		{/if}

		{#if choice.service}
			<fieldset>
				<legend class={q1}>{$t('events.booking.timeQ')}</legend>
				<div class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
					{#each choice.service.seatings as s (s.id)}
						{@const note = timeNote(s, choice.guests, $t)}
						<label class="{opt} min-h-14">
							<input
								type="radio"
								class="sr-only"
								name="b-time"
								checked={choice.seatingId === s.id}
								disabled={!fits(s, choice.guests)}
								onchange={() => {
									const was = choice.ready;
									choice.pickSeating(s);
									reveal('b-details', was);
								}}
							/>
							<span class="font-mono text-sm tabular-nums">{s.start}</span>
							{#if note}<span class="text-xxs leading-tight text-foreground-alt">{note}</span>{/if}
						</label>
					{/each}
				</div>
				{#if choice.seating && (choice.seating.title || choice.seating.description || choice.seating.vip)}
					{@const s = choice.seating}
					<div class="mt-4 flex flex-col gap-1 {s.vip ? 'bg-foreground px-5 py-4 text-white' : 'border-l-2 border-foreground pl-4'}" aria-live="polite">
						<p class="font-mono text-sm tabular-nums">{s.start}<span class="opacity-40"> – </span>{s.end}</p>
						{#if s.title}<p class="font-serif text-xl leading-tight">{s.title}</p>{/if}
						{#if s.description}<p class="text-sm leading-relaxed {s.vip ? 'text-white/70' : 'text-foreground-alt'}">{s.description}</p>{/if}
					</div>
				{/if}
			</fieldset>
		{/if}

		{#if choice.ready}
			<div id="b-details" class="scroll-mt-24">
				<BookingDetails {view} {choice} {extras} {asksDietary} {preview} mealName={menu?.name ?? choice.service?.label ?? ''} />
			</div>
		{/if}

		{#if conditions.length}
			<div class="mt-4 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
				{#each conditions as condition, i (i)}<p>{condition}</p>{/each}
			</div>
		{/if}
	</div>

	<aside class="hidden lg:sticky lg:top-28 lg:block lg:self-start">
		<BookingSummary {view} {choice} {extras} mealName={menu?.name ?? choice.service?.label ?? ''} />
	</aside>
</div>
