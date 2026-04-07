<script lang="ts">
	import { Download, Printer, CheckCircle2, Clock, MapPin, Calendar, User, Mail, Ticket, CreditCard, AlertCircle, X } from 'lucide-svelte';
	import { locale, t } from 'svelte-i18n';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { page } from '$app/stores';
	import { reveal } from '$lib/actions/reveal';

	let { data }: { data: PageData } = $props();

	const showSuccess = $page.url.searchParams.get('success') === 'true';
	const paymentFailed = $page.url.searchParams.get('payment_failed') === 'true';
	const paymentErrorMessage = $page.url.searchParams.get('error') || $t('tickets.paymentFailed.defaultError');

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
</script>

<svelte:head>
	<title>{$t('tickets.pageTitle', { values: { eventTitle: data.reservation.session.event.title } })}</title>
</svelte:head>

<div class="min-h-screen bg-dark-50/30 py-12">
	<div class="container mx-auto px-4 max-w-2xl">
		<!-- Success Banner -->
		{#if showSuccess}
			<div class="bg-green-50 border border-green-200 rounded-xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden" use:reveal={{ preset: 'fade-down' }}>
				<div class="flex items-start gap-3">
					<CheckCircle2 size={28} class="text-green-600 flex-shrink-0 mt-0.5" />
					<div>
						<h2 class="text-lg font-bold text-green-900 mb-0.5">{$t('tickets.success.title')}</h2>
						<p class="text-sm text-green-700">
							{$t('tickets.success.description', { values: { email: data.reservation.guestEmail } })}
						</p>
					</div>
				</div>
				<a
					href="/events"
					class="inline-flex items-center gap-2 px-4 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm whitespace-nowrap"
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
						<h2 class="text-lg font-bold text-red-900 mb-0.5">{$t('tickets.paymentFailed.title')}</h2>
						<p class="text-sm text-red-700 mb-4">{paymentErrorMessage}</p>
						<div class="flex items-center gap-3">
							<a
								href="/events"
								class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
							>
								{$t('tickets.paymentFailed.browseOther')}
							</a>
							<button
								onclick={dismissFailure}
								class="text-dark-600 hover:text-dark-900 font-medium text-sm"
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
		<div class="bg-white rounded-xl border border-border-card shadow-sm overflow-hidden print:break-inside-avoid" use:reveal={{ preset: 'fade-up' }}>

			<!-- Header -->
			<div class="bg-dark-900 text-white px-6 py-7">
				<div class="flex items-start justify-between gap-4 mb-5">
					<div>
						<p class="text-xs font-semibold uppercase tracking-widest text-dark-400 mb-1.5">{$t('tickets.ticketLabel')}</p>
						<h1 class="text-2xl font-bold leading-tight">{data.reservation.session.event.title}</h1>
						<p class="text-dark-300 mt-1 text-sm">{isFr ? data.reservation.session.titleFr : data.reservation.session.titleEn}</p>
					</div>
					<span class={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusBadge.class}`}>
						{#if statusBadge.icon}
							<svelte:component this={statusBadge.icon} size={13} />
						{/if}
						{statusBadge.textKey ? $t(statusBadge.textKey) : statusBadge.text}
					</span>
				</div>

				<div class="flex flex-col sm:flex-row gap-3 text-sm text-dark-200">
					<div class="flex items-center gap-2">
						<Calendar size={15} class="text-dark-400 flex-shrink-0" />
						<span>{formatDateTime(data.reservation.session.startTime)}</span>
					</div>
					<div class="hidden sm:block text-dark-600">·</div>
					<div class="flex items-center gap-2">
						<MapPin size={15} class="text-dark-400 flex-shrink-0" />
						<span>{locationFallback}</span>
					</div>
				</div>
			</div>

			<!-- Tear line separator -->
			<div class="relative flex items-center bg-white border-y border-dashed border-border-card">
				<div class="absolute -left-3.5 w-7 h-7 rounded-full bg-dark-50/30 border border-border-card"></div>
				<div class="absolute -right-3.5 w-7 h-7 rounded-full bg-dark-50/30 border border-border-card"></div>
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
				<p class="text-center text-xs text-dark-400 mt-3 max-w-xs">
					{$t('tickets.qrCodeHint')}
				</p>
				<p class="mt-2 text-xs font-mono font-semibold text-dark-500 tracking-wider">
					{data.reservation.id.substring(0, 8).toUpperCase()}
				</p>
			</div>

			<!-- Tear line separator -->
			<div class="relative flex items-center bg-white border-y border-dashed border-border-card">
				<div class="absolute -left-3.5 w-7 h-7 rounded-full bg-dark-50/30 border border-border-card"></div>
				<div class="absolute -right-3.5 w-7 h-7 rounded-full bg-dark-50/30 border border-border-card"></div>
			</div>

			<!-- Details -->
			<div class="px-6 py-6 space-y-6">

				<!-- Guest Information -->
				<div>
					<h3 class="text-xs font-semibold text-dark-400 uppercase tracking-widest mb-3">
						{$t('tickets.guestInfo')}
					</h3>
					<dl class="divide-y divide-border-card">
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-dark-500 flex-shrink-0">
								<User size={15} class="text-dark-400" />
								{$t('tickets.guestName')}
							</dt>
							<dd class="text-sm font-medium text-dark-900 text-right">{data.reservation.guestName}</dd>
						</div>
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-dark-500 flex-shrink-0">
								<Mail size={15} class="text-dark-400" />
								{$t('tickets.guestEmail')}
							</dt>
							<dd class="text-sm font-medium text-dark-900 text-right break-all">{data.reservation.guestEmail}</dd>
						</div>
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-dark-500 flex-shrink-0">
								<Ticket size={15} class="text-dark-400" />
								{$t('tickets.quantity')}
							</dt>
							<dd class="text-sm font-medium text-dark-900 text-right">
								{$t('tickets.ticketCount', { values: { count: data.reservation.quantity } })}
							</dd>
						</div>
					</dl>
				</div>

				<!-- Payment Information -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-xs font-semibold text-dark-400 uppercase tracking-widest mb-3">
						{$t('tickets.paymentDetails')}
					</h3>
					<dl class="divide-y divide-border-card">
						<div class="flex items-center justify-between py-2.5 gap-4">
							<dt class="flex items-center gap-2 text-sm text-dark-500">
								<CreditCard size={15} class="text-dark-400" />
								{$t('tickets.totalPaid')}
							</dt>
							<dd class="text-sm font-semibold text-dark-900">
								{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
							</dd>
						</div>
					</dl>
					{#if data.reservation.payment?.receiptUrl}
						<a
							href={data.reservation.payment.receiptUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 text-xs text-dark-500 hover:text-dark-900 transition-colors mt-2"
						>
							<CreditCard size={13} />
							{$t('tickets.viewReceipt')}
						</a>
					{/if}
				</div>

				<!-- Event Location -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-xs font-semibold text-dark-400 uppercase tracking-widest mb-3">
						{$t('tickets.eventLocation')}
					</h3>
					<div class="flex items-start gap-2 text-sm text-dark-700">
						<MapPin size={15} class="text-dark-400 flex-shrink-0 mt-0.5" />
						<address class="not-italic leading-relaxed">
							{#if venueName}
								<span class="font-semibold text-dark-900 block">{venueName}</span>
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
				<div class="border-t border-border-card pt-6 flex gap-3 print:hidden">
					<button
						onclick={downloadCalendar}
						class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
					>
						<Download size={16} />
						{$t('tickets.addToCalendar')}
					</button>
					<button
						onclick={() => window.print()}
						class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
					>
						<Printer size={16} />
						{$t('tickets.printTicket')}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@media print {
		:global(body) {
			background: white;
		}
		:global(.container) {
			max-width: 100%;
			padding: 0;
		}
	}
</style>
