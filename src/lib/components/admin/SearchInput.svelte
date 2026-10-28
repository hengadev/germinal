<script lang="ts" module>
	import { page } from '$app/state';

	/** The search in the address, to start a list's search with. */
	export function searchFromUrl(): string {
		return page.url.searchParams.get('q') ?? '';
	}
</script>

<script lang="ts">
	// Search-as-you-type over an admin list (see utils/fuzzy-search.ts).
	// What is typed stays in the address (`?q=`), so a reload or « back »
	// keeps it: start `value` from `searchFromUrl()`. « / » anywhere on the
	// page focuses the box, Escape clears it.
	import { replaceState } from '$app/navigation';
	import { Search, X } from 'lucide-svelte';

	let {
		value = $bindable(''),
		label,
		placeholder,
	}: {
		value?: string;
		/** Read by screen readers. */
		label: string;
		placeholder: string;
	} = $props();

	let input: HTMLInputElement | undefined = $state();

	$effect(() => {
		const url = new URL(page.url);
		const q = value.trim();
		if ((url.searchParams.get('q') ?? '') === q) return;
		if (q) url.searchParams.set('q', q);
		else url.searchParams.delete('q');
		replaceState(url, page.state);
	});

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		event.preventDefault();
		input?.focus();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="relative w-full sm:w-72">
	<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
	<input
		bind:this={input}
		bind:value
		type="search"
		aria-label={label}
		{placeholder}
		autocomplete="off"
		spellcheck="false"
		onkeydown={(e) => {
			if (e.key === 'Escape' && value) {
				e.preventDefault();
				value = '';
			}
		}}
		class="w-full h-9 pl-9 pr-16 text-sm rounded-lg border border-border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground [&::-webkit-search-cancel-button]:hidden"
	/>
	{#if value}
		<button
			type="button"
			onclick={() => {
				value = '';
				input?.focus();
			}}
			aria-label="Effacer la recherche"
			class="absolute right-1 top-1/2 -translate-y-1/2 size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
		>
			<X size={14} />
		</button>
	{:else}
		<kbd class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center rounded border border-border-input px-1.5 text-[11px] text-muted-foreground" aria-hidden="true">/</kbd>
	{/if}
</div>
