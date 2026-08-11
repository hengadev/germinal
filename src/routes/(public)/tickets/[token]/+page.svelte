<script lang="ts">
	import { Download, Printer, CheckCircle2, Clock, MapPin, Calendar, User, Mail, Ticket, CreditCard, AlertCircle, X, XCircle, Loader2 } from 'lucide-svelte';
	import { locale, t } from 'svelte-i18n';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { page } from '$app/state';
	import { reveal } from '$lib/actions/reveal';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';

	let { data }: { data: PageData } = $props();

	// --- Self-service cancellation ---
	type CancellationCheckState = 'idle' | 'loading' | 'eligible' | 'ineligible' | 'error';

	let cancellationState = $state<CancellationCheckState>('idle');
	let cancellationReason = $state<string | null>(null);
	let showCancelModal = $state(false);
	let isCancelling = $state(false);
	let cancelError = $state<string | null>(null);
	let cancelSuccess = $state(false);
	let refundAmount = $state<number | null>(null);

	let hasPayment = $derived(data.reservation.payment !== null && data.reservation.totalAmount > 0);

	// The backend only returns a reason once the confirmed-status check has already passed,
	// so in practice the remaining failure case is the 24h window — but fall back to a
	// generic message for anything else so we never show a misleading explanation.
	let ineligibleMessageKey = $derived.by(() => {
		if (cancellationReason && /24\s*hours?/i.test(cancellationReason)) {
			return 'tickets.cancellation.windowClosed';
		}
		return 'tickets.cancellation.genericNotEligible';
	});

	onMount(() => {
		if (data.reservation.status === 'confirmed') {
			checkCancellationEligibility();
		}
	});

	async function checkCancellationEligibility() {
		cancellationState = 'loading';
		try {
			const response = await fetch(`/api/reservations/${data.reservation.accessToken}/cancel`);
			const result = await response.json();

			if (!response.ok) {
				cancellationState = 'error';
				return;
			}

			cancellationReason = result.reason ?? null;
			cancellationState = result.canCancel ? 'eligible' : 'ineligible';
		} catch (err) {
			console.error('Failed to check cancellation eligibility:', err);
			cancellationState = 'error';
		}
	}

	function openCancelModal() {
		cancelError = null;
		showCancelModal = true;
	}

	function closeCancelModal() {
		if (!isCancelling) {
			showCancelModal = false;
		}
	}

	async function confirmCancellation() {
		isCancelling = true;
		cancelError = null;

		try {
			const response = await fetch(`/api/reservations/${data.reservation.accessToken}/cancel`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				}
			});
			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || $t('tickets.cancellation.errorGeneric'));
			}

			// Capture refund details before invalidateAll refreshes `data`.
			refundAmount = hasPayment ? data.reservation.totalAmount : null;
			showCancelModal = false;
			cancelSuccess = true;
			cancellationState = 'idle';

			await invalidateAll();
		} catch (err) {
			cancelError = err instanceof Error ? err.message : $t('tickets.cancellation.errorGeneric');
		} finally {
			isCancelling = false;
		}
	}

	const showSuccess = page.url.searchParams.get('success') === 'true';
	const paymentFailed = page.url.searchParams.get('payment_failed') === 'true';
	const paymentErrorMessage = page.url.searchParams.get('error') || $t('tickets.paymentFailed.defaultError');

	let showPaymentFailure = $state(paymentFailed && data.reservation.status === 'expired');

	function dismissFailure() {
		showPaymentFailure = false;
	}

	function formatDateTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function downloadCalendar() {
		const icsContent = generateICS();
		const blob = new Blob([icsContent], { type: 'text/calendar' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ticket-${data.reservation.session.event.slug}.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function escapeICS(text: string): string {
		return text
			.replace(/\\/g, '\\\\')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,')
			.replace(/\n/g, '\\n');
	}

	function generateICS(): string {
		const event = data.reservation.session;
		const startDate = new Date(event.startTime);
		const endDate = new Date(event.endTime);

		const formatICSDate = (date: Date) => {
			return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
		};

		const isFr = $locale === 'fr';
		const locationStr = isFr
			? (event.event.locationFr ?? event.event.locationEn ?? '')
			: (event.event.locationEn ?? event.event.locationFr ?? '');

		const description = `Your ticket for ${event.event.title}\\nQuantity: ${data.reservation.quantity}\\nConfirmation: ${data.reservation.id}`;

		return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Germinal//Ticket//EN
BEGIN:VEVENT
UID:${data.reservation.id}@germinal.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${escapeICS(`${event.event.title} - ${isFr ? event.titleFr : event.titleEn}`)}
DESCRIPTION:${escapeICS(description)}
LOCATION:${escapeICS(locationStr)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
	}

	function getStatusBadge(status: string) {
		switch (status) {
			case 'confirmed':
				return { textKey: 'tickets.status.confirmed', class: 'bg-green-900/40 text-green-300', icon: CheckCircle2 };
			case 'pending':
				return { textKey: 'tickets.status.pendingPayment', class: 'bg-yellow-900/40 text-yellow-300', icon: Clock };
			case 'cancelled':
				return { textKey: 'tickets.status.cancelled', class: 'bg-red-900/40 text-red-300', icon: null };
			case 'expired':
				return { textKey: 'tickets.status.expired', class: 'bg-red-900/40 text-red-300', icon: AlertCircle };
			default:
				return { textKey: null, text: status, class: 'bg-white/10 text-white/60', icon: null };
		}
	}

	let statusBadge = $derived(getStatusBadge(data.reservation.status));

	let isFr = $derived($locale === 'fr');

	let venueName = $derived(
		isFr
			? (data.reservation.session.event.venueNameFr ?? data.reservation.session.event.venueNameEn)
			: (data.reservation.session.event.venueNameEn ?? data.reservation.session.event.venueNameFr)
	);
	let streetAddress = $derived(
		isFr
			? (data.reservation.session.event.streetAddressFr ?? data.reservation.session.event.streetAddressEn)
			: (data.reservation.session.event.streetAddressEn ?? data.reservation.session.event.streetAddressFr)
	);
	let city = $derived(
		isFr
			? (data.reservation.session.event.cityFr ?? data.reservation.session.event.cityEn)
			: (data.reservation.session.event.cityEn ?? data.reservation.session.event.cityFr)
	);
	let country = $derived(
		isFr
			? (data.reservation.session.event.countryFr ?? data.reservation.session.event.countryEn)
			: (data.reservation.session.event.countryEn ?? data.reservation.session.event.countryFr)
	);
	let locationFallback = $derived(
		isFr
			? (data.reservation.session.event.locationFr ?? data.reservation.session.event.locationEn)
			: (data.reservation.session.event.locationEn ?? data.reservation.session.event.locationFr)
	);

	let googleCalendarUrl = $derived.by(() => {
		const session = data.reservation.session;
		const startDate = new Date(session.startTime);
		const endDate = new Date(session.endTime);
		const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
		const location = isFr
			? (session.event.locationFr ?? session.event.locationEn ?? '')
			: (session.event.locationEn ?? session.event.locationFr ?? '');
		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: `${session.event.title} — ${isFr ? session.titleFr : session.titleEn}`,
			dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
			details: `${isFr ? 'Billet pour' : 'Ticket for'} ${session.event.title}\n${isFr ? 'Quantité' : 'Quantity'}: ${data.reservation.quantity}\n${isFr ? 'Confirmation' : 'Confirmation'}: ${data.reservation.id}`,
			location
		});
		return `https://calendar.google.com/calendar/render?${params.toString()}`;
	});
</script>

<svelte:head>
	<title>{$t('tickets.pageTitle', { values: { eventTitle: data.reservation.session.event.title } })}</title>
</svelte:head>

<div class="min-h-screen bg-surface/30 py-12">
	<div class="container mx-auto px-4 max-w-2xl">
		<!-- Success Banner -->
		{#if showSuccess}
			<div class="bg-green-50 border border-green-200 rounded-xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden" use:reveal={{ preset: 'fade-down' }}>
				<div class="flex items-start gap-3">
					<CheckCircle2 size={28} class="text-green-600 flex-shrink-0 mt-0.5" />
					<div>
						<h2 class="text-lg font-serif text-green-900 mb-0.5">{$t('tickets.success.title')}</h2>
						<p class="text-sm text-green-700">
							{$t('tickets.success.description', { values: { email: data.reservation.guestEmail } })}
						</p>
					</div>
				</div>
				<a
					href="/events"
					class="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-white rounded-none hover:bg-foreground-alt transition-colors font-medium text-sm whitespace-nowrap"
				>
					{$t('tickets.success.browseMore')}
				</a>
			</div>
		{/if}

		<!-- Payment Failure Banner -->
		{#if showPaymentFailure}
			<div class="bg-red-50 border border-red-200 rounded-xl p-5 mb-8 print:hidden" use:reveal={{ preset: 'fade-down' }}>
				<div class="flex items-start gap-3">
					<AlertCircle size={28} class="text-red-600 flex-shrink-0 mt-0.5" />
					<div class="flex-1">
						<h2 class="text-lg font-serif text-red-900 mb-0.5">{$t('tickets.paymentFailed.title')}</h2>
						<p class="text-sm text-red-700 mb-4">{paymentErrorMessage}</p>
						<div class="flex items-center gap-3">
							<a
								href="/events"
								class="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-white rounded-none hover:bg-foreground-alt transition-colors font-medium text-sm"
							>
								{$t('tickets.paymentFailed.browseOther')}
							</a>
							<button
								onclick={dismissFailure}
								class="text-muted-foreground hover:text-foreground font-medium text-sm"
							>
								{$t('tickets.paymentFailed.dismiss')}
							</button>
						</div>
					</div>
					<button onclick={dismissFailure} class="text-red-400 hover:text-red-600">
						<X size={20} />
					</button>
				</div>
			</div>
		{/if}

		<!-- Ticket Card -->
		<div class="bg-white rounded-xl border border-border-card shadow-mini overflow-hidden print:break-inside-avoid" use:reveal={{ preset: 'fade-up' }}>

			<!-- Header -->
			<div class="bg-foreground text-white px-6 py-7">
				<div class="flex items-start justify-between gap-4 mb-5">
					<div>
						<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{$t('tickets.ticketLabel')}</p>
						<h1 class="text-3xl font-serif leading-tight">{data.reservation.session.event.title}</h1>
						<p class="text-muted-foreground mt-1 text-sm">{isFr ? data.reservation.session.titleFr : data.reservation.session.titleEn}</p>
					</div>
					<span class={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusBadge.class}`}>
						{#if statusBadge.icon}
							<svelte:component this={statusBadge.icon} size={13} />
						{/if}
						{statusBadge.textKey ? $t(statusBadge.textKey) : statusBadge.text}
					</span>
				</div>

				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
					<div class="flex items-center gap-2">
						<Calendar size={15} class="text-muted-foreground flex-shrink-0" />
						<span>{formatDateTime(data.reservation.session.startTime)}</span>
					</div>
					<div class="flex items-center gap-2">
						<MapPin size={15} class="text-muted-foreground flex-shrink-0" />
						<span>{locationFallback}</span>
					</div>
				</div>
			</div>

			<!-- Tear line separator -->
			<div class="relative flex items-center bg-white border-y border-dashed border-border-card">
				<div class="absolute -left-3.5 w-7 h-7 rounded-full bg-surface/30 border border-border-card"></div>
				<div class="absolute -right-3.5 w-7 h-7 rounded-full bg-surface/30 border border-border-card"></div>
			</div>

			<!-- QR Code -->
			<div class="flex flex-col items-center py-8 px-6 bg-white">
				<div class="w-48 h-48 flex items-center justify-center">
					<img
						src={data.qrCode}
						alt="Ticket QR Code"
						class="w-full h-full object-contain"
					/>
				</div>
				<p class="text-center text-xs text-muted-foreground mt-3 max-w-xs">
					{$t('tickets.qrCodeHint')}
				</p>
				<p class="mt-2 text-xs font-mono font-semibold text-muted-foreground tracking-wider">
					{data.reservation.id.substring(0, 8).toUpperCase()}
				</p>
				<p class="hidden print:block mt-1 text-xs font-mono text-muted-foreground tracking-wide">
					{data.reservation.id}
				</p>
			</div>

			<!-- Tear line separator -->
			<div class="relative flex items-center bg-white border-y border-dashed border-border-card">
				<div class="absolute -left-3.5 w-7 h-7 rounded-full bg-surface/30 border border-border-card"></div>
				<div class="absolute -right-3.5 w-7 h-7 rounded-full bg-surface/30 border border-border-card"></div>
			</div>

			<!-- Details -->
			<div class="px-6 py-6 space-y-6">

				<!-- Guest Information -->
				<div>
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
						{$t('tickets.guestInfo')}
					</h3>
					<dl class="divide-y divide-border-card">
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
								<User size={15} class="text-muted-foreground" />
								{$t('tickets.guestName')}
							</dt>
							<dd class="text-sm font-medium text-foreground text-right">{data.reservation.guestName}</dd>
						</div>
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
								<Mail size={15} class="text-muted-foreground" />
								{$t('tickets.guestEmail')}
							</dt>
							<dd class="text-sm font-medium text-foreground text-right break-all">{data.reservation.guestEmail}</dd>
						</div>
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
								<Ticket size={15} class="text-muted-foreground" />
								{$t('tickets.quantity')}
							</dt>
							<dd class="text-sm font-medium text-foreground text-right">
								{$t('tickets.ticketCount', { values: { count: data.reservation.quantity } })}
							</dd>
						</div>
					</dl>
				</div>

				<!-- Payment Information -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
						{$t('tickets.paymentDetails')}
					</h3>
					<dl class="divide-y divide-border-card">
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-muted-foreground">
								<CreditCard size={15} class="text-muted-foreground" />
								{$t('tickets.totalPaid')}
							</dt>
							<dd class="text-sm font-semibold text-foreground">
								{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
							</dd>
						</div>
					</dl>
					{#if data.reservation.payment?.receiptUrl}
						<a
							href={data.reservation.payment.receiptUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
						>
							<CreditCard size={13} />
							{$t('tickets.viewReceipt')}
						</a>
					{/if}
				</div>

				<!-- Event Location -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
						{$t('tickets.eventLocation')}
					</h3>
					<div class="flex items-start gap-2 text-sm text-foreground-alt">
						<MapPin size={15} class="text-muted-foreground flex-shrink-0 mt-0.5" />
						<address class="not-italic leading-relaxed">
							{#if venueName}
								<span class="font-semibold text-foreground block">{venueName}</span>
							{/if}
							{#if streetAddress}
								<span class="block">{streetAddress}</span>
							{/if}
							{#if city || country}
								<span class="block">{[city, country].filter(Boolean).join(', ')}</span>
							{/if}
							{#if !venueName && !streetAddress && !city}
								<span>{locationFallback}</span>
							{/if}
						</address>
					</div>
				</div>

				<!-- Actions -->
				<div class="border-t border-border-card pt-6 space-y-3 print:hidden">
					<p class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{$t('tickets.addToCalendar')}</p>
					<div class="flex gap-3">
						<a
							href={googleCalendarUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-input text-foreground-alt rounded-none hover:bg-surface transition-colors font-medium text-sm"
						>
							<Download size={16} />
							Google Calendar
						</a>
						<button
							onclick={downloadCalendar}
							class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-input text-foreground-alt rounded-none hover:bg-surface transition-colors font-medium text-sm"
						>
							<Download size={16} />
							{$t('tickets.appleOutlook')}
						</button>
					</div>
					<button
						onclick={() => window.print()}
						class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-white rounded-none hover:bg-foreground-alt transition-colors font-medium text-sm"
					>
						<Printer size={16} />
						{$t('tickets.printTicket')}
					</button>
				</div>

				<!-- Cancellation -->
				{#if cancelSuccess}
					<div class="border-t border-border-card pt-6 print:hidden">
						<div class="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3" use:reveal={{ preset: 'fade-up' }}>
							<CheckCircle2 size={20} class="text-green-600 flex-shrink-0 mt-0.5" />
							<div>
								<div class="font-medium text-green-900 text-sm">{$t('tickets.cancellation.successTitle')}</div>
								<p class="text-green-700 text-sm mt-1">
									{#if refundAmount !== null}
										{$t('tickets.cancellation.successWithRefund', { values: { amount: formatCurrency(refundAmount, data.reservation.currency) } })}
									{:else}
										{$t('tickets.cancellation.successNoRefund')}
									{/if}
								</p>
							</div>
						</div>
					</div>
				{:else if data.reservation.status === 'confirmed'}
					<div class="border-t border-border-card pt-6 print:hidden">
						<p class="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
							{$t('tickets.cancellation.sectionTitle')}
						</p>

						{#if cancellationState === 'idle' || cancellationState === 'loading'}
							<div class="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 size={16} class="animate-spin" />
								{$t('tickets.cancellation.checking')}
							</div>
						{:else if cancellationState === 'eligible'}
							<button
								onclick={openCancelModal}
								class="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-700 rounded-none hover:bg-red-50 transition-colors font-medium text-sm"
							>
								<XCircle size={16} />
								{$t('tickets.cancellation.cta')}
							</button>
						{:else if cancellationState === 'ineligible'}
							<div class="flex items-start gap-2 text-sm text-muted-foreground">
								<AlertCircle size={16} class="flex-shrink-0 mt-0.5" />
								<p>{$t(ineligibleMessageKey)}</p>
							</div>
						{:else}
							<div class="flex items-start gap-2 text-sm text-muted-foreground">
								<AlertCircle size={16} class="flex-shrink-0 mt-0.5" />
								<p>{$t('tickets.cancellation.checkError')}</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Cancellation confirmation modal -->
	<Modal
		bind:isOpen={showCancelModal}
		title={$t('tickets.cancellation.modalTitle')}
		description={$t('tickets.cancellation.modalDescription', { values: { eventTitle: data.reservation.session.event.title } })}
	>
		{#if cancelError}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-4">
				<AlertCircle size={20} class="text-red-600 flex-shrink-0 mt-0.5" />
				<div>
					<div class="font-medium text-red-900 text-sm">{$t('tickets.cancellation.errorTitle')}</div>
					<div class="text-red-700 text-sm mt-1">{cancelError}</div>
				</div>
			</div>
		{/if}

		<div class="flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={closeCancelModal}
				disabled={isCancelling}
				class="px-6 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-surface transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{$t('tickets.cancellation.keep')}
			</button>
			<button
				type="button"
				onclick={confirmCancellation}
				disabled={isCancelling}
				class="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:bg-muted-foreground disabled:cursor-not-allowed"
			>
				{#if isCancelling}
					<Loader2 size={18} class="animate-spin" />
					{$t('tickets.cancellation.cancelling')}
				{:else}
					<XCircle size={18} />
					{$t('tickets.cancellation.confirmCta')}
				{/if}
			</button>
		</div>
	</Modal>
</div>

<style>
	@page {
		margin: 1.5cm;
		size: A4 portrait;
	}

	@media print {
		/* ---- Page reset ---- */
		:global(body) {
			background: white !important;
		}

		/* Hide site-wide chrome */
		:global(nav),
		:global(footer),
		:global(.print\:hidden) {
			display: none !important;
		}

		/* Remove outer wrapper spacing */
		.min-h-screen {
			min-height: auto;
			background: white !important;
			padding: 0 !important;
			margin: 0 !important;
		}

		:global(.container) {
			max-width: 100%;
			padding: 0;
		}

		/* ---- Ticket card ---- */
		.bg-white.rounded-xl {
			border: 1px solid #ccc;
			box-shadow: none;
			border-radius: 0;
			opacity: 1 !important;
		}

		/* Header: black text on white, no background colour */
		.bg-foreground {
			background: white !important;
			color: black !important;
			border-bottom: 2px solid black;
		}
		.bg-foreground h1 {
			color: black !important;
		}
		.bg-foreground p,
		.bg-foreground span {
			color: #333 !important;
		}

		/* Status badge: neutral pill */
		.bg-green-900\/40,
		.bg-yellow-900\/40,
		.bg-red-900\/40 {
			background: #eee !important;
			color: black !important;
		}

		/* Tear-line decorative circles: removed */
		.border-y.border-dashed .rounded-full {
			display: none !important;
		}

		/* Tear-line separators: subtle dashed line */
		.border-y.border-dashed {
			border-top: 1px dashed #999 !important;
			border-bottom: 1px dashed #999 !important;
		}

		/* ---- QR code: full width ---- */
		.w-48 {
			width: 100% !important;
			height: auto !important;
			max-width: 400px;
			print-color-adjust: exact;
			-webkit-print-color-adjust: exact;
		}

		/* ---- Black-on-white text ---- */
		.text-foreground {
			color: black !important;
		}
		.text-muted-foreground,
		.text-foreground-alt {
			color: #333 !important;
		}
		.text-muted-foreground {
			color: #555 !important;
		}

		/* Section dividers */
		.border-t {
			border-color: #ccc !important;
		}

		/* Links: no decoration in print */
		a {
			color: black !important;
			text-decoration: none !important;
		}

		/* Prevent page breaks inside the ticket card */
		.print\:break-inside-avoid {
			break-inside: avoid;
		}
	}
</style>
