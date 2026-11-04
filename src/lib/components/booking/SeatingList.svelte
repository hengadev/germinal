<script lang="ts">
	// The Event's Seatings on its page, picked in steps rather than listed
	// all at once: the Day, then the Service (« Déjeuner », « Dîner ») with
	// its price per guest, then the time. The chosen Seating shows its title,
	// description and what is left, with the way to book or join the
	// Waitlist; a VIP Seating's panel inverts to an ink block (DESIGN.md, the
	// Threshold Rule). A choice that can still be booked is picked ahead at
	// each step, so one tap on a Day is enough. What is paid when, the Refund
	// Policy and the dietary question close the list. The page opens the
	// booking or Waitlist dialog.
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { DayView, EventPage, SeatingView, ServiceView } from '$lib/utils/event-page';

	let {
		page,
		/** The Admin preview of a Draft (issue 033): Seatings show, booking does not. */
		preview = false,
		onchoose,
	}: { page: EventPage; preview?: boolean; onchoose: (seating: SeatingView) => void } = $props();

	const label = 'text-xxs font-medium uppercase tracking-[0.15em]';
	/** A flat option holding a visually hidden radio; the picked one takes an ink border. */
	const option =
		'flex cursor-pointer flex-col items-center justify-center gap-0.5 border border-border-input px-3 py-2.5 text-center transition-colors hover:border-foreground/60 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:disabled]:hover:border-border-input has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground';

	/** A Seating the guest can act on: book it, or join its Waitlist. */
	const actionable = (s: SeatingView) => s.bookable || s.state === 'waitlist';
	const serviceActionable = (s: ServiceView) => s.seatings.some(actionable);
	const serviceOver = (s: ServiceView) => s.seatings.length > 0 && s.seatings.every((x) => x.state === 'past');
	const dayOver = (d: DayView) => d.services.length > 0 && d.services.every(serviceOver);

	/** Why nothing can be booked at a Day or Service, in a word. */
	function quietNote(seatings: SeatingView[]): string {
		if (seatings.every((s) => s.state === 'past')) return $t('events.page.seating.ended');
		if (seatings.some((s) => s.state === 'not-open')) return $t('events.page.seating.opensSoon');
		if (seatings.every((s) => s.state === 'full' || s.state === 'past')) return $t('events.page.seating.full');
		return $t('events.page.seating.unavailable');
	}

	/** The short word under a time; the full status shows once it is picked. */
	function timeNote(s: SeatingView): string {
		if (s.state === 'past') return $t('events.page.seating.ended');
		if (s.state === 'full') return $t('events.page.seating.full');
		if (s.state === 'waitlist') return $t('events.page.joinWaitlist');
		if (s.state === 'limited') return s.status;
		return '';
	}

	// One Day is picked ahead; with several, the guest starts there.
	// svelte-ignore state_referenced_locally
	const only = page.days.length === 1 && !dayOver(page.days[0]) ? page.days[0] : null;
	let dayDate = $state(only?.date ?? '');
	let serviceKind = $state<ServiceView['kind'] | ''>('');
	let seatingId = $state('');
	if (only) pickAhead(only);

	const day = $derived(page.days.find((d) => d.date === dayDate));
	const service = $derived(day?.services.find((s) => s.kind === serviceKind));
	const seating = $derived(service?.seatings.find((s) => s.id === seatingId));

	/** The first Seating of a Service that can be acted on, else its first upcoming one. */
	function firstSeating(s: ServiceView): string {
		return (s.seatings.find(actionable) ?? s.seatings.find((x) => x.state !== 'past'))?.id ?? '';
	}

	/**
	 * A new Day keeps the same meal when it can still be booked there;
	 * otherwise its first Service that can, with its first time that can.
	 */
	function pickAhead(d: DayView, keep: ServiceView['kind'] | '' = '') {
		const same = d.services.find((s) => s.kind === keep && serviceActionable(s));
		const chosen = same ?? d.services.find(serviceActionable) ?? d.services.find((s) => !serviceOver(s));
		serviceKind = chosen?.kind ?? '';
		seatingId = chosen ? firstSeating(chosen) : '';
	}

	/** Once a choice opens the next step, bring it into view on a phone. */
	async function reveal(id: string, wasShown: boolean) {
		if (wasShown) return;
		await tick();
		if (!matchMedia('(max-width: 1023px)').matches) return;
		const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
	}

	function chooseDay(d: DayView) {
		const wasShown = Boolean(day);
		dayDate = d.date;
		pickAhead(d, serviceKind);
		reveal('step-service', wasShown);
	}

	function chooseService(s: ServiceView) {
		serviceKind = s.kind;
		seatingId = firstSeating(s);
	}
</script>

<div class="flex flex-col gap-8">
	<fieldset class="flex flex-col gap-3">
		<legend class="{label} mb-3 text-foreground">{$t('events.page.steps.day')}</legend>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each page.days as d (d.date)}
				{@const over = dayOver(d)}
				{@const open = d.services.some(serviceActionable)}
				<label class="{option} min-h-14">
					<input
						type="radio"
						class="sr-only"
						name="seating-day"
						value={d.date}
						checked={dayDate === d.date}
						disabled={over}
						onchange={() => chooseDay(d)}
					/>
					<span class="font-serif text-lg leading-tight text-balance first-letter:uppercase">{d.label}</span>
					{#if !open}
						<span class="text-xs italic text-foreground-alt">{quietNote(d.services.flatMap((s) => s.seatings))}</span>
					{/if}
				</label>
			{/each}
		</div>
	</fieldset>

	{#if day}
		<fieldset id="step-service" class="flex scroll-mt-28 flex-col gap-3">
			<legend class="{label} mb-3 text-foreground">{$t('events.page.steps.service')}</legend>
			<div class="grid grid-cols-2 gap-2">
				{#each day.services as s (s.kind)}
					<label class="{option} min-h-16">
						<input
							type="radio"
							class="sr-only"
							name="seating-service"
							value={s.kind}
							checked={serviceKind === s.kind}
							disabled={serviceOver(s)}
							onchange={() => chooseService(s)}
						/>
						<span class="font-serif text-lg leading-tight">{s.label}</span>
						<span class="text-sm text-foreground-alt">
							{#if serviceActionable(s)}
								<span class="font-mono text-foreground">{s.price}</span>{#if s.priced}{" "}{$t('events.perGuest')}{/if}
							{:else}
								<span class="italic">{quietNote(s.seatings)}</span>
							{/if}
						</span>
					</label>
				{/each}
			</div>
			{#if service?.depositNote}<p class="text-xs text-muted-foreground">{service.depositNote}</p>{/if}
		</fieldset>
	{/if}

	{#if service}
		<fieldset class="flex flex-col gap-3">
			<legend class="{label} mb-3 text-foreground">{$t('events.page.steps.time')}</legend>
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
				{#each service.seatings as s (s.id)}
					{@const note = timeNote(s)}
					<label class="{option} min-h-14">
						<input
							type="radio"
							class="sr-only"
							name="seating-time"
							value={s.id}
							checked={seatingId === s.id}
							disabled={s.state === 'past'}
							onchange={() => (seatingId = s.id)}
						/>
						<span class="font-mono text-sm tabular-nums">{s.start}</span>
						{#if note}<span class="text-xxs leading-tight text-foreground-alt">{note}</span>{/if}
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if seating}
		<div
			aria-live="polite"
			class="flex flex-col gap-4 border-t py-5 {seating.vip ? 'border-transparent bg-foreground px-5 text-white' : 'border-border-card'}"
		>
			<div>
				<p class="font-mono text-sm tabular-nums">
					{seating.start}<span class="opacity-40"> – </span>{seating.end}
				</p>
				{#if seating.title}<p class="mt-1 font-serif text-xl leading-tight">{seating.title}</p>{/if}
				{#if seating.description}
					<p class="mt-2 text-sm leading-relaxed {seating.vip ? 'text-white/70' : 'text-foreground-alt'}">{seating.description}</p>
				{/if}
				<p class="mt-1 text-sm italic {seating.vip ? 'text-white/70' : 'text-foreground-alt'}">{seating.status}</p>
			</div>
			{#if actionable(seating)}
				<button
					type="button"
					onclick={() => onchoose(seating)}
					disabled={preview}
					class="self-start px-6 py-3 text-sm font-medium transition-colors disabled:opacity-40 {seating.vip
						? 'bg-white text-foreground hover:bg-surface'
						: seating.bookable
							? 'bg-foreground text-white hover:bg-foreground-alt'
							: 'border border-border-input-hover hover:border-foreground'}"
				>
					{seating.bookable ? $t('events.page.book') : $t('events.page.joinWaitlist')}
				</button>
			{/if}
		</div>
	{/if}

	{#if page.conditions.length}
		<div class="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
			{#each page.conditions as condition, i (i)}<p>{condition}</p>{/each}
		</div>
	{/if}
</div>
