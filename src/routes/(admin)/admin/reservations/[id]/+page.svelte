<script lang="ts">
	import { ArrowLeft, User, Mail, Phone, Ticket, Calendar, Clock, MapPin, CreditCard, CheckCircle2, ExternalLink, Download, Printer, XCircle, MailCheck, RotateCcw, AlertCircle } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import { formatCurrency } from '$lib/utils/currency';
	import QRCode from 'qrcode';
	import { enhance } from '$app/forms';
	import { env } from '$env/dynamic/public';
	import { getToastContext } from '$lib/components/toast/state.svelte';

	let { data }: { data: PageData } = $props();

	let form = $state<{
		success?: string;
		error?: string;
	} | undefined>();

	const toast = getToastContext();

	// Show toast on form changes
	$effect(() => {
		if (form?.success) {
			toast.success("Succès", form.success);
			form = undefined;
		}
	});

	$effect(() => {
		if (form?.error) {
			toast.error("Erreur", form.error);
			form = undefined;
		}
	});

	let isSubmitting = $state(false);

	let qrCodeUrl = $state<string | null>(null);

	// Generate QR code on mount
	$effect(async () => {
		const PUBLIC_URL = env.PUBLIC_URL || 'http://localhost:5173';
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
				return { text: 'Confirmée', class: 'bg-green-50 text-green-700', icon: CheckCircle2 };
			case 'pending':
				return { text: 'En attente', class: 'bg-yellow-50 text-yellow-700', icon: Clock };
			case 'cancelled':
				return { text: 'Annulée', class: 'bg-red-50 text-red-700', icon: null };
			case 'expired':
				return { text: 'Expirée', class: 'bg-muted text-foreground-alt', icon: null };
			default:
				return { text: status, class: 'bg-muted text-foreground-alt', icon: null };
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
	<title>Réservation {data.reservation.id.substring(0, 8).toUpperCase()} | Tableau de bord Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<!-- Back Button -->
	<a
		href="/admin/reservations"
		class="inline-flex items-center gap-2 text-foreground-alt hover:text-foreground mb-6"
	>
		<ArrowLeft size={18} />
		<span>Retour aux Réservations</span>
	</a>

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-start justify-between mb-2">
			<div>
				<h1 class="text-3xl lg:text-4xl font-bold mb-2">Détails de la Réservation</h1>
				<p class="text-muted-foreground">
					ID de Confirmation : {data.reservation.id.substring(0, 8).toUpperCase()}
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
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">Informations de l'Invité</h2>
				<div class="grid gap-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
							<User size={18} class="text-muted-foreground" />
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Nom</div>
							<div class="font-medium text-foreground">{data.reservation.guestName}</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
							<Mail size={18} class="text-muted-foreground" />
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Email</div>
							<div class="font-medium text-foreground">{data.reservation.guestEmail}</div>
						</div>
					</div>
					{#if data.reservation.guestPhone}
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
								<Phone size={18} class="text-muted-foreground" />
							</div>
							<div>
								<div class="text-sm text-muted-foreground">Téléphone</div>
								<div class="font-medium text-foreground">{data.reservation.guestPhone}</div>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
							<Ticket size={18} class="text-muted-foreground" />
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Billets</div>
							<div class="font-medium text-foreground">{data.reservation.quantity} billet{data.reservation.quantity > 1 ? 's' : ''}</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Event Information -->
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">Informations sur l'Événement</h2>
				<div class="space-y-4">
					<div>
						<div class="text-sm text-muted-foreground mb-1">Événement</div>
						<div class="font-semibold text-foreground text-lg">{data.reservation.session.event.title}</div>
						<div class="text-foreground-alt">{data.reservation.session.titleEn}</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="flex items-center gap-3">
							<Calendar size={18} class="text-muted-foreground" />
							<div>
								<div class="text-sm text-muted-foreground">Date</div>
								<div class="font-medium text-foreground">{formatDate(data.reservation.session.startTime)}</div>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<Clock size={18} class="text-muted-foreground" />
							<div>
								<div class="text-sm text-muted-foreground">Heure</div>
								<div class="font-medium text-foreground">
									{formatTime(data.reservation.session.startTime)} - {formatTime(data.reservation.session.endTime)}
								</div>
							</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<MapPin size={18} class="text-muted-foreground" />
						<div>
							<div class="text-sm text-muted-foreground">Lieu</div>
							<div class="font-medium text-foreground">{data.reservation.session.event.location}</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Payment Information -->
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">Informations de Paiement</h2>
				{#if data.reservation.payment}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-foreground-alt">Statut</span>
							<span class="font-medium text-foreground capitalize">{data.reservation.payment.status}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-foreground-alt">Montant Payé</span>
							<span class="font-semibold text-foreground">
								{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
							</span>
						</div>
						{#if data.reservation.payment.refundedAmount > 0}
							<div class="flex items-center justify-between">
								<span class="text-foreground-alt">Montant Remboursé</span>
								<span class="font-medium text-red-600">
									-{formatCurrency(data.reservation.payment.refundedAmount, data.reservation.currency)}
								</span>
							</div>
						{/if}
						<div class="flex items-center justify-between">
							<span class="text-foreground-alt">Stripe Payment Intent</span>
							<span class="text-sm text-muted-foreground font-mono">{data.reservation.payment.stripePaymentIntentId}</span>
						</div>
						{#if data.reservation.payment.receiptUrl}
							<a
								href={data.reservation.payment.receiptUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 text-foreground-alt hover:text-foreground transition-colors"
							>
								<ExternalLink size={16} />
								Voir le Reçu Stripe
							</a>
						{/if}
					</div>
				{:else}
					<div class="text-muted-foreground">Aucune information de paiement disponible</div>
				{/if}
			</div>

			<!-- Timeline -->
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">Chronologie</h2>
				<div class="space-y-3">
					<div class="flex items-start gap-3">
						<div class="w-2 h-2 bg-foreground rounded-full mt-2"></div>
						<div>
							<div class="text-sm text-muted-foreground">Créé</div>
							<div class="font-medium text-foreground">{formatDateTime(data.reservation.createdAt)}</div>
						</div>
					</div>
					{#if data.reservation.confirmedAt}
						<div class="flex items-start gap-3">
							<div class="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
							<div>
								<div class="text-sm text-muted-foreground">Confirmée</div>
								<div class="font-medium text-foreground">{formatDateTime(data.reservation.confirmedAt)}</div>
							</div>
						</div>
					{/if}
					{#if data.reservation.cancelledAt}
						<div class="flex items-start gap-3">
							<div class="w-2 h-2 bg-red-600 rounded-full mt-2"></div>
							<div>
								<div class="text-sm text-muted-foreground">Annulée</div>
								<div class="font-medium text-foreground">{formatDateTime(data.reservation.cancelledAt)}</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Sidebar (1 column) -->
		<div class="space-y-6">
			<!-- QR Code -->
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">QR Code du Billet</h2>
				{#if qrCodeUrl}
					<div class="bg-muted rounded-lg p-4 mb-4">
						<img
							src={qrCodeUrl}
							alt="Ticket QR Code"
							class="w-full h-auto rounded-lg"
						/>
					</div>
				{:else}
					<div class="bg-muted rounded-lg p-8 text-center">
						<div class="animate-pulse text-muted-foreground">Chargement...</div>
					</div>
				{/if}
				<a
					href={publicTicketUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="block w-full text-center px-4 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm"
				>
					<ExternalLink size={16} class="inline mr-2" />
					Voir le Billet Public
				</a>
			</div>

			<!-- Actions -->
			<div class="bg-background rounded-lg border border-border-card p-6">
				<h2 class="text-lg font-semibold text-foreground mb-4">Actions</h2>
				<div class="space-y-3">
					<!-- Admin Actions -->
					{#if data.reservation.status === 'confirmed'}
						<form method="POST" action="?/reminder" use:enhance={({ formElement }) => {
							isSubmitting = true;
							return async ({ result }) => {
								isSubmitting = false;
								if (result.type === 'success' && result.data) {
									form = { success: (result.data as { message: string }).message };
								} else if (result.type === 'failure' && result.data) {
									form = { error: (result.data as { error?: string }).error || 'Action failed' };
								}
							};
						}}>
							<button
								type="submit"
								disabled={isSubmitting}
								class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<MailCheck size={18} />
								Envoyer un Rappel
							</button>
						</form>

						<form method="POST" action="?/cancel" use:enhance={({ formElement }) => {
							isSubmitting = true;
							return async ({ result }) => {
								isSubmitting = false;
								if (result.type === 'success' && result.data) {
									form = { success: (result.data as { message: string }).message };
								} else if (result.type === 'failure' && result.data) {
									form = { error: (result.data as { error?: string }).error || 'Action échouée' };
								}
							};
						}}>
							<button
								type="submit"
								disabled={isSubmitting}
								class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<XCircle size={18} />
								Annuler la Réservation
							</button>
						</form>

						{#if data.reservation.payment?.status === 'succeeded' && (!data.reservation.payment.refundedAmount || data.reservation.payment.refundedAmount < data.reservation.payment.amount)}
							<form method="POST" action="?/refund" use:enhance={({ formElement }) => {
								isSubmitting = true;
								return async ({ result }) => {
									isSubmitting = false;
									if (result.type === 'success' && result.data) {
										form = { success: (result.data as { message: string }).message };
									} else if (result.type === 'failure' && result.data) {
										form = { error: (result.data as { error?: string }).error || 'Action échouée' };
									}
								};
							}}>
								<button
									type="submit"
									disabled={isSubmitting}
									class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<RotateCcw size={18} />
									Traiter le Remboursement
								</button>
							</form>
						{/if}
					{/if}

					<div class="border-t border-border-card my-3"></div>

					<!-- Utility Actions -->
					<button
						onclick={downloadCalendar}
						class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-input text-foreground-alt rounded-lg hover:bg-muted transition-colors font-medium text-sm"
					>
						<Download size={18} />
						Ajouter au Calendrier
					</button>
					<button
						onclick={printTicket}
						class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background rounded-lg hover:opacity-90 transition-colors font-medium text-sm"
					>
						<Printer size={18} />
						Imprimer le Billet
					</button>
				</div>
			</div>

			<!-- Quick Stats -->
			<div class="bg-foreground text-background rounded-lg p-6">
				<h3 class="text-lg font-semibold mb-4">Statistiques Rapides</h3>
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Billets</span>
						<span class="font-semibold">{data.reservation.quantity}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Total</span>
						<span class="font-semibold">{formatCurrency(data.reservation.totalAmount, data.reservation.currency)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Statut</span>
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
