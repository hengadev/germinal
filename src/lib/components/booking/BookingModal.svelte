 <script lang="ts">
	import { X, User, Mail, Phone, Ticket, AlertCircle, Loader2 } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Drawer from '$lib/components/ui/Drawer.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { formatCurrency } from '$lib/utils/currency';
	import { t, locale } from 'svelte-i18n';
	import { seatingTitle } from '$lib/utils/seating-title';
	import { formatSeatingDate, formatSeatingTime } from '$lib/utils/event-time';
	import { FULL_PAYMENT_DEPOSIT, priceReservation, type DepositRule } from '$lib/utils/pricing';
	import DepositBreakdown from './DepositBreakdown.svelte';
	import RefundPolicyNote from './RefundPolicyNote.svelte';
	import { EMPTY_MANUAL_REFUND_POLICY, type RefundPolicy } from '$lib/utils/refund-policy';

	type NotificationPreference = 'email' | 'sms' | 'both';

	interface Session {
		id: string;
		title?: string;
		titleEn?: string;
		titleFr?: string;
		priceAmount: number;
		currency: string;
		availableCapacity: number;
		startTime: string;
		endTime: string;
	}

	let {
		isOpen = $bindable(),
		session,
		eventTitle,
		eventId,
		timeZone,
		deposit = FULL_PAYMENT_DEPOSIT,
		refundPolicy = EMPTY_MANUAL_REFUND_POLICY
	}: {
		isOpen: boolean;
		session: Session;
		eventTitle: string;
		eventId: string;
		/** The Event's Time Zone (ADR 0006): times show the venue's clock. */
		timeZone: string;
		/** The Event's Deposit rule (issue 023). */
		deposit?: DepositRule;
		/** The Event's Refund Policy (issue 027), shown before paying. */
		refundPolicy?: RefundPolicy;
	} = $props();

	// Helper to get localized session title
	// Untitled Seatings get the label derived from Day, Service and time.
	function getSessionTitle(session: Session): string {
		const isEn = $locale === 'en';
		return seatingTitle(
			{
				titleEn: session.titleEn || session.title,
				titleFr: session.titleFr || session.title,
				startTime: session.startTime,
			},
			isEn ? 'en' : 'fr',
			{ timeZone }
		);
	}

	// Form state
	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let quantity = $state(1);
	let notificationPreference = $state<NotificationPreference>('both');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	// Detect mobile
	let isMobile = $state(browser && window.innerWidth < 768);

	// Setup resize listener with proper cleanup
	$effect(() => {
		if (!browser) return;

		const handleResize = () => {
			isMobile = window.innerWidth < 768;
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Total, Deposit and Balance — same Pricing as the checkout (issue 023)
	let price = $derived(priceReservation({ unitPrice: session.priceAmount, seats: quantity, deposit }));
	let totalAmount = $derived(price.total);

	// Validate form
	let isFormValid = $derived(
		name.trim().length > 0 &&
		email.trim().length > 0 &&
		email.includes('@') &&
		quantity >= 1 &&
		quantity <= Math.min(session.availableCapacity, 10)
	);

	async function handleSubmit() {
		if (!isFormValid) return;

		isSubmitting = true;
		error = null;

		try {
			const response = await fetch('/api/reservations/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				},
				body: JSON.stringify({
					sessionId: session.id,
					email: email.trim(),
					name: name.trim(),
					phone: phone.trim() || undefined,
					quantity,
					notificationPreference,
					honeypot: '' // Anti-spam field
				})
			});

			const data = await response.json();

			if (!response.ok) {
				const userMessage = (() => {
					switch (data.code) {
						case 'SOLD_OUT': return $t('booking.errors.soldOut');
						case 'SESSION_STARTED': return $t('booking.errors.sessionStarted');
						case 'NOT_FOUND': return $t('booking.errors.sessionNotFound');
						case 'RATE_LIMIT_EXCEEDED': return $t('booking.errors.rateLimit');
						default: return $t('booking.errors.generic');
					}
				})();
				throw new Error(userMessage);
			}

			// Reservation created — redirect to Stripe's hosted checkout page to
			// pay the Deposit, or, with no Deposit, straight to the confirmed Ticket.
			window.location.href = data.checkoutUrl ?? data.ticketUrl;

		} catch (err) {
			console.error('Booking error:', err);
			error = err instanceof Error ? err.message : $t('booking.errors.generic');
			isSubmitting = false;
		}
	}

	function close() {
		if (!isSubmitting) {
			isOpen = false;
		}
	}
</script>

{#snippet formContent()}
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="grid gap-6">
		<!-- Session Info -->
		<div class="bg-surface rounded-lg p-4">
			<div class="text-sm text-muted-foreground mb-1">{eventTitle}</div>
			<div class="font-semibold text-foreground">{getSessionTitle(session)}</div>
			<div class="text-sm text-muted-foreground mt-1">
				{formatSeatingDate(session.startTime, timeZone, $locale === 'en' ? 'en' : 'fr', {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
				})}, {formatSeatingTime(session.startTime, timeZone, $locale === 'en' ? 'en' : 'fr')}
			</div>
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

		<!-- Phone Field (Optional) -->
		<div>
			<label for="phone" class="block text-sm font-medium text-foreground-alt mb-2">
				{$t('booking.phone')} <span class="text-muted-foreground text-xs">{$t('booking.optional')}</span>
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
				<button
					type="button"
					onclick={() => notificationPreference = 'email'}
					class="px-3 py-2 text-sm border rounded-lg transition-colors {
						notificationPreference === 'email'
							? 'bg-foreground text-white border-foreground'
							: 'border-border-input text-foreground-alt hover:bg-surface'
					}"
					disabled={isSubmitting}
				>
					{$t('booking.notifEmail')}
				</button>
				<button
					type="button"
					onclick={() => notificationPreference = 'sms'}
					class="px-3 py-2 text-sm border rounded-lg transition-colors {
						notificationPreference === 'sms'
							? 'bg-foreground text-white border-foreground'
							: 'border-border-input text-foreground-alt hover:bg-surface'
					}"
					disabled={isSubmitting}
				>
					{$t('booking.notifSms')}
				</button>
				<button
					type="button"
					onclick={() => notificationPreference = 'both'}
					class="px-3 py-2 text-sm border rounded-lg transition-colors {
						notificationPreference === 'both'
							? 'bg-foreground text-white border-foreground'
							: 'border-border-input text-foreground-alt hover:bg-surface'
					}"
					disabled={isSubmitting}
				>
					{$t('booking.notifBoth')}
				</button>
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
					max={Math.min(session.availableCapacity, 10)}
					required
					disabled={isSubmitting}
					class="w-full pl-10 pr-4 py-2.5 border border-border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm disabled:bg-surface disabled:cursor-not-allowed"
				/>
			</div>
			<p class="text-xs text-muted-foreground mt-1">
				{$t('booking.maxTickets', { values: { max: Math.min(session.availableCapacity, 10) } })}
			</p>
		</div>

		<!-- Total -->
		<div class="bg-surface rounded-lg p-4">
			<div class="flex items-center justify-between mb-2">
				<span class="text-muted-foreground">{$t('booking.tickets', { values: { qty: quantity } })}</span>
				<span class="text-foreground">{formatCurrency(totalAmount, session.currency, $locale ?? undefined)}</span>
			</div>
			<div class="border-t border-border-card pt-2 mt-2 flex items-center justify-between">
				<span class="font-semibold text-foreground">{$t('booking.total')}</span>
				<span class="font-bold text-xl text-foreground">
					{formatCurrency(totalAmount, session.currency, $locale ?? undefined)}
				</span>
			</div>
			<DepositBreakdown {price} currency={session.currency} />
		</div>

		<!-- What happens to the payment on cancellation (issue 027) -->
		{#if price.deposit > 0}
			<RefundPolicyNote policy={refundPolicy} fullPayment={price.balance === 0} />
		{/if}

		<!-- Submit Buttons -->
		<div class="flex items-center justify-end gap-3 pt-4">
			<button
				type="button"
				onclick={close}
				disabled={isSubmitting}
				class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-surface transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{$t('booking.cancel')}
			</button>
			<button
				type="submit"
				disabled={!isFormValid || isSubmitting}
				class="inline-flex items-center gap-2 px-6 py-2.5 bg-foreground text-white rounded-lg hover:bg-foreground-alt transition-colors font-medium disabled:bg-muted-foreground disabled:cursor-not-allowed"
			>
				{#if isSubmitting}
					<Loader2 size={18} class="animate-spin" />
					{$t('booking.processing')}
				{:else}
					{price.deposit === 0 ? $t('booking.confirmBooking') : price.balance > 0 ? $t('booking.continueToPayDeposit') : $t('booking.continueToPay')}
				{/if}
			</button>
		</div>
	</form>
{/snippet}

{#if isMobile}
	<Drawer bind:isOpen>
		<div class="sticky top-0 bg-white pb-4 border-b border-border-card -mx-4 px-4 -mt-4 pt-4 z-10">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-xl font-semibold">{$t('booking.title')}</h2>
				<button
					type="button"
					onclick={close}
					disabled={isSubmitting}
					class="p-2 hover:bg-surface-hover rounded-md transition-colors disabled:opacity-50"
				>
					<X size={20} />
				</button>
			</div>
			<p class="text-muted-foreground text-sm">{$t('booking.description')}</p>
		</div>
		<div class="pt-4">
			{@render formContent()}
		</div>
	</Drawer>
{:else}
	<Modal
		bind:isOpen
		title={$t('booking.title')}
		description={$t('booking.description')}
	>
		{@render formContent()}
	</Modal>
{/if}
