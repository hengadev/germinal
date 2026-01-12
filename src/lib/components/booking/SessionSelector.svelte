<script lang="ts">
	import { Calendar, Clock, Users, Ticket } from 'lucide-svelte';
	import BookingModal from './BookingModal.svelte';
	import WaitlistForm from './WaitlistForm.svelte';
	import { formatCurrency } from '$lib/utils/currency';

	interface Session {
		id: string;
		title: string;
		description: string | null;
		startTime: string;
		endTime: string;
		priceAmount: number;
		currency: string;
		availableCapacity: number;
		totalCapacity: number;
		allowWaitlist: boolean;
		soldOut: boolean;
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

	function formatDateTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {  // undefined = user's browser locale
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {  // undefined = user's browser locale
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleTimeString(undefined, {  // undefined = user's browser locale
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
							{session.title}
						</h3>
						{#if session.description}
							<p class="text-dark-500 text-sm">
								{session.description}
							</p>
						{/if}
					</div>
					<div class="text-right">
						<div class="text-2xl font-bold text-dark-900">
							{formatCurrency(session.priceAmount, session.currency)}
						</div>
						<div class="text-xs text-dark-400">per ticket</div>
					</div>
				</div>

				<!-- Session Details -->
				<div class="grid grid-cols-2 gap-4 py-4 border-y border-border-card/50">
					<div class="flex items-center gap-2 text-dark-600">
						<Calendar size={18} class="text-dark-400" />
						<div class="text-sm">
							<div class="font-medium">{formatDate(session.startTime)}</div>
						</div>
					</div>
					<div class="flex items-center gap-2 text-dark-600">
						<Clock size={18} class="text-dark-400" />
						<div class="text-sm">
							<div class="font-medium">
								{formatTime(session.startTime)} - {formatTime(session.endTime)}
							</div>
						</div>
					</div>
				</div>

				<!-- Capacity & Action -->
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-2">
						<Users size={18} class="text-dark-400" />
						<span class="text-sm text-dark-600">
							{#if session.soldOut}
								<span class="text-red-600 font-medium">Sold Out</span>
							{:else}
								<span class="font-medium">{session.availableCapacity}</span>
								<span class="text-dark-400">/ {session.totalCapacity} tickets available</span>
							{/if}
						</span>
					</div>

					{#if session.soldOut}
						{#if session.allowWaitlist}
							<button
								onclick={() => openWaitlist(session)}
								class="inline-flex items-center gap-2 px-6 py-3 border border-dark-300 text-dark-700 rounded-lg hover:bg-dark-50 transition-colors font-medium"
							>
								<Ticket size={18} />
								Join Waitlist
							</button>
						{:else}
							<div class="px-6 py-3 bg-dark-100 text-dark-400 rounded-lg font-medium">
								Not Available
							</div>
						{/if}
					{:else}
						<button
							onclick={() => openBooking(session)}
							class="inline-flex items-center gap-2 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors font-medium"
						>
							<Ticket size={18} />
							Book Now
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
