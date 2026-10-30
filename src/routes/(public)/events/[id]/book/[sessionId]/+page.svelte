<script lang="ts">
	import {
		ArrowLeft,
		User,
		Mail,
		Phone,
		Ticket,
		AlertCircle,
		Loader2,
		CheckCircle2,
		Tag,
		X,
		Utensils
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { formatCurrency } from '$lib/utils/currency';
	import { formatSeatingDate, formatSeatingTime } from '$lib/utils/event-time';
	import { priceReservation } from '$lib/utils/pricing';
	import { DIETARY_REQUIREMENTS_MAX_LENGTH, needsDietaryConsent } from '$lib/utils/dietary-requirements';
	import DepositBreakdown from '$lib/components/booking/DepositBreakdown.svelte';
	import RefundPolicyNote from '$lib/components/booking/RefundPolicyNote.svelte';
	import { t, locale } from 'svelte-i18n';
	import { siteLocale } from '$lib/i18n/index';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let eventTitle = $derived(
		$locale === 'en' ? data.event.titleEn || '' : data.event.titleFr || ''
	);

	type NotificationPreference = 'email' | 'sms' | 'both';

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let quantity = $state(1);
	let notificationPreference = $state<NotificationPreference>('both');
	let isSubmitting = $state(false);

	// Dietary Requirements (issue 041): asked only on an Event that asks,
	// optional, and sent only with the Guest's explicit consent.
	let asksDietaryRequirements = $derived(data.asksDietaryRequirements === true);
	let dietaryRequirements = $state('');
	let dietaryConsent = $state(false);
	let dietaryConsentMissing = $derived(
		asksDietaryRequirements && needsDietaryConsent(dietaryRequirements, dietaryConsent)
	);
	let error = $state<string | null>(null);
	let success = $state(false);

	// Promo code state
	let promoCodeInput = $state('');
	let promoCodeApplying = $state(false);
	let promoCodeError = $state<string | null>(null);
	let appliedPromoCode = $state<{
		code: string;
		discountType: 'percent' | 'amount';
		discountValue: number;
	} | null>(null);

	// Same Pricing as the checkout (issue 023): the Promo Code discounts
	// the meal, the Event's Deposit rule splits the total into the Deposit
	// paid now and the Balance due at the venue.
	let price = $derived(
		priceReservation({
			unitPrice: data.session.priceAmount,
			seats: quantity,
			discount: appliedPromoCode,
			deposit: data.deposit,
		})
	);
	let baseAmount = $derived(price.subtotal);
	let discountAmount = $derived(price.discount);
	let totalAmount = $derived(price.total);

	// Clear promo code when quantity changes (discount might need recalculating)
	$effect(() => {
		quantity; // track quantity
		if (appliedPromoCode) {
			appliedPromoCode = null;
			promoCodeError = null;
		}
	});

	async function applyPromoCode() {
		const code = promoCodeInput.trim().toUpperCase();
		if (!code) return;

		promoCodeApplying = true;
		promoCodeError = null;
		appliedPromoCode = null;

		try {
			const res = await fetch(
				`/api/promo-codes/validate?code=${encodeURIComponent(code)}&sessionId=${encodeURIComponent(data.session.id)}`
			);
			const result = await res.json();

			if (result.valid) {
				appliedPromoCode = {
					code,
					discountType: result.discountType,
					discountValue: result.discountValue,
				};
			} else {
				promoCodeError = result.error ?? $t('booking.promoCode.invalidCode');
			}
		} catch {
			promoCodeError = $t('booking.promoCode.validationError');
		} finally {
			promoCodeApplying = false;
		}
	}

	function removePromoCode() {
		appliedPromoCode = null;
		promoCodeInput = '';
		promoCodeError = null;
	}

	let isFormValid = $derived(
		name.trim().length > 0 &&
			email.trim().length > 0 &&
			email.includes('@') &&
			quantity >= 1 &&
			quantity <= Math.min(data.session.availableCapacity ?? 10, 10) &&
			!dietaryConsentMissing
	);

	async function handleSubmit() {
		if (!isFormValid) return;

		isSubmitting = true;
		error = null;

		if (data.isMockMode) {
			await new Promise((r) => setTimeout(r, 800));
			success = true;
			isSubmitting = false;
			return;
		}

		try {
			const response = await fetch('/api/reservations/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				},
				body: JSON.stringify({
					sessionId: data.session.id,
					email: email.trim(),
					name: name.trim(),
					phone: phone.trim() || undefined,
					quantity,
					notificationPreference,
					// Issue 025: remember the language the Guest booked in.
					locale: siteLocale($locale),
					promoCode: appliedPromoCode?.code ?? undefined,
					...(asksDietaryRequirements && dietaryRequirements.trim()
						? { dietaryRequirements: dietaryRequirements.trim(), dietaryConsent }
						: {}),
					honeypot: ''
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || $t('booking.createError'));
			}

			// Redirect to Stripe's hosted checkout page to pay the Deposit —
			// or, with no Deposit, straight to the already-confirmed Ticket.
			window.location.href = result.checkoutUrl ?? result.ticketUrl;
		} catch (err) {
			error = err instanceof Error ? err.message : $t('booking.createError');
			isSubmitting = false;
		}
	}

	// The Seating's Day and time at the venue (ADR 0006), not the visitor's.
	function formatDateTime(dateString: string): string {
		const lang = $locale === 'fr' ? 'fr' : 'en';
		const day = formatSeatingDate(dateString, data.event.timeZone, lang, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		return `${day}, ${formatSeatingTime(dateString, data.event.timeZone, lang)}`;
	}
</script>

<svelte:head>
	<title>{$t('booking.title')} — {eventTitle} | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-2xl">
	<a
		href="/events/{data.event.id}"
		class="flex items-center gap-2 mb-8 text-muted-foreground hover:text-foreground transition-colors"
	>
		<ArrowLeft size={18} />
		<span>{eventTitle}</span>
	</a>

	{#if success}
		<div class="text-center py-16 grid gap-6">
			<div class="flex justify-center">
				<CheckCircle2 size={64} class="text-green-500" />
			</div>
			<h1 class="text-3xl font-serif">{$t('booking.title')}</h1>
			<p class="text-muted-foreground">
				{data.isMockMode
					? $t('booking.demoSuccessMessage', { values: { email } })
					: $t('booking.emailHint')}
			</p>
			<a
				href="/events/{data.event.id}"
				class="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border-input text-foreground-alt rounded-none hover:bg-surface transition-colors font-medium"
			>
				<ArrowLeft size={18} />
				{$t('booking.backToEvent')}
			</a>
		</div>
	{:else}
		<h1 class="text-3xl font-serif mb-2">{$t('booking.title')}</h1>
		<p class="text-muted-foreground mb-8">{$t('booking.description')}</p>

		{#if data.isMockMode}
			<div
				class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3"
			>
				<AlertCircle size={20} class="text-amber-600 flex-shrink-0 mt-0.5" />
				<p class="text-amber-800 text-sm">{$t('booking.demoNotice')}</p>
			</div>
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="grid gap-6">
			<!-- Session Info -->
			<div class="bg-surface rounded-lg p-4">
				<div class="text-sm text-muted-foreground mb-1">{eventTitle}</div>
				<div class="font-semibold text-foreground">{$locale === 'en' ? data.session.titleEn : data.session.titleFr}</div>
				<div class="text-sm text-muted-foreground mt-1">{formatDateTime(data.session.startTime)}</div>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
					<AlertCircle size={20} class="text-red-600 flex-shrink-0 mt-0.5" />
					<div>
						<div class="font-medium text-red-900 text-sm">{$t('booking.errorTitle')}</div>
						<div class="text-red-700 text-sm mt-1">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Name Field -->
			<div>
				<label for="name" class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.fullName')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<User size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="name"
						type="text"
						bind:value={name}
						required
						placeholder="Jean Dupont"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm disabled:bg-surface disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Email Field -->
			<div>
				<label for="email" class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.email')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Mail size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						placeholder="jean@exemple.com"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm disabled:bg-surface disabled:cursor-not-allowed"
					/>
				</div>
				<p class="text-xs text-muted-foreground mt-1">{$t('booking.emailHint')}</p>
			</div>

			<!-- Phone Field -->
			<div>
				<label for="phone" class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.phone')}
					<span class="text-muted-foreground text-xs">{$t('booking.optional')}</span>
				</label>
				<div class="relative">
					<Phone size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="phone"
						type="tel"
						bind:value={phone}
						placeholder="+33 6 12 34 56 78"
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm disabled:bg-surface disabled:cursor-not-allowed"
					/>
				</div>
			</div>

			<!-- Notification Preference -->
			<div>
				<label class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.notificationsLabel')}
				</label>
				<div class="grid grid-cols-3 gap-2">
					{#each [{ value: 'email', label: $t('booking.notifEmail') }, { value: 'sms', label: $t('booking.notifSms') }, { value: 'both', label: $t('booking.notifBoth') }] as option}
						<button
							type="button"
							onclick={() => (notificationPreference = option.value as NotificationPreference)}
							class="px-3 py-2 text-sm border rounded-lg transition-colors {notificationPreference ===
							option.value
								? 'bg-foreground text-white border-foreground'
								: 'border-border-input text-foreground-alt hover:bg-surface'}"
							disabled={isSubmitting}
						>
							{option.label}
						</button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground mt-1">{$t('booking.notifHint')}</p>
			</div>

			<!-- Quantity Field -->
			<div>
				<label for="quantity" class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.numberOfTickets')} <span class="text-red-500">*</span>
				</label>
				<div class="relative">
					<Ticket size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						id="quantity"
						type="number"
						bind:value={quantity}
						min="1"
						max={Math.min(data.session.availableCapacity ?? 10, 10)}
						required
						disabled={isSubmitting}
						class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm disabled:bg-surface disabled:cursor-not-allowed"
					/>
				</div>
				<p class="text-xs text-muted-foreground mt-1">
					{$t('booking.maxTickets', { values: { max: Math.min(data.session.availableCapacity ?? 10, 10) } })}
				</p>
			</div>

			<!-- Dietary Requirements (issue 041) -->
			{#if asksDietaryRequirements}
				<div>
					<label for="dietaryRequirements" class="block text-sm font-medium text-foreground-alt mb-2">
						{$t('booking.dietary.label')}
						<span class="text-muted-foreground text-xs">{$t('booking.optional')}</span>
					</label>
					<div class="relative">
						<Utensils size={18} class="absolute left-3 top-3 text-muted-foreground" />
						<textarea
							id="dietaryRequirements"
							bind:value={dietaryRequirements}
							rows="2"
							maxlength={DIETARY_REQUIREMENTS_MAX_LENGTH}
							placeholder={$t('booking.dietary.placeholder')}
							disabled={isSubmitting}
							aria-describedby="dietaryRequirementsHint"
							class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm resize-y disabled:bg-surface disabled:cursor-not-allowed"
						></textarea>
					</div>
					<p id="dietaryRequirementsHint" class="text-xs text-muted-foreground mt-1">{$t('booking.dietary.hint')}</p>
					{#if dietaryRequirements.trim()}
						<label class="flex items-start gap-2 mt-3 text-sm text-foreground-alt cursor-pointer">
							<input
								type="checkbox"
								bind:checked={dietaryConsent}
								required
								disabled={isSubmitting}
								class="mt-0.5 w-4 h-4 border-border-input"
							/>
							<span>{$t('booking.dietary.consent')}</span>
						</label>
						{#if dietaryConsentMissing}
							<p class="text-xs text-red-600 mt-1">{$t('booking.dietary.consentRequired')}</p>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Promo code -->
			<div>
				<label class="block text-sm font-medium text-foreground-alt mb-2">
					{$t('booking.promoCode.label')}
					<span class="text-muted-foreground text-xs">{$t('booking.optional')}</span>
				</label>

				{#if appliedPromoCode}
					<div class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
						<div class="flex items-center gap-2 text-green-700 text-sm font-medium">
							<Tag size={15} />
							<span class="font-mono">{appliedPromoCode.code}</span>
							<span class="font-normal text-green-600">
								— {appliedPromoCode.discountType === 'percent'
									? $t('booking.promoCode.discountOff', { values: { value: appliedPromoCode.discountValue } })
									: '−' + formatCurrency(appliedPromoCode.discountValue, data.session.currency, $locale ?? undefined)}
							</span>
						</div>
						<button
							type="button"
							onclick={removePromoCode}
							class="text-green-500 hover:text-green-700 transition-colors ml-2"
							aria-label={$t('booking.promoCode.removeAria')}
						>
							<X size={16} />
						</button>
					</div>
				{:else}
					<div class="flex gap-2">
						<div class="relative flex-1">
							<Tag size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								bind:value={promoCodeInput}
								placeholder={$t('booking.promoCode.placeholder')}
								disabled={isSubmitting}
								class="w-full pl-9 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm font-mono uppercase disabled:bg-surface disabled:cursor-not-allowed {promoCodeError ? 'border-red-300' : 'border-border-input'}"
								oninput={(e) => { promoCodeInput = (e.target as HTMLInputElement).value.toUpperCase(); promoCodeError = null; }}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromoCode(); } }}
							/>
						</div>
						<button
							type="button"
							onclick={applyPromoCode}
							disabled={!promoCodeInput.trim() || promoCodeApplying || isSubmitting}
							class="px-4 py-2.5 border border-border-input text-foreground-alt rounded-none hover:bg-surface transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap inline-flex items-center gap-1.5"
						>
							{#if promoCodeApplying}
								<Loader2 size={15} class="animate-spin" />
							{/if}
							{$t('booking.promoCode.apply')}
						</button>
					</div>
					{#if promoCodeError}
						<p class="text-xs text-red-600 mt-1">{promoCodeError}</p>
					{/if}
				{/if}
			</div>

			<!-- Total -->
			<div class="bg-surface rounded-lg p-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-muted-foreground"
						>{$t('booking.tickets', { values: { qty: quantity } })}</span
					>
					<span class="text-foreground">{formatCurrency(baseAmount, data.session.currency, $locale ?? undefined)}</span>
				</div>
				{#if discountAmount > 0}
					<div class="flex items-center justify-between mb-2 text-green-600 text-sm">
						<span class="flex items-center gap-1">
							<Tag size={13} />
							{$t('booking.promoCode.appliedLabel')} {appliedPromoCode?.code}
						</span>
						<span>−{formatCurrency(discountAmount, data.session.currency, $locale ?? undefined)}</span>
					</div>
				{/if}
				<div class="border-t border-border-card pt-2 mt-2 flex items-center justify-between">
					<span class="font-semibold text-foreground">{$t('booking.total')}</span>
					<span class="font-medium text-xl text-foreground">
						{formatCurrency(totalAmount, data.session.currency, $locale ?? undefined)}
					</span>
				</div>
				<DepositBreakdown {price} currency={data.session.currency} />
			</div>

			<!-- What happens to the payment on cancellation (issue 027) -->
			{#if price.deposit > 0}
				<RefundPolicyNote policy={data.refundPolicy} fullPayment={price.balance === 0} />
			{/if}

			<!-- Submit -->
			<div class="flex items-center justify-end gap-3 pt-2">
				<a
					href="/events/{data.event.id}"
					class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-none hover:bg-surface transition-colors font-medium"
				>
					{$t('booking.cancel')}
				</a>
				<button
					type="submit"
					disabled={!isFormValid || isSubmitting}
					class="inline-flex items-center gap-2 px-6 py-2.5 bg-foreground text-white rounded-none hover:bg-foreground-alt transition-colors font-medium disabled:bg-muted-foreground disabled:cursor-not-allowed"
				>
					{#if isSubmitting}
						<Loader2 size={18} class="animate-spin" />
						{$t('booking.processing')}
					{:else}
						{data.isMockMode
							? $t('booking.bookDemo')
							: price.deposit === 0
								? $t('booking.confirmBooking')
								: price.balance > 0
									? $t('booking.continueToPayDeposit')
									: $t('booking.continueToPay')}
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>
