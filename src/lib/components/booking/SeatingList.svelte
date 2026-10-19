<script lang="ts">
	// The Event's Seatings on its page (issue 022): each Day, its Services
	// with their price per guest once, and the Seatings as flat rows in time
	// order — time, title, what is left, and the way to book. A VIP Seating
	// inverts to an ink block (DESIGN.md, the Threshold Rule); no other badge
	// shows. What is paid when, the Refund Policy and the dietary question
	// close the list. The page opens the booking or Waitlist dialog.
	import { t } from 'svelte-i18n';
	import type { EventPage, SeatingView } from '$lib/utils/event-page';

	let {
		page,
		/** The Admin preview of a Draft (issue 033): Seatings show, booking does not. */
		preview = false,
		onchoose,
	}: { page: EventPage; preview?: boolean; onchoose: (seating: SeatingView) => void } = $props();

	const label = 'text-xxs font-medium uppercase tracking-[0.15em]';
</script>

<div class="flex flex-col gap-8">
	{#each page.days as day (day.date)}
		<article>
			<h3 class="font-serif text-xl first-letter:uppercase">{day.label}</h3>
			{#each day.services as service (service.kind)}
				<div class="mt-4">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2">
						<p class="{label} text-foreground">{service.label}</p>
						<p class="text-sm text-foreground-alt">
							<span class="font-mono text-foreground">{service.price}</span>
							{#if service.priced}{$t('events.perGuest')}{/if}
						</p>
					</div>
					{#if service.depositNote}<p class="pb-2 text-xs text-muted-foreground">{service.depositNote}</p>{/if}
					<ul>
						{#each service.seatings as seating (seating.id)}
							{@const done = seating.state === 'past' || seating.state === 'full'}
							<li
								class="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-t py-4 {seating.vip
									? 'border-transparent bg-foreground px-4 text-white'
									: 'border-border-card'}"
							>
								<p class="font-mono text-sm tabular-nums {done ? 'opacity-50' : ''}">
									{seating.start}<span class="opacity-40"> – </span>{seating.end}
								</p>
								<div class="min-w-0">
									{#if seating.title}<p class="font-serif text-lg leading-tight">{seating.title}</p>{/if}
									{#if seating.description}
										<p class="mt-1 text-sm leading-relaxed {seating.vip ? 'text-white/70' : 'text-foreground-alt'}">{seating.description}</p>
									{/if}
									<p class="text-sm italic {seating.vip ? 'text-white/70' : 'text-foreground-alt'}">{seating.status}</p>
								</div>
								{#if seating.bookable || seating.state === 'waitlist'}
									<button
										type="button"
										onclick={() => onchoose(seating)}
										disabled={preview}
										class="col-span-2 justify-self-start px-5 py-2 text-sm font-medium transition-colors disabled:opacity-40 {seating.vip
											? 'bg-white text-foreground hover:bg-surface'
											: seating.bookable
												? 'bg-foreground text-white hover:bg-foreground-alt'
												: 'border border-border-input-hover hover:border-foreground'}"
									>
										{seating.bookable ? $t('events.page.book') : $t('events.page.joinWaitlist')}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</article>
	{/each}
	{#if page.conditions.length}
		<div class="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
			{#each page.conditions as condition, i (i)}<p>{condition}</p>{/each}
		</div>
	{/if}
</div>
