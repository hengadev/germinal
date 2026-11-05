<script lang="ts">
	// Who and where: the credits (linked when they have a page), the
	// curator, the venue and the timings, as a two-column list beside the
	// Event's text.
	import { t } from 'svelte-i18n';
	import type { EventPage } from '$lib/utils/event-page';

	let { view }: { view: EventPage } = $props();

	const facts = $derived([
		...view.credits.map((c) => ({ term: c.role, value: c.name, href: c.href })),
		...(view.curator ? [{ term: $t('events.page.curator'), value: view.curator, href: '' }] : []),
		...(view.venueLines.length ? [{ term: $t('events.page.venue'), value: view.venueLines.join(', '), href: '' }] : []),
	]);
	/** The timings read together: « Accueil 19:15 », « Premier service 19:30 »… */
	const times = $derived(view.timings);

	const term = 'text-xxs font-medium uppercase tracking-[0.15em] text-muted-foreground';
	const link = 'underline decoration-border-input-hover underline-offset-4 hover:decoration-foreground';
</script>

{#if facts.length || times.length}
	<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
		{#each facts as f, i (i)}
			<dt class="text-muted-foreground">{f.term}</dt>
			<dd>
				{#if f.href}<a href={f.href} class={link}>{f.value}</a>{:else}{f.value}{/if}
			</dd>
		{/each}
		{#if times.length}
			<dt class="text-muted-foreground">{$t('events.page.times')}</dt>
			<dd class="flex flex-col gap-0.5">
				{#each times as timing, i (i)}<span class="flex justify-between gap-4"><span>{timing.label}</span><span class="font-mono">{timing.time}</span></span>{/each}
			</dd>
		{/if}
	</dl>
{/if}
