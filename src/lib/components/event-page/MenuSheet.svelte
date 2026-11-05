<script lang="ts">
	// A Menu set like a printed one: its name, where and for how much it is
	// served, then course by course — the label in small capitals, one dish a
	// line, « ou » between dishes the guest chooses from — and the note
	// apart, in small print. A course without a label is shown as its dishes
	// only.
	import { t } from 'svelte-i18n';
	import type { MenuView } from '$lib/utils/event-page';

	let {
		menu,
		/** « Dîner · 95 € par convive », or where it is served. */
		heading = '',
		class: className = '',
	}: { menu: MenuView; heading?: string; class?: string } = $props();
</script>

<section class="flex flex-col items-center gap-7 text-center {className}">
	<header class="flex flex-col gap-1.5">
		{#if heading}<p class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">{heading}</p>{/if}
		<h3 class="font-serif text-2xl leading-tight text-balance">{menu.name}</h3>
	</header>
	{#if menu.courses.length}
	<ol class="flex flex-col gap-5">
		{#each menu.courses as course, i (i)}
			<li class="flex flex-col gap-1">
				{#if course.label}
					<p class="text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground">{course.label}</p>
				{/if}
				{#each course.dishes as dish, d (d)}
					{#if d > 0}<p class="font-serif text-sm italic text-muted-foreground">{$t('events.booking.or')}</p>{/if}
					<p class="leading-snug text-balance">{dish}</p>
				{/each}
			</li>
		{/each}
	</ol>
	{/if}
	{#if menu.note}
		<p class="mt-2 max-w-xs text-xs leading-relaxed text-pretty text-muted-foreground">{menu.note}</p>
	{/if}
</section>
