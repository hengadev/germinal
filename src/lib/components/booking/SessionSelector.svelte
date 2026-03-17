<script lang="ts">
	import { Calendar, Clock, Users, Ticket } from 'lucide-svelte';
	import BookingModal from './BookingModal.svelte';
	import WaitlistForm from './WaitlistForm.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { t, locale } from 'svelte-i18n';

	interface Session {
		id: string;
		title?: string;
		titleEn?: string;
		titleFr?: string;
		description?: string | null;
		descriptionEn?: string | null;
		descriptionFr?: string | null;
		startTime: string;
		endTime: string;
		priceAmount: number;
		currency: string;
		availableCapacity: number;
		totalCapacity: number;
		allowWaitlist: boolean;
		soldOut: boolean;
		isPast: boolean;
	}

	let { sessions, eventTitle, eventSlug }: {
		sessions: Session[];
		eventTitle: string;
		eventSlug: string;
	} = $props();

	let bookingModalOpen = $state(false);
	let waitlistModalOpen = $state(false);
	let selectedSession: Session | null = $state(null);

	function openBooking(session: Session) {
		selectedSession = session;
		bookingModalOpen = true;
	}

	function openWaitlist(session: Session) {
		selectedSession = session;
		waitlistModalOpen = true;
	}

	function getSessionTitle(session: Session): string {
		if ($locale === 'en') {
			return session.titleEn || session.title || '';
		}
		return session.titleFr || session.title || '';
	}

	function getSessionDescription(session: Session): string | null {
		if ($locale === 'en') {
			return session.descriptionEn ?? session.description ?? null;
		}
		return session.descriptionFr ?? session.description ?? null;
	}

	function formatDate(dateString: string, loc: string | null | undefined): string {
		const date = new Date(dateString);
		return date.toLocaleDateString(loc ?? undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(dateString: string, loc: string | null | undefined): string {
		const date = new Date(dateString);
		return date.toLocaleTimeString(loc ?? undefined, {
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="grid gap-6">
	{#each sessions as session}
		<div class="bg-white rounded-lg border border-border-card p-6 hover:border-dark-300 transition-colors">
			<div class="grid gap-4">
				<!-- Header -->
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1">
						<h3 class="text-xl font-bold text-dark-900 mb-1">
							{getSessionTitle(session)}
						</h3>
						{#if getSessionDescription(session)}
							<p class="text-dark-500 text-sm">
								{getSessionDescription(session)}
							</p>
						{/if}
					</div>
					<div class="text-right">
						<div class="text-2xl font-bold text-dark-900">
							{formatCurrency(session.priceAmount, session.currency)}
						</div>
						<div class="text-xs text-dark-400">{$t('booking.perTicket')}</div>
					</div>
				</div>

				<!-- Session Details -->
				<div class="grid grid-cols-2 gap-4 py-4 border-y border-border-card/50">
					<div class="flex items-center gap-2 text-dark-600">
						<Calendar size={18} class="text-dark-400" />
						<div class="text-sm">
							<div class="font-medium">{formatDate(session.startTime, $locale)}</div>
						</div>
					</div>
					<div class="flex items-center gap-2 text-dark-600">
						<Clock size={18} class="text-dark-400" />
						<div class="text-sm">
							<div class="font-medium">
								{formatTime(session.startTime, $locale)} - {formatTime(session.endTime, $locale)}
							</div>
						</div>
					</div>
				</div>

				<!-- Capacity & Action -->
				<div class="flex items-center justify-between gap-4">
					{#if !session.isPast}
						<div class="flex items-center gap-2">
							<Users size={18} class="text-dark-400" />
							<span class="text-sm text-dark-600">
								{#if session.soldOut}
									<span class="text-red-600 font-medium">{$t('booking.soldOut')}</span>
								{:else}
									<span class="font-medium">{session.availableCapacity}</span>
									<span class="text-dark-400">/ {session.totalCapacity} {$t('booking.ticketsAvailable')}</span>
								{/if}
							</span>
						</div>
					{/if}

					{#if session.isPast}
						<div class="px-6 py-3 text-dark-400 font-medium">
							{$t('booking.sessionEnded')}
						</div>
					{:else if session.soldOut}
						{#if session.allowWaitlist}
							<button
								onclick={() => openWaitlist(session)}
								class="inline-flex items-center gap-2 px-6 py-3 border border-dark-300 text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
							>
								<Ticket size={18} />
								{$t('booking.joinWaitlist')}
							</button>
						{:else}
							<div class="px-6 py-3 bg-dark-100 text-dark-400 rounded-lg font-medium">
								{$t('booking.notAvailable')}
							</div>
						{/if}
					{:else}
						<button
							onclick={() => openBooking(session)}
							class="inline-flex items-center gap-2 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
						>
							<Ticket size={18} />
							{$t('booking.bookNow')}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>

{#if selectedSession && bookingModalOpen}
	<BookingModal
		bind:isOpen={bookingModalOpen}
		session={selectedSession}
		{eventTitle}
		{eventSlug}
	/>
{/if}

{#if selectedSession && waitlistModalOpen}
	<WaitlistForm
		bind:isOpen={waitlistModalOpen}
		session={selectedSession}
		{eventTitle}
	/>
{/if}
