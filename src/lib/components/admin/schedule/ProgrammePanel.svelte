<script lang="ts">
	// The right-hand panel: lunch and dinner, for the programme or, when
	// Days are selected on the calendar, for those Days only. Its heading
	// always says which: « Programme type » (every Day) or an amber
	// « Exception » band naming the Days. One meal shows at a time behind
	// tabs, each tab keeping its meal's summary line in view.
	import { untrack, type Snippet } from 'svelte';
	import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-svelte';
	import MealFields from './MealFields.svelte';
	import {
		FACET_FIELDS,
		KINDS,
		MEAL,
		daysSummary,
		frDay,
		mealLine,
		type Kind,
		type Programme,
		type Wording,
	} from './programme.svelte';

	let {
		programme,
		selected = $bindable([]),
		words,
		menus,
		currency,
		idPrefix,
		programmeExtra,
	}: {
		programme: Programme;
		selected?: string[];
		words: Wording;
		menus?: { key: string; label: string }[];
		currency?: string;
		idPrefix: string;
		/** Settings of the programme shared by both meals (the Venue Capacity). */
		programmeExtra?: Snippet;
	} = $props();

	const facet = $derived(programme.facet);
	const dates = $derived([...selected].sort());
	const exception = $derived(dates.length > 0);
	const custom = $derived(programme.customDays());
	const differs = $derived(dates.some((date) => programme.isCustom(date)));

	let open: Kind = $state('lunch');

	const view = (kind: Kind) => (exception ? programme.selection(dates, kind) : null);

	/** On the selected Days: this meal differs from the programme. In the
	 * programme: how many Days make an exception of this meal. */
	function marks(kind: Kind): { differs: boolean; count: number } {
		const v = view(kind);
		if (v) return { differs: FACET_FIELDS[facet].some((f) => v.overridden(f)), count: 0 };
		return { differs: false, count: programme.days.filter((d) => programme.differences(d, kind).length > 0).length };
	}

	function summary(kind: Kind): string {
		const v = view(kind);
		if (v && FACET_FIELDS[facet].some((f) => v.mixed(f))) return 'Diffère selon les jours';
		return mealLine(v ? v.value : programme.plan[kind], kind, facet, words);
	}

	// Selecting Days whose exception is on one meal shows that meal — only
	// when the selection changes, never against a tab just chosen.
	$effect(() => {
		void dates;
		untrack(() => {
			if (!exception) return;
			const differing = KINDS.filter((k) => marks(k).differs);
			if (differing.length === 1) open = differing[0];
		});
	});

	function removeSelected() {
		programme.removeDays(selected);
		selected = [];
	}

	/** Show the programme and open a meal (a field there blocks the save). */
	export function show(kind?: Kind) {
		selected = [];
		if (kind) open = kind;
	}
</script>

{#if exception}
	<header class="px-5 pt-4 pb-4 bg-amber-50 border-b border-amber-200 rounded-t-lg">
		<button
			type="button"
			onclick={() => (selected = [])}
			class="-ml-1 mb-2 inline-flex items-center gap-1 px-1 py-0.5 text-sm text-amber-900/80 hover:text-amber-950 rounded cursor-pointer"
		>
			<ArrowLeft size={14} aria-hidden="true" /> Programme type
		</button>
		<h3 class="text-lg font-semibold text-amber-950 first-letter:uppercase">
			Exception — {dates.length === 1 ? frDay(dates[0], 'long') : `${dates.length} jours`}
		</h3>
		{#if dates.length > 1}
			<p class="text-sm text-amber-900 first-letter:uppercase">
				{dates.slice(0, 5).map((d) => frDay(d)).join(', ')}{dates.length > 5 ? `… (+${dates.length - 5})` : ''}
			</p>
		{/if}
		<p class="mt-1 text-sm text-amber-900/80">
			Ce que vous changez ici ne vaut que pour {dates.length > 1 ? 'ces jours' : 'ce jour'} ; le reste suit le programme type.
		</p>
	</header>
{:else}
	<header class="px-5 pt-5 pb-4 border-b border-border-card">
		<h3 class="text-lg font-semibold text-foreground">Programme type</h3>
		<p class="text-sm text-muted-foreground">
			{#if programme.days.length === 0}
				Ce qui se passe chaque jour. {programme.canEditDays ? 'Choisissez les jours sur le calendrier.' : ''}
			{:else}
				S’applique à chaque jour — {daysSummary(programme.days).toLowerCase()}{#if custom.length > 0}, sauf
					<span class="text-amber-700">{custom.length} exception{custom.length > 1 ? 's' : ''}</span>{/if}. Touchez un jour pour
				l’en écarter.
			{/if}
		</p>
		{#if programmeExtra}
			<div class="mt-4">{@render programmeExtra()}</div>
		{/if}
	</header>
{/if}

<div class="px-3 pt-3">
	<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Repas">
		{#each KINDS as kind (kind)}
			{@const active = open === kind}
			{@const m = marks(kind)}
			<button
				type="button"
				role="tab"
				id="{idPrefix}-tab-{kind}"
				aria-selected={active}
				aria-controls="{idPrefix}-meal"
				onclick={() => (open = kind)}
				class="min-w-0 rounded-md px-3 py-2 text-left transition-colors cursor-pointer {active
					? 'bg-background ring-1 ring-border-card'
					: 'hover:bg-background/60'}"
			>
				<span class="flex flex-wrap items-center justify-between gap-x-2">
					<span class="text-sm font-semibold {active ? 'text-foreground' : 'text-foreground-alt'}">{MEAL[kind]}</span>
					{#if m.differs || m.count > 0}
						<span class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
							<span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
							{m.differs ? 'personnalisé' : `${m.count} exception${m.count > 1 ? 's' : ''}`}
						</span>
					{/if}
				</span>
				<span class="block truncate text-xs tabular-nums text-muted-foreground">{summary(kind)}</span>
			</button>
		{/each}
	</div>
</div>

<div id="{idPrefix}-meal" role="tabpanel" aria-labelledby="{idPrefix}-tab-{open}" class="px-5 py-5">
	{#key open}
		{@const v = view(open)}
		{@const kind = open}
		<MealFields
			{kind}
			{facet}
			{words}
			{menus}
			{currency}
			value={v ? v.value : programme.plan[kind]}
			base={v ? programme.plan[kind] : null}
			overridden={v?.overridden}
			mixed={v?.mixed}
			onset={v ? v.set : (field, value) => programme.setProgramme(kind, field, value)}
			onreset={v?.reset}
			onrename={v ? v.rename : (from, to) => programme.renameStart(null, kind, from, to)}
			onsetinfo={facet === 'seances' ? (v ? v.setInfo : (start, info) => programme.setSeatingInfo(null, kind, start, info)) : undefined}
			{dates}
			idPrefix="{idPrefix}-{exception ? 'sel' : 'prog'}-{kind}"
		/>
	{/key}
</div>

{#if exception && (differs || programme.canEditDays)}
	<footer class="flex flex-wrap gap-1 px-3 py-3 border-t border-border-card">
		{#if differs}
			<button
				type="button"
				onclick={() => dates.forEach((date) => programme.reset(date))}
				class="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-foreground-alt hover:text-foreground hover:bg-muted rounded-lg cursor-pointer"
			>
				<RotateCcw size={14} aria-hidden="true" /> Annuler l’exception
			</button>
		{/if}
		{#if programme.canEditDays}
			<button
				type="button"
				onclick={removeSelected}
				class="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
			>
				<Trash2 size={14} aria-hidden="true" /> Retirer {dates.length > 1 ? 'ces jours' : 'ce jour'} de l’événement
			</button>
		{/if}
	</footer>
{/if}
