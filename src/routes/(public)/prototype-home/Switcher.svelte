<script lang="ts">
	// PROTOTYPE — the bar to switch between the home page variants: one
	// group per choice, each with its own search param.
	import { page } from '$app/state';

	interface Group {
		param: string;
		label: string;
		variants: { id: string; name: string }[];
		current: string;
	}

	let { groups }: { groups: Group[] } = $props();

	function hrefOf(param: string, id: string) {
		const url = new URL(page.url);
		url.searchParams.set(param, id);
		return `${url.pathname}${url.search}`;
	}
</script>

<nav
	class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 border border-border-input bg-white p-1 text-sm"
	aria-label="Prototype"
>
	{#each groups as group, g (group.param)}
		<span class="hidden px-2 font-mono text-xs text-muted-foreground uppercase lg:inline {g ? 'border-l border-border-input pl-3' : ''}">
			{group.label}
		</span>
		{#each group.variants as variant (variant.id)}
			<a
				href={hrefOf(group.param, variant.id)}
				data-sveltekit-noscroll
				data-sveltekit-replacestate
				class="px-3 py-1.5 whitespace-nowrap transition-colors {variant.id === group.current ? 'bg-foreground text-white' : 'hover:bg-surface'}"
				aria-current={variant.id === group.current ? 'page' : undefined}
			>
				{variant.id.toUpperCase()}<span class="hidden lg:inline"> · {variant.name}</span>
			</a>
		{/each}
	{/each}
</nav>
