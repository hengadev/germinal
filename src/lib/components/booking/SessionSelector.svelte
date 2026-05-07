<script lang="ts">
	import BookingModal from './BookingModal.svelte';
	import WaitlistForm from './WaitlistForm.svelte';
	import { t, locale } from 'svelte-i18n';

	interface Session {
		id: string;
		titleEn?: string;
		titleFr?: string;
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

	const BADGE_LABEL: Record<string, string> = {
		featured: 'Featured',
		vip: 'VIP',
		popular: 'Popular',
		best_value: 'Best Value',
		limited: 'Limited',
	};

	// oklch badge colors — low chroma so none dominate over the type
	const BADGE_STYLE: Record<string, string> = {
		'Featured':    'color:oklch(0.38 0.04 150);background:oklch(0.96 0.015 150);border-color:oklch(0.88 0.025 150)',
		'VIP':         'color:oklch(0.38 0.04 320);background:oklch(0.96 0.015 320);border-color:oklch(0.88 0.025 320)',
		'Popular':     'color:oklch(0.45 0.05 40);background:oklch(0.96 0.018 40);border-color:oklch(0.88 0.030 40)',
		'Best Value':  'color:oklch(0.42 0.05 80);background:oklch(0.96 0.020 80);border-color:oklch(0.88 0.030 80)',
		'Limited':     'color:oklch(0.45 0.07 30);background:oklch(0.96 0.020 30);border-color:oklch(0.86 0.040 30)',
	};

	type CardState = 'default' | 'limited' | 'waitlist' | 'unavailable' | 'past';

	function getCardState(s: Session): CardState {
		if (s.isPast) return 'past';
		if (s.soldOut && s.allowWaitlist) return 'waitlist';
		if (s.soldOut) return 'unavailable';
		if (s.badgeType === 'limited') return 'limited';
		return 'default';
	}

	function getBadgeLabel(s: Session): string | null {
		if (!s.badgeType || s.badgeType === 'none') return null;
		return BADGE_LABEL[s.badgeType] ?? null;
	}

	function getTitle(s: Session): string {
		return ($locale === 'en' ? s.titleEn : s.titleFr) || '';
	}

	function getDescription(s: Session): string {
		return (($locale === 'en' ? s.descriptionEn : s.descriptionFr) ?? '') || '';
	}

	function getDateParts(iso: string) {
		const d = new Date(iso);
		return {
			day: d.getDate(),
			month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
			weekday: d.toLocaleDateString($locale ?? 'en', { weekday: 'long' }),
			year: d.getFullYear(),
		};
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString($locale ?? undefined, {
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function getCurrencySymbol(currency: string): string {
		try {
			return (0)
				.toLocaleString('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
				.replace(/[\d\s,.]/g, '')
				.trim();
		} catch {
			return currency;
		}
	}

	function openBooking(s: Session) { selectedSession = s; bookingModalOpen = true; }
	function openWaitlist(s: Session) { selectedSession = s; waitlistModalOpen = true; }

	const sortedSessions = $derived(sessions.toSorted((a, b) => {
		const order: Record<string, number> = { vip: 5, featured: 4, limited: 3, best_value: 2, popular: 1, none: 0 };
		const diff = (order[b.badgeType || 'none'] ?? 0) - (order[a.badgeType || 'none'] ?? 0);
		return diff !== 0 ? diff : new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
	}));
</script>

<div class="grid gap-6" style="grid-template-columns: repeat(auto-fit, minmax(420px, 1fr))">
	{#each sortedSessions as session (session.id)}
		{@const state = getCardState(session)}
		{@const muted = state === 'past' || state === 'unavailable'}
		{@const badge = getBadgeLabel(session)}
		{@const dp = getDateParts(session.startTime)}
		{@const symbol = getCurrencySymbol(session.currency)}
		{@const price = session.priceAmount / 100}
		{@const pct = Math.max(0, Math.min(100, ((session.totalCapacity - session.availableCapacity) / session.totalCapacity) * 100))}

		<div
			class="relative flex flex-col gap-[22px] bg-white rounded-xl border transition-[opacity]"
			style="padding: 28px 28px 24px; border-color: #ededeb; opacity: {muted ? 0.78 : 1}"
		>
			<!-- Badge pill -->
			{#if badge}
				<span
					class="absolute top-5 right-5 text-[10.5px] font-medium uppercase rounded-full border"
					style="padding: 5px 9px 4px; line-height: 1; letter-spacing: 0.12em; {BADGE_STYLE[badge] ?? ''}"
				>{badge}</span>
			{/if}

			<!-- Title + description -->
			<header class="flex flex-col gap-2" style={badge ? 'padding-right: 100px' : ''}>
				<h3
					class="m-0 leading-[1.15]"
					style="font-family:'Newsreader',Georgia,serif; font-weight:400; font-size:24px; letter-spacing:-0.01em; color:{muted ? '#525252' : '#0a0a0a'}"
				>{getTitle(session)}</h3>
				{#if getDescription(session)}
					<p
						class="m-0 leading-relaxed"
						style="font-size:13.5px; color:{muted ? '#a3a3a3' : '#737373'}; max-width:38ch"
					>{getDescription(session)}</p>
				{/if}
			</header>

			<!-- Date block + time row -->
			<div class="flex flex-col gap-3">
				<!-- Date: large serif numeral with left-border accent -->
				<div class="flex items-start gap-[14px]">
					<div
						class="flex-none flex flex-col items-center"
						style="padding:6px 10px 8px; border-left:1px solid {muted ? '#e5e5e2' : '#0a0a0a'}; margin-left:-1px"
					>
						<span style="font-family:'Newsreader',Georgia,serif; font-weight:400; font-size:36px; line-height:1; color:{muted ? '#a3a3a3' : '#0a0a0a'}; font-feature-settings:'lnum'"
						>{dp.day}</span>
						<span
							class="font-medium mt-1"
							style="font-size:10px; letter-spacing:0.18em; color:{muted ? '#a3a3a3' : '#737373'}"
						>{dp.month}</span>
					</div>
					<div class="flex-1 pt-1">
						<span style="font-size:13px; color:{muted ? '#a3a3a3' : '#737373'}; letter-spacing:0.02em">
							{dp.weekday}, {dp.year}
						</span>
					</div>
				</div>
				<!-- Time row -->
				<div class="flex items-baseline gap-[10px]">
					<span
						class="font-medium uppercase"
						style="font-size:11px; letter-spacing:0.14em; color:{muted ? '#a3a3a3' : '#737373'}"
					>{$t('booking.doors')}</span>
					<span style="font-size:15px; color:{muted ? '#a3a3a3' : '#0a0a0a'}; letter-spacing:0.02em; font-variant-numeric:tabular-nums">
						{formatTime(session.startTime)}<span style="color:#a3a3a3; margin:0 8px">—</span>{formatTime(session.endTime)}
					</span>
				</div>
			</div>

			<!-- Price: large Newsreader numeral -->
			<div class="flex items-baseline gap-1" style="border-top:1px solid #ededeb; padding-top:18px">
				<span
					class="relative font-sans font-normal"
					style="font-size:18px; color:{muted ? '#a3a3a3' : '#737373'}; top:-10px"
				>{symbol}</span>
				<span
					style="font-family:'Newsreader',Georgia,serif; font-size:44px; font-weight:400; letter-spacing:-0.02em; color:{muted ? '#a3a3a3' : '#0a0a0a'}; line-height:1; font-feature-settings:'lnum'"
				>{price}</span>
				<span
					class="font-sans text-xs ml-1"
					style="color:{muted ? '#a3a3a3' : '#737373'}; letter-spacing:0.04em"
				>{$t('booking.perTicket')}</span>
			</div>

			<!-- Capacity: 2px hairline progress bar -->
			<div class="flex flex-col gap-[6px]">
				<div
					class="flex justify-between items-baseline font-medium uppercase"
					style="font-size:12px; letter-spacing:0.06em; color:{muted ? '#a3a3a3' : '#737373'}"
				>
					<span>{$t('booking.capacity')}</span>
					<span
						class="normal-case font-normal"
						style="font-size:13px; letter-spacing:0.02em; color:{muted ? '#a3a3a3' : session.soldOut ? '#a3a3a3' : '#404040'}"
					>
						{#if session.soldOut}
							<span style="font-variant:small-caps; letter-spacing:0.08em">{$t('booking.soldOut')}</span>
						{:else}
							<span style="color:{muted ? '#a3a3a3' : '#0a0a0a'}; font-weight:500">{session.availableCapacity}</span>
							<span style="color:#a3a3a3"> / {session.totalCapacity} {$t('booking.ticketsAvailable')}</span>
						{/if}
					</span>
				</div>
				<div
					class="relative overflow-hidden"
					style="height:2px; border-radius:1px; background:{muted ? '#f5f5f4' : '#ededeb'}"
				>
					<div
						class="absolute inset-y-0 left-0"
						style="width:{pct}%; background:{muted ? '#d4d4d4' : session.soldOut ? '#a3a3a3' : '#0a0a0a'}; transition:width .4s ease"
					></div>
				</div>
			</div>

			<!-- CTA -->
			<div class="mt-1">
				{#if state === 'past'}
					<div style="border-top:1px solid #ededeb; padding:12px 0; font-family:'Newsreader',Georgia,serif; font-size:15px; font-weight:400; font-style:italic; color:#a3a3a3; letter-spacing:0.01em; text-align:center">
						{$t('booking.sessionEnded')}
					</div>
				{:else if state === 'unavailable'}
					<div style="border-top:1px solid #ededeb; padding:12px 0; font-family:'Newsreader',Georgia,serif; font-size:15px; font-weight:400; font-style:italic; color:#a3a3a3; letter-spacing:0.01em; text-align:center">
						{$t('booking.notAvailable')}
					</div>
				{:else if state === 'waitlist'}
					<button
						onclick={() => openWaitlist(session)}
						class="w-full flex items-center justify-center gap-2 rounded-lg font-medium text-sm"
						style="padding:14px 20px; background:#fff; color:#0a0a0a; border:1px solid #d4d4d4; letter-spacing:0.02em; cursor:pointer; transition:background .15s,border-color .15s"
						onmouseenter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background='#fafaf8'; el.style.borderColor='#0a0a0a'; }}
						onmouseleave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background='#fff'; el.style.borderColor='#d4d4d4'; }}
					>
						{$t('booking.joinWaitlist')}
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M11 7L7.5 3.5M11 7L7.5 10.5" stroke="#0a0a0a" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
				{:else}
					<button
						onclick={() => openBooking(session)}
						class="w-full flex items-center justify-center gap-2 rounded-lg font-medium text-sm"
						style="padding:14px 20px; background:#0a0a0a; color:#fafaf8; border:1px solid #0a0a0a; letter-spacing:0.02em; cursor:pointer; transition:background .15s"
						onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background='#262626'; }}
						onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background='#0a0a0a'; }}
					>
						{$t('booking.bookNow')}
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M11 7L7.5 3.5M11 7L7.5 10.5" stroke="#fafaf8" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
				{/if}
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
