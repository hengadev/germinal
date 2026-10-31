<script lang="ts">
	/**
	 * The A / B / C variant switcher (issue 031), shown only when the URL
	 * carries `?nav=` or a variant was stored in localStorage. Removed once
	 * the user has picked a variant.
	 */
	let {
		variant,
		select,
	}: { variant: "a" | "b" | "c"; select: (v: "a" | "b" | "c") => void } = $props();
</script>

<div
	class="fixed top-16 right-3 z-[60] flex flex-col gap-1 bg-background border border-border-card rounded-lg p-1 shadow-lg"
	aria-label="Variante de barre de navigation"
>
	{#each ["a", "b", "c"] as const as v}
		<button
			type="button"
			onclick={() => select(v)}
			class="w-9 h-9 min-h-0 rounded-md text-sm font-semibold uppercase transition-colors {variant === v
				? 'bg-foreground text-background'
				: 'text-foreground-alt hover:bg-surface-hover hover:text-foreground'}"
			aria-pressed={variant === v}
		>
			{v}
		</button>
	{/each}
</div>
