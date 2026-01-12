<script lang="ts">
	import { ArrowLeft, User, Mail, Phone, Ticket, Calendar, Clock, MapPin, CreditCard, CheckCircle2, ExternalLink, Download, Printer } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import QRCode from 'qrcode';

	let { data }: { data: PageData } = $props();

	let qrCodeUrl = $state<string | null>(null);

	// Generate QR code on mount
	$effect(async () => {
		const PUBLIC_URL = import.meta.env.PUBLIC_URL || 'http://localhost:5173';
		qrCodeUrl = await QRCode.toDataURL(
			`${PUBLIC_URL}/tickets/${data.reservation.accessToken}`,
			{
				width: 200,
				margin: 2,
				color: {
					dark: '#1a1a1a',
					light: '#ffffff'
				}
			}
		);
	});

	// Get status badge
	function getStatusBadge(status: string) {
		switch (status) {
			case 'confirmed':
				return { text: 'Confirmed', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'Pending', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'cancelled':
				return { text: 'Cancelled', class: 'bg-red-50 text-red-700', icon: null };
			case 'expired':
				return { text: 'Expired', class: 'bg-dark-100 text-dark-600', icon: null };
			default:
				return { text: status, class: 'bg-dark-100 text-dark-600', icon: null };
		}
	}

	let statusBadge = $derived(getStatusBadge(data.reservation.status));

	// Format date and time
	function formatDateTime(dateString: string): string {
		return new Date(dateString).toLocaleString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(dateString: string): string {
		return new Date(dateString).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Download calendar file
	function downloadCalendar() {
		const event = data.reservation.session;
		const startDate = new Date(event.startTime);
		const endDate = new Date(event.endTime);

		const formatICSDate = (date: Date) => {
			return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
		};

		const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Germinal//Ticket//EN
BEGIN:VEVENT
UID:${data.reservation.id}@germinal.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${event.event.title} - ${event.title}
DESCRIPTION:Your ticket for ${event.event.title}\\nQuantity: ${data.reservation.quantity}\\nConfirmation: ${data.reservation.id}
LOCATION:${event.event.location}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

		const blob = new Blob([icsContent], { type: 'text/calendar' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ticket-${data.reservation.id}.ics`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Print ticket
	function printTicket() {
		window.print();
	}

	// View ticket on public site
	const publicTicketUrl = `/tickets/${data.reservation.accessToken}`;
</script>

<svelte:head>
	<title>Reservation {data.reservation.id.substring(0, 8).toUpperCase()} | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<!-- Back Button -->
	<a
		href="/admin/reservations"
		class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 mb-6"
	>
		<ArrowLeft size={18} />
		<span>Back to Reservations</span>
	</a>

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-start justify-between mb-2">
			<div>
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Reservation Details</h1>
				<p class="text-dark-400">
					Confirmation ID: {data.reservation.id.substring(0, 8).toUpperCase()}
				</p>
			</div>
			<span class={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium ${statusBadge.class} rounded-full`}>
				{#if statusBadge.icon}
					<svelte:component this={statusBadge.icon} size={16} />
				{/if}
				{statusBadge.text}
			</span>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Main Content (2 columns) -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Guest Information -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Guest Information</h2>
				<div class="grid gap-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
							<User size={18} class="text-dark-500" />
						</div>
						<div>
							<div class="text-sm text-dark-400">Name</div>
							<div class="font-medium text-dark-900">{data.reservation.guestName}</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
							<Mail size={18} class="text-dark-500" />
						</div>
						<div>
							<div class="text-sm text-dark-400">Email</div>
							<div class="font-medium text-dark-900">{data.reservation.guestEmail}</div>
						</div>
					</div>
					{#if data.reservation.guestPhone}
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
								<Phone size={18} class="text-dark-500" />
							</div>
							<div>
								<div class="text-sm text-dark-400">Phone</div>
								<div class="font-medium text-dark-900">{data.reservation.guestPhone}</div>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-dark-100 rounded-full flex items-center justify-center">
							<Ticket size={18} class="text-dark-500" />
						</div>
						<div>
							<div class="text-sm text-dark-400">Tickets</div>
							<div class="font-medium text-dark-900">{data.reservation.quantity} ticket{data.reservation.quantity > 1 ? 's' : ''}</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Event Information -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Event Information</h2>
				<div class="space-y-4">
					<div>
						<div class="text-sm text-dark-400 mb-1">Event</div>
						<div class="font-semibold text-dark-900 text-lg">{data.reservation.session.event.title}</div>
						<div class="text-dark-600">{data.reservation.session.title}</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="flex items-center gap-3">
							<Calendar size={18} class="text-dark-400" />
							<div>
								<div class="text-sm text-dark-400">Date</div>
								<div class="font-medium text-dark-900">{formatDate(data.reservation.session.startTime)}</div>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<Clock size={18} class="text-dark-400" />
							<div>
								<div class="text-sm text-dark-400">Time</div>
								<div class="font-medium text-dark-900">
									{formatTime(data.reservation.session.startTime)} - {formatTime(data.reservation.session.endTime)}
								</div>
							</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<MapPin size={18} class="text-dark-400" />
						<div>
							<div class="text-sm text-dark-400">Location</div>
							<div class="font-medium text-dark-900">{data.reservation.session.event.location}</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Payment Information -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Payment Information</h2>
				{#if data.reservation.payment}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-dark-600">Status</span>
							<span class="font-medium text-dark-900 capitalize">{data.reservation.payment.status}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-dark-600">Amount Paid</span>
							<span class="font-semibold text-dark-900">
								{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
							</span>
						</div>
						{#if data.reservation.payment.refundedAmount > 0}
							<div class="flex items-center justify-between">
								<span class="text-dark-600">Refunded Amount</span>
								<span class="font-medium text-red-600">
									-{formatCurrency(data.reservation.payment.refundedAmount, data.reservation.currency)}
								</span>
							</div>
						{/if}
						<div class="flex items-center justify-between">
							<span class="text-dark-600">Stripe Payment Intent</span>
							<span class="text-sm text-dark-500 font-mono">{data.reservation.payment.stripePaymentIntentId}</span>
						</div>
						{#if data.reservation.payment.receiptUrl}
							<a
								href={data.reservation.payment.receiptUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors"
							>
								<ExternalLink size={16} />
								View Stripe Receipt
							</a>
						{/if}
					</div>
				{:else}
					<div class="text-dark-400">No payment information available</div>
				{/if}
			</div>

			<!-- Timeline -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Timeline</h2>
				<div class="space-y-3">
					<div class="flex items-start gap-3">
						<div class="w-2 h-2 bg-dark-900 rounded-full mt-2"></div>
						<div>
							<div class="text-sm text-dark-400">Created</div>
							<div class="font-medium text-dark-900">{formatDateTime(data.reservation.createdAt)}</div>
						</div>
					</div>
					{#if data.reservation.confirmedAt}
						<div class="flex items-start gap-3">
							<div class="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
							<div>
								<div class="text-sm text-dark-400">Confirmed</div>
								<div class="font-medium text-dark-900">{formatDateTime(data.reservation.confirmedAt)}</div>
							</div>
						</div>
					{/if}
					{#if data.reservation.cancelledAt}
						<div class="flex items-start gap-3">
							<div class="w-2 h-2 bg-red-600 rounded-full mt-2"></div>
							<div>
								<div class="text-sm text-dark-400">Cancelled</div>
								<div class="font-medium text-dark-900">{formatDateTime(data.reservation.cancelledAt)}</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Sidebar (1 column) -->
		<div class="space-y-6">
			<!-- QR Code -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Ticket QR Code</h2>
				{#if qrCodeUrl}
					<div class="bg-dark-50 rounded-lg p-4 mb-4">
						<img
							src={qrCodeUrl}
							alt="Ticket QR Code"
							class="w-full h-auto rounded-lg"
						/>
					</div>
				{:else}
					<div class="bg-dark-50 rounded-lg p-8 text-center">
						<div class="animate-pulse text-dark-400">Loading...</div>
					</div>
				{/if}
				<a
					href={publicTicketUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="block w-full text-center px-4 py-2.5 border border-dark-300 text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
				>
					<ExternalLink size={16} class="inline mr-2" />
					View Public Ticket
				</a>
			</div>

			<!-- Actions -->
			<div class="bg-white rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-dark-900 mb-4">Actions</h2>
				<div class="space-y-3">
					<button
						onclick={downloadCalendar}
						class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium text-sm"
					>
						<Download size={18} />
						Add to Calendar
					</button>
					<button
						onclick={printTicket}
						class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium text-sm"
					>
						<Printer size={18} />
						Print Ticket
					</button>
				</div>
			</div>

			<!-- Quick Stats -->
			<div class="bg-dark-900 text-white rounded-lg p-6">
				<h3 class="text-lg font-semibold mb-4">Quick Stats</h3>
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-dark-200">Tickets</span>
						<span class="font-semibold">{data.reservation.quantity}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-dark-200">Total</span>
						<span class="font-semibold">{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-dark-200">Status</span>
						<span class="font-semibold capitalize">{data.reservation.status}</span>
					</div>
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
