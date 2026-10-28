<script lang="ts">
	// An Event's schedule in two panels: the Days on the left (calendar,
	// then the exceptions, so none is ever hidden), lunch and dinner on the
	// right (the programme type, or the Days selected). Side by side from a
	// landscape tablet up; stacked below, where a strip under the calendar
	// leads from the selected Days to their settings.
	// Used by « Dates & séances » (Days, times, capacity) and « Menus &
	// tarifs » (Menu and price, on the Days picked in the other tab).
	import type { Snippet } from 'svelte';
	import { ArrowDown, X } from 'lucide-svelte';
	import ProgrammeCalendar from './ProgrammeCalendar.svelte';
	import ProgrammePanel from './ProgrammePanel.svelte';
	import { daysSummary, describeException, frDay, type Kind, type Programme, type Wording } from './programme.svelte';

	let {
		programme,
		words,
		menus,
		currency,
		idPrefix,
		programmeExtra,
		onnewmenu,
	}: {
		programme: Programme;
		words: Wording;
		menus?: { key: string; label: string }[];
		currency?: string;
		idPrefix: string;
		programmeExtra?: Snippet;
		/** « + Nouveau menu… » in the Menu list: create one, then `use` it. */
		onnewmenu?: (use: (key: string) => void) => void;
	} = $props();

	let selected: string[] = $state([]);
	let aside: HTMLElement | undefined = $state();
	let calendar: ReturnType<typeof ProgrammeCalendar> | undefined = $state();
	let panel: ReturnType<typeof ProgrammePanel> | undefined = $state();

	const exceptions = $derived(programme.customDays());
	const editable = $derived(programme.canEditDays);

	// Days removed elsewhere (« Annuler ») leave the selection.
	$effect(() => {
		const days = programme.days;
		if (selected.some((d) => !days.includes(d))) selected = selected.filter((d) => days.includes(d));
	});

	function showPanel() {
		aside?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/** Focus the calendar (the Days block the save). */
	export function focusDays() {
		calendar?.focus();
	}

	/** Show the programme, a meal open (a field of it blocks the save). */
	export function showProgramme(kind?: Kind) {
		panel?.show(kind);
	}

	/** Select Days to show their settings. */
	export function select(dates: string[], kind?: Kind) {
		panel?.show(kind);
		selected = dates;
	}
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] items-start">
	<!-- Left: the Days -->
	<section class="bg-background rounded-lg border border-border-card" aria-labelledby="{idPrefix}-days-title">
		<header class="px-4 sm:px-5 pt-5 pb-3">
			<h3 id="{idPrefix}-days-title" class="text-lg font-semibold text-foreground">Jours</h3>
			<p class="text-sm text-muted-foreground">{daysSummary(programme.days)}</p>
		</header>
		<div class="px-3 sm:px-5 pb-4">
			<ProgrammeCalendar bind:this={calendar} {programme} bind:selected {editable} />
			<p class="mt-3 text-xs text-muted-foreground">
				{#if editable}
					Touchez une date pour l’ajouter (elle se remplit), ou « Ajouter une période ».
				{:else}
					Les jours se choisissent dans l’onglet « Dates &amp; séances ».
				{/if}
				Touchez un jour pour en faire une exception, ou l’en-tête d’une colonne pour tous ces jours-là.
				{#if editable}<span class="hidden [@media(hover:hover)]:inline">À la souris, glissez pour ajouter une période d’un coup.</span>{/if}
			</p>
		</div>

		<!-- Stacked layout: from the selected Days to their settings -->
		{#if selected.length > 0}
			<div class="lg:hidden mx-3 sm:mx-5 mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
				<p class="min-w-0 flex-1 truncate text-sm text-amber-950">
					<span class="font-semibold">Exception</span> —
					{selected.length === 1 ? frDay(selected[0]) : `${selected.length} jours`}
				</p>
				<button
					type="button"
					onclick={showPanel}
					class="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-foreground text-background cursor-pointer"
				>
					<ArrowDown size={15} aria-hidden="true" /> Régler
				</button>
				<button type="button" onclick={() => (selected = [])} aria-label="Désélectionner" class="p-2 rounded-lg text-amber-900 hover:bg-amber-100 cursor-pointer">
					<X size={18} />
				</button>
			</div>
		{/if}

		<div class="border-t border-border-card px-4 sm:px-5 py-4">
			<h4 class="text-sm font-semibold text-foreground">
				Exceptions{#if exceptions.length > 0}<span class="ml-1 font-normal text-muted-foreground">({exceptions.length})</span>{/if}
			</h4>
			{#if exceptions.length === 0}
				<p class="mt-1 text-sm text-muted-foreground">
					{programme.days.length === 0 ? 'Aucun jour pour le moment.' : 'Aucune : tous les jours suivent le programme type.'}
				</p>
			{:else}
				<ul class="mt-2 -mx-2">
					{#each exceptions as date (date)}
						{@const isSelected = selected.length === 1 && selected[0] === date}
						<li>
							<button
								type="button"
								onclick={() => {
									selected = [date];
									if (window.matchMedia('(max-width: 1023px)').matches) showPanel();
								}}
								class="w-full flex flex-col sm:flex-row sm:items-baseline gap-x-3 px-2 py-2 rounded-md text-left text-sm transition-colors cursor-pointer {isSelected
									? 'bg-amber-50'
									: 'hover:bg-muted'}"
							>
								<span class="shrink-0 sm:w-28 font-medium text-foreground first-letter:uppercase">{frDay(date)}</span>
								<span class="text-foreground-alt">{describeException(programme, date, words).join(' · ')}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<!-- Right: lunch and dinner -->
	<aside
		bind:this={aside}
		class="scroll-mt-16 lg:sticky lg:top-4 bg-background rounded-lg border {selected.length ? 'border-amber-300' : 'border-border-card'}"
		aria-label="Déjeuner et dîner"
	>
		<ProgrammePanel bind:this={panel} {programme} bind:selected {words} {menus} {currency} {idPrefix} {programmeExtra} {onnewmenu} />
	</aside>
</div>
