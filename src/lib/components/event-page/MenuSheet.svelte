<script lang="ts">
	// A Menu set like the printed card the Admin edits: its name, a short
	// rule, then course by course — the label in small capitals, one dish a
	// line in italics with its description under it, « ou » between dishes
	// the guest chooses from — and the note apart, in small print. A course
	// without a label is shown as its dishes only.
	import { t } from 'svelte-i18n';
	import type { MenuView } from '$lib/utils/event-page';

	let {
		menu,
		/** « Dîner · 95 € par convive », or where it is served. */
		heading = '',
		class: className = '',
	}: { menu: Pick<MenuView, 'name' | 'courses' | 'note'>; heading?: string; class?: string } = $props();

	const small = 'text-[11px] uppercase tracking-[0.2em] text-muted-foreground';
</script>

<section class="flex flex-col items-center text-center {className}">
	<header class="flex flex-col gap-2">
		{#if heading}<p class={small}>{heading}</p>{/if}
		<h3 class="font-serif text-3xl leading-tight text-balance">{menu.name}</h3>
	</header>
	<span class="my-6 block h-px w-10 bg-foreground/40" aria-hidden="true"></span>
	{#if menu.courses.length}
		<ol class="flex flex-col gap-6">
			{#each menu.courses as course, i (i)}
				<li class="flex flex-col gap-1.5">
					{#if course.label}<p class={small}>{course.label}</p>{/if}
					{#each course.dishes as dish, d (d)}
						{#if d > 0 && dish.alternative}
							<p class="font-serif text-sm italic text-muted-foreground">{$t('events.booking.or')}</p>
						{/if}
						<div class="flex flex-col gap-0.5">
							<p class="text-lg leading-snug italic text-balance">{dish.name}</p>
							{#if dish.description}
								<p class="text-xs leading-relaxed text-pretty text-muted-foreground">{dish.description}</p>
							{/if}
							{#if d > 0 && dish.alternative && dish.note}
								<p class="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{dish.note}</p>
							{/if}
						</div>
					{/each}
				</li>
			{/each}
		</ol>
	{/if}
	{#if menu.note}
		<p class="mt-8 max-w-xs text-xs leading-relaxed text-pretty text-muted-foreground">{menu.note}</p>
	{/if}
</section>
