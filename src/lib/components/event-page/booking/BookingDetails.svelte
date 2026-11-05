<script lang="ts">
	// Once the Seating is chosen, everything the booking API takes, in the
	// order a guest thinks of it: who (first name and last name apart, so
	// the ticket and Stripe can set each as they like), what to add (the
	// Event's Extras), what the kitchen should know (allergies or a diet,
	// with the consent health data needs), a code, the newsletter. Then, on
	// a phone, the summary of the booking (beside the form from lg), and
	// the one button.
	import { ChevronDown, Minus, Plus } from 'lucide-svelte';
	import { t } from 'svelte-i18n';
	import type { EventPage } from '$lib/utils/event-page';
	import { describeRefundPolicy } from '$lib/utils/refund-policy';
	import type { Choice } from './choice.svelte';
	import { bill, guestsWord, type BookingExtra } from '$lib/utils/inline-booking';
	import BookingSummary from './BookingSummary.svelte';

	let {
		view,
		choice,
		extras = [],
		asksDietary = false,
		/** The Admin preview of a Draft: the steps are shown, never submitted. */
		preview = false,
		/** The Menu's name, else the meal's: « 2 × Déjeuner du foyer ». */
		mealName = '',
	}: {
		view: EventPage;
		choice: Choice;
		extras?: BookingExtra[];
		asksDietary?: boolean;
		preview?: boolean;
		mealName?: string;
	} = $props();

	const s = $derived(choice.seating!);
	const g = $derived(choice.guests);
	const waitlist = $derived(s.state === 'waitlist');

	// ── Who
	let firstName = $state('');
	let lastName = $state('');
	let email = $state('');
	let phone = $state('');

	// ── Extras: a per-person one is for the whole table (yes / no), a
	// per-unit one is counted.
	const b = $derived(bill(view, choice, extras, mealName));
	const qty = (x: BookingExtra) => b.qty(x);
	const money = (n: number) => b.money(n);

	// ── For the kitchen
	let dietary = $state('');
	let dietaryConsent = $state(false);
	const dietaryFilled = $derived(dietary.trim() !== '');

	// ── A code, the newsletter
	let codeOpen = $state(false);
	let code = $state('');
	let newsletter = $state(false);

	const valid = $derived(
		firstName.trim() !== '' && lastName.trim() !== '' && /.+@.+\..+/.test(email.trim()) && (!dietaryFilled || dietaryConsent)
	);

	const price = $derived(b.price);
	const unit = $derived(b.unit);
	const priced = $derived(!waitlist && unit > 0);
	const refund = $derived(describeRefundPolicy(view.refundPolicy, view.lang, { fullPayment: price.balance === 0 }));

	const button = $derived.by(() => {
		if (waitlist) return $t('events.booking.joinWaitlist');
		if (price.deposit === 0) return $t('events.booking.confirm');
		const amount = money(price.deposit);
		return price.balance > 0
			? $t('events.booking.payDeposit', { values: { amount } })
			: $t('events.booking.pay', { values: { amount } });
	});

	const field =
		'w-full border border-border-input bg-transparent px-3 py-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border-input-hover focus:border-foreground';
	const label = 'text-xxs font-medium uppercase tracking-[0.15em]';
	const legend = `${label} mb-4 text-muted-foreground`;
	const box = 'mt-1 size-4 shrink-0 accent-foreground';
	const step =
		'flex size-9 items-center justify-center border border-border-input transition-colors hover:border-foreground disabled:opacity-30 disabled:hover:border-border-input';
</script>

<form
	class="flex flex-col gap-10"
	onsubmit={(e) => {
		e.preventDefault();
		// TODO(080): post the booking (or the Waitlist join) for real, to
		// /api/reservations/create and /api/waitlist/join.
	}}
>
	{#if waitlist}<p class="leading-relaxed text-foreground-alt">{$t('events.booking.waitlistLead')}</p>{/if}

	<!-- Who -->
	<fieldset class="flex flex-col gap-4">
		<legend class={legend}>{$t('events.booking.details')}</legend>
		<div class="grid grid-cols-2 gap-3 sm:gap-4">
			<label class="flex flex-col gap-1.5">
				<span class="text-sm">{$t('events.booking.firstName')}</span>
				<input class={field} bind:value={firstName} autocomplete="given-name" required />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm">{$t('events.booking.lastName')}</span>
				<input class={field} bind:value={lastName} autocomplete="family-name" required />
			</label>
		</div>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm">{$t('events.booking.email')}</span>
			<input class={field} type="email" bind:value={email} autocomplete="email" required />
			<span class="text-xs text-muted-foreground">{$t('events.booking.emailHint')}</span>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm">{$t('events.booking.phone')} <span class="text-muted-foreground">({$t('events.booking.optional')})</span></span>
			<input class={field} type="tel" bind:value={phone} autocomplete="tel" />
			<span class="text-xs text-muted-foreground">{$t('events.booking.phoneHint')}</span>
		</label>
	</fieldset>

	<!-- What to add -->
	{#if extras.length && !waitlist}
		<fieldset class="flex flex-col gap-6">
			<legend class={legend}>{$t('events.booking.add')}</legend>
			{#each extras as x (x.id)}
				{#if x.unit === 'per_person'}
					<label class="flex cursor-pointer items-start gap-3">
						<input type="checkbox" class={box} checked={Boolean(choice.extras[x.id])} onchange={(e) => (choice.extras[x.id] = e.currentTarget.checked ? 1 : 0)} />
						<span class="flex flex-1 flex-col gap-0.5">
							<span class="flex items-baseline justify-between gap-4">
								<span class="font-serif text-lg leading-snug">{x.name}</span>
								<span class="text-sm whitespace-nowrap tabular-nums">{money(x.priceAmount)} <span class="text-foreground-alt">{$t('events.booking.perGuest')}</span></span>
							</span>
							<span class="text-sm text-foreground-alt">{x.description}</span>
							{#if choice.extras[x.id]}<span class="text-sm">{$t('events.booking.forTable', { values: { n: g } })} · {money(x.priceAmount * g)}</span>{/if}
						</span>
					</label>
				{:else}
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
						<span class="flex flex-1 flex-col gap-0.5">
							<span class="flex items-baseline justify-between gap-4">
								<span class="font-serif text-lg leading-snug">{x.name}</span>
								<span class="text-sm whitespace-nowrap tabular-nums">{money(x.priceAmount)} <span class="text-foreground-alt">{$t('events.booking.unitEach')}</span></span>
							</span>
							<span class="text-sm text-foreground-alt">{x.description}</span>
						</span>
						<span class="flex items-center gap-2">
							<button type="button" class={step} aria-label="{x.name} −1" disabled={!choice.extras[x.id]} onclick={() => (choice.extras[x.id] = (choice.extras[x.id] ?? 0) - 1)}><Minus size={14} /></button>
							<span class="w-5 text-center tabular-nums" aria-live="polite">{choice.extras[x.id] ?? 0}</span>
							<button type="button" class={step} aria-label="{x.name} +1" disabled={(choice.extras[x.id] ?? 0) >= 10} onclick={() => (choice.extras[x.id] = (choice.extras[x.id] ?? 0) + 1)}><Plus size={14} /></button>
						</span>
					</div>
				{/if}
			{/each}
		</fieldset>
	{/if}

	<!-- For the kitchen -->
	{#if asksDietary}
		<fieldset class="flex flex-col gap-3">
			<legend class={legend}>{$t('events.booking.kitchen')}</legend>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm">{$t('events.booking.dietary')} <span class="text-muted-foreground">({$t('events.booking.optional')})</span></span>
				<textarea class="{field} min-h-20 resize-y" rows="2" maxlength="500" placeholder={$t('events.booking.dietaryPh')} bind:value={dietary}></textarea>
				<span class="text-xs text-muted-foreground">{$t('events.booking.dietaryHint')}</span>
			</label>
			{#if dietaryFilled}
				<label class="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground-alt">
					<input type="checkbox" class={box} bind:checked={dietaryConsent} />
					<span>{$t('events.booking.consent')}</span>
				</label>
				{#if !dietaryConsent}<p class="text-xs italic text-foreground-alt">{$t('events.booking.consentNeeded')}</p>{/if}
			{/if}
		</fieldset>
	{/if}

	<!-- A code, the newsletter -->
	<div class="flex flex-col gap-5">
		{#if priced}
			<div class="flex flex-col gap-3">
				<button
					type="button"
					class="flex items-center gap-1.5 self-start text-sm underline decoration-border-input-hover underline-offset-4 hover:decoration-foreground"
					aria-expanded={codeOpen}
					aria-controls="b-code-panel"
					onclick={() => {
						codeOpen = !codeOpen;
						if (!codeOpen) code = '';
					}}
				>
					{$t('events.booking.codeQ')}
					<ChevronDown size={14} class="transition-transform {codeOpen ? 'rotate-180' : ''}" aria-hidden="true" />
				</button>
				{#if codeOpen}
					<!-- TODO(080): check the code against the server (a gift card or a promo code). -->
					<div id="b-code-panel" class="flex gap-2">
						<input id="b-code" class="{field} uppercase placeholder:normal-case" bind:value={code} autocomplete="off" aria-label={$t('events.booking.code')} placeholder="GERM-7ZK9-M3XT" />
						<button type="button" class="border border-foreground px-5 text-sm transition-colors hover:bg-foreground hover:text-white" disabled>{$t('events.booking.apply')}</button>
					</div>
				{/if}
			</div>
		{/if}
		<label class="flex cursor-pointer items-start gap-3 text-sm">
			<input type="checkbox" class={box} bind:checked={newsletter} />
			<span>{$t('events.booking.newsletter')}</span>
		</label>
	</div>

	<!-- The amount, then the button -->
	<div class="flex flex-col gap-6">
		<BookingSummary {view} {choice} {extras} {mealName} class="lg:hidden" />

		<div class="flex flex-col gap-3">
			<button
				type="submit"
				disabled={!valid || preview}
				title={preview ? $t('events.page.previewDraft') : undefined}
				class="w-full bg-foreground px-6 py-4 text-sm font-medium text-white transition-colors hover:bg-foreground-alt disabled:bg-muted-foreground"
			>
				{button}
			</button>
			{#if priced && price.deposit > 0 && refund}
				<p class="text-xs leading-relaxed text-pretty text-muted-foreground">{refund}</p>
			{/if}
		</div>
	</div>
</form>
