<script lang="ts">
	import { Download, CheckCircle2, Clock, MapPin, Calendar, User, Mail, Ticket, CreditCard } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import { page } from '$app/stores';
	import { reveal } from '$lib/actions/reveal';

	let { data }: { data: PageData } = $props();

	const showSuccess = $page.url.searchParams.get('success') === 'true';

	function formatDateTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {  // undefined = user's browser locale
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function downloadCalendar() {
		// Download .ics calendar file
		const icsContent = generateICS();
		const blob = new Blob([icsContent], { type: 'text/calendar' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ticket-${data.reservation.session.event.slug}.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Escape ICS special characters per RFC 5545
	function escapeICS(text: string): string {
		return text
			.replace(/\\/g, '\\\\')  // Backslash must be escaped first
			.replace(/;/g, '\\;')     // Semicolons
			.replace(/,/g, '\\,')     // Commas
			.replace(/\n/g, '\\n');   // Newlines
	}

	function generateICS(): string {
		const event = data.reservation.session;
		const startDate = new Date(event.startTime);
		const endDate = new Date(event.endTime);

		const formatICSDate = (date: Date) => {
			return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
		};

		const description = `Your ticket for ${event.event.title}\\nQuantity: ${data.reservation.quantity}\\nConfirmation: ${data.reservation.id}`;

		return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Germinal//Ticket//EN
BEGIN:VEVENT
UID:${data.reservation.id}@germinal.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${escapeICS(`${event.event.title} - ${event.title}`)}
DESCRIPTION:${escapeICS(description)}
LOCATION:${escapeICS(event.event.location)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
	}

	function getStatusBadge(status: string) {
		switch (status) {
			case 'confirmed':
				return { text: 'Confirmed', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'Pending Payment', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'cancelled':
				return { text: 'Cancelled', class: 'bg-red-50 text-red-700', icon: null };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', icon: null };
		}
	}

	let statusBadge = $derived(getStatusBadge(data.reservation.status));
</script>

<svelte:head>
	<title>Your Tickets - {data.reservation.session.event.title}</title>
</svelte:head>

<div class="min-h-screen bg-dark-50/30 py-12">
	<div class="container mx-auto px-4 max-w-3xl">
		<!-- Success Banner -->
		{#if showSuccess}
			<div class="bg-green-50 border border-green-200 rounded-lg p-6 mb-8 flex items-start gap-4 print:hidden" use:reveal={{ preset: 'fade-down' }}>
				<CheckCircle2 size={32} class="text-green-600 flex-shrink-0" />
				<div>
					<h2 class="text-xl font-bold text-green-900 mb-1">Payment Successful!</h2>
					<p class="text-green-700">
						Your tickets have been confirmed. A confirmation email has been sent to {data.reservation.guestEmail}.
					</p>
				</div>
			</div>
		{/if}

		<!-- Ticket Card -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden print:break-inside-avoid" use:reveal={{ preset: 'fade-up' }}>
			<!-- Header -->
			<div class="bg-dark-900 text-white p-6">
				<div class="flex items-start justify-between mb-4">
					<div>
						<h1 class="text-2xl font-bold mb-1">{data.reservation.session.event.title}</h1>
						<p class="text-dark-200">{data.reservation.session.title}</p>
					</div>
					<span class={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${statusBadge.class}`}>
						{#if statusBadge.icon}
							<svelte:component this={statusBadge.icon} size={16} />
						{/if}
						{statusBadge.text}
					</span>
				</div>

				<div class="grid grid-cols-2 gap-4 text-sm">
					<div class="flex items-center gap-2">
						<Calendar size={16} />
						<span>{formatDateTime(data.reservation.session.startTime)}</span>
					</div>
					<div class="flex items-center gap-2">
						<MapPin size={16} />
						<span class="truncate">{data.reservation.session.event.location}</span>
					</div>
				</div>
			</div>

			<!-- QR Code -->
			<div class="p-8 bg-dark-50/50 border-y border-border-card">
				<div class="max-w-xs mx-auto">
					<img
						src={data.qrCode}
						alt="Ticket QR Code"
						class="w-full h-auto rounded-lg border-4 border-white shadow-lg"
					/>
					<p class="text-center text-sm text-dark-500 mt-4">
						Present this QR code at the entrance
					</p>
				</div>
			</div>

			<!-- Ticket Details -->
			<div class="p-6 space-y-6">
				<!-- Guest Information -->
				<div>
					<h3 class="text-sm font-semibold text-dark-600 uppercase tracking-wider mb-3">
						Guest Information
					</h3>
					<div class="grid gap-3">
						<div class="flex items-center gap-3 text-dark-700">
							<User size={18} class="text-dark-400" />
							<span>{data.reservation.guestName}</span>
						</div>
						<div class="flex items-center gap-3 text-dark-700">
							<Mail size={18} class="text-dark-400" />
							<span>{data.reservation.guestEmail}</span>
						</div>
						<div class="flex items-center gap-3 text-dark-700">
							<Ticket size={18} class="text-dark-400" />
							<span>{data.reservation.quantity} Ticket{data.reservation.quantity > 1 ? 's' : ''}</span>
						</div>
					</div>
				</div>

				<!-- Payment Information -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-sm font-semibold text-dark-600 uppercase tracking-wider mb-3">
						Payment Details
					</h3>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-dark-600">Total Paid</span>
							<span class="font-semibold text-dark-900">
								{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
							</span>
						</div>
						{#if data.reservation.payment?.receiptUrl}
							<a
								href={data.reservation.payment.receiptUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 text-sm text-dark-600 hover:text-dark-900 transition-colors"
							>
								<CreditCard size={16} />
								View Receipt
							</a>
						{/if}
					</div>
				</div>

				<!-- Event Location -->
				<div class="border-t border-border-card pt-6">
					<h3 class="text-sm font-semibold text-dark-600 uppercase tracking-wider mb-3">
						Event Location
					</h3>
					<div class="text-dark-700">
						{#if data.reservation.session.event.venueName}
							<p class="font-medium">{data.reservation.session.event.venueName}</p>
						{/if}
						{#if data.reservation.session.event.streetAddress}
							<p>{data.reservation.session.event.streetAddress}</p>
						{/if}
						{#if data.reservation.session.event.city}
							<p>{data.reservation.session.event.city}, {data.reservation.session.event.country}</p>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				<div class="border-t border-border-card pt-6 flex gap-3 print:hidden">
					<button
						onclick={downloadCalendar}
						class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
					>
						<Download size={18} />
						Add to Calendar
					</button>
					<button
						onclick={() => window.print()}
						class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
					>
						<Download size={18} />
						Print Ticket
					</button>
				</div>

				<!-- Confirmation ID -->
				<div class="text-center text-xs text-dark-400 pt-4 border-t border-border-card">
					Confirmation ID: {data.reservation.id.substring(0, 8).toUpperCase()}
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
