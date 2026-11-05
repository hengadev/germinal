<script lang="ts">
	// « Votre réservation », as on any checkout: what is booked, the lines
	// of the bill, the total, then what is paid now and what is left for
	// the day. Beside the form from lg (sticky), above the button on a
	// phone.
	import { t } from 'svelte-i18n';
	import type { EventPage } from '$lib/utils/event-page';
	import type { Choice } from './choice.svelte';
	import { bill, guestsWord, type BookingExtra } from '$lib/utils/inline-booking';

	let {
		view,
		choice,
		extras = [],
		mealName = '',
		class: className = '',
	}: { view: EventPage; choice: Choice; extras?: BookingExtra[]; mealName?: string; class?: string } = $props();

	const b = $derived(bill(view, choice, extras, mealName));
	const waitlist = $derived(choice.seating?.state === 'waitlist');
	const priced = $derived(choice.ready && !waitlist && b.unit > 0);

	const row = 'flex items-baseline justify-between gap-6 tabular-nums';
</script>

<div class="bg-surface px-6 py-7 {className}">
	<p class="font-serif text-xl">{$t('events.booking.summaryTitle')}</p>

	{#if choice.day}
		<div class="mt-3 text-sm leading-relaxed">
			<p class="first-letter:uppercase">{choice.day.label}</p>
			<p class="text-foreground-alt">
				{[choice.service?.label, choice.seating?.start, guestsWord($t, choice.guests)].filter(Boolean).join(' · ')}
			</p>
			{#if choice.seating?.title}<p class="text-foreground-alt">{choice.seating.title}</p>{/if}
		</div>
	{/if}

	{#if priced}
		<div class="mt-6 flex flex-col gap-1.5 text-sm">
			{#each b.lines as line, i (i)}
				<p class={row}><span>{line.label}</span><span>{b.money(line.amount)}</span></p>
			{/each}
			{#if b.promo && b.price.discount > 0}
				<p class={row}><span>{b.promo.code}</span><span>−{b.money(b.price.discount)}</span></p>
			{/if}
		</div>
		<p class="{row} mt-4 font-medium">
			<span>{$t('events.booking.total')}</span><span>{b.money(b.price.total)}</span>
		</p>
		<div class="mt-6 flex flex-col gap-1.5">
			{#if b.price.deposit === 0}
				<p class="{row} text-sm text-foreground-alt"><span>{$t('events.booking.nothingNow')}</span></p>
			{:else}
				{#if b.card > 0}
					<p class="{row} text-sm"><span>{b.giftCard?.code}</span><span>−{b.money(b.card)}</span></p>
				{/if}
				<p class="{row} text-lg font-medium">
					<span class="text-base">{b.price.balance > 0 ? $t('events.booking.payNowDeposit') : $t('events.booking.payNowAll')}</span><span>{b.money(b.payNow)}</span>
				</p>
				{#if b.price.balance > 0}
					<p class="{row} text-sm text-foreground-alt"><span>{$t('events.booking.payLater')}</span><span>{b.money(b.price.balance)}</span></p>
				{/if}
			{/if}
		</div>
	{:else if waitlist}
		<p class="mt-4 text-sm text-foreground-alt">{$t('events.booking.waitlistFree')}</p>
	{:else}
		<p class="mt-4 text-sm text-foreground-alt">{$t('events.booking.summaryEmpty')}</p>
		<p class="mt-1 text-sm">{view.priceLine}</p>
	{/if}
</div>
