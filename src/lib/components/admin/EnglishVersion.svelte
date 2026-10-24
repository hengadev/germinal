<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	const KEY = Symbol('english-auto');

	/** Whether the server generates the English (a DeepL key is configured). */
	export function setEnglishAuto(enabled: () => boolean): void {
		setContext(KEY, enabled);
	}

	/** Whether the English is generated; call while a component initialises. */
	export function getEnglishAuto(): boolean {
		return getContext<(() => boolean) | undefined>(KEY)?.() ?? false;
	}
</script>

<script lang="ts">
	// The English of a tab's French fields, folded away: the Admin writes in
	// French and the English is generated on save (event-translation.ts).
	// Without translation it is typed by hand, so it starts open.
	import type { Snippet } from 'svelte';
	import { Languages } from 'lucide-svelte';

	let { children }: { children: Snippet } = $props();

	const englishAuto = getEnglishAuto();
</script>

<details class="group rounded-lg border border-border-card" open={!englishAuto}>
	<summary class="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-foreground-alt hover:text-foreground select-none">
		<Languages size={16} aria-hidden="true" />
		Version anglaise
		<span class="ml-auto text-xs font-normal text-muted-foreground">
			{englishAuto ? 'Traduite automatiquement' : 'À saisir'}
		</span>
	</summary>
	<div class="space-y-6 px-4 pb-4">
		<p class="text-xs text-muted-foreground">
			{#if englishAuto}
				Générée depuis le français à chaque enregistrement. Une correction faite ici est gardée tant que le
				français correspondant ne change pas.
			{:else}
				La traduction automatique n’est pas configurée : saisissez l’anglais vous-même.
			{/if}
		</p>
		{@render children()}
	</div>
</details>
