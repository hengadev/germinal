<script lang="ts">
	import { Calendar, Clock, Users, Ticket, Sparkles, Star, Award, TrendingUp } from 'lucide-svelte';
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
		badgeType?: 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited';
	}

	let { sessions, eventTitle, eventSlug }: {
		sessions: Session[];
		eventTitle: string;
		eventSlug: string;
	} = $props();

	let bookingModalOpen = $state(false);
	let waitlistModalOpen = $state(false);
	let selectedSession: Session | null = $state(null);

	// Badge type configuration
	const badgeConfig: Record<string, { labelEn: string; labelFr: string; color: string; icon: any }> = {
		none: { labelEn: '', labelFr: '', color: '', icon: null },
		featured: { labelEn: 'Featured', labelFr: 'En vedette', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Sparkles },
		vip: { labelEn: 'VIP', labelFr: 'VIP', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Star },
		popular: { labelEn: 'Popular', labelFr: 'Populaire', color: 'bg-green-100 text-green-700 border-green-200', icon: TrendingUp },
		best_value: { labelEn: 'Best Value', labelFr: 'Meilleur rapport', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Award },
		limited: { labelEn: 'Limited', labelFr: 'Places limitées', color: 'bg-red-100 text-red-700 border-red-200', icon: Clock }
	};

	// Sort sessions: badges first, then by start time
	const sortedSessions = $derived(sessions.toSorted((a, b) => {
		const badgeOrder = { vip: 5, featured: 4, limited: 3, best_value: 2, popular: 1, none: 0 };
		const aBadge = badgeOrder[a.badgeType || 'none'] ?? 0;
		const bBadge = badgeOrder[b.badgeType || 'none'] ?? 0;
		if (aBadge !== bBadge) return bBadge - aBadge;
		return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
	}));

	function getBadgeLabel(session: Session): string {
		const badge = badgeConfig[session.badgeType || 'none'];
		if ($locale === 'en') return badge.labelEn;
		return badge.labelFr;
	}

	function getBadgeColor(session: Session): string {
		return badgeConfig[session.badgeType || 'none'].color;
	}

	function getBadgeIcon(session: Session): any {
		return badgeConfig[session.badgeType || 'none'].icon;
	}

	function getCardBorderClass(session: Session): string {
		if (!session.badgeType || session.badgeType === 'none') return 'border-border-card';
		return `border-l-4 ${getBadgeBorderColor(session.badgeType)}`;
	}

	function getBadgeBorderColor(badgeType?: string): string {
		const colors: Record<string, string> = {
			featured: 'border-l-blue-500',
			vip: 'border-l-amber-500',
			popular: 'border-l-green-500',
			best_value: 'border-l-purple-500',
			limited: 'border-l-red-500'
		};
		return colors[badgeType || ''] || '';
	}

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

<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
	{#each sortedSessions as session}
		<div class="bg-white rounded-lg border {getCardBorderClass(session)} p-6 hover:border-dark-300 transition-colors relative">
			{#if session.badgeType && session.badgeType !== 'none'}
				{@const BadgeIcon = getBadgeIcon(session)}
				<!-- Badge -->
				<div class="absolute top-4 right-4">
					<span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border {getBadgeColor(session)}">
						{#if BadgeIcon}
							<BadgeIcon size={12} />
						{/if}
						{getBadgeLabel(session)}
					</span>
				</div>
			{/if}
			<div class="grid gap-4">
				<!-- Header -->
				<div class="flex items-start justify-between gap-4 pr-24">
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
				<div class="flex justify-between items-start py-4 border-y border-border-card/50 gap-4">
					<div class="flex items-center gap-2 text-dark-600">
						<Calendar size={18} class="text-dark-400 flex-shrink-0" />
						<div class="text-sm">
							<div class="font-medium">{formatDate(session.startTime, $locale)}</div>
						</div>
					</div>
					<div class="flex items-center gap-2 text-dark-600">
						<div class="text-sm text-right">
							<div class="font-medium">
								{formatTime(session.startTime, $locale)} - {formatTime(session.endTime, $locale)}
							</div>
						</div>
						<Clock size={18} class="text-dark-400 flex-shrink-0" />
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
