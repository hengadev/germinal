<script lang="ts">
	// The calendar the Event's Days are picked on.
	// - Tap a free date: it becomes a Day of the Event.
	// - Tap a Day: selects it, to make it an exception (Shift: a run).
	// - Tap a weekday heading: selects every such Day.
	// - « Ajouter une période »: tap the first then the last date, keeping
	//   only the weekdays ticked. Works the same with a finger or a mouse.
	// - With a mouse, dragging across dates also adds them (from a Day:
	//   removes them).
	// Without `editable` (« Menus & tarifs »), Days are only selected.
	import { untrack } from 'svelte';
	import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-svelte';
	import { WEEKDAYS, datesBetween, frDay, frMonth, weekdayOf, type Programme } from './programme.svelte';

	let {
		programme,
		selected = $bindable([]),
		editable = true,
	}: {
		programme: Programme;
		selected?: string[];
		editable?: boolean;
	} = $props();

	// Opens on the Event's first month, or this month for a new Event.
	const start = untrack(() => programme.days[0]) ?? new Date().toISOString().slice(0, 10);
	let year = $state(Number(start.slice(0, 4)));
	let month = $state(Number(start.slice(5, 7)) - 1);

	function shift(n: number) {
		const d = new Date(Date.UTC(year, month + n, 1));
		year = d.getUTCFullYear();
		month = d.getUTCMonth();
	}

	const cells = $derived.by(() => {
		const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
		const key = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, j) => key(j + 1))] as (string | null)[];
	});

	const today = new Date().toISOString().slice(0, 10);
	const inEvent = (date: string) => programme.days.includes(date);

	// ── « Ajouter une période » ──
	let period: { weekdays: number[]; first: string | null } | null = $state(null);
	let hovered: string | null = $state(null);

	function togglePeriodWeekday(day: number) {
		if (!period) return;
		period.weekdays = period.weekdays.includes(day) ? period.weekdays.filter((d) => d !== day) : [...period.weekdays, day];
	}

	// ── Mouse drag ──
	let drag = $state<{ anchor: string; current: string; adding: boolean } | null>(null);

	const preview = $derived.by(() => {
		if (period?.first && hovered) {
			const [a, b] = [period.first, hovered].sort();
			return { dates: datesBetween(a, b, period.weekdays), adding: true };
		}
		if (drag && drag.anchor !== drag.current) {
			const [a, b] = [drag.anchor, drag.current].sort();
			return { dates: datesBetween(a, b, [0, 1, 2, 3, 4, 5, 6]), adding: drag.adding };
		}
		return null;
	});

	function down(date: string, event: PointerEvent) {
		// A finger scrolls the page; only a mouse drags.
		if (!editable || event.pointerType !== 'mouse' || event.button !== 0 || period) return;
		event.preventDefault();
		drag = { anchor: date, current: date, adding: !inEvent(date) };
	}

	// The click that ends a drag must not also tap.
	let suppressClick = false;

	function up() {
		if (!drag) return;
		const { anchor, current, adding } = drag;
		const dates = preview?.dates ?? [];
		drag = null;
		if (anchor === current) return; // a click: handled by `tap`
		suppressClick = true;
		if (adding) programme.addDays(dates);
		else remove(dates.filter(inEvent));
	}

	function tap(date: string, shiftKey: boolean) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		if (period) {
			if (!period.first) period.first = date;
			else {
				const [a, b] = [period.first, date].sort();
				programme.addDays(datesBetween(a, b, period.weekdays));
				period = null;
			}
			return;
		}
		if (!inEvent(date)) {
			if (editable) programme.addDays([date]);
			return;
		}
		const last = selected.at(-1);
		if (shiftKey && last && !selected.includes(date)) {
			const [a, b] = [last, date].sort();
			selected = [...new Set([...selected, ...programme.days.filter((d) => d >= a && d <= b)])];
			return;
		}
		selected = selected.includes(date) ? selected.filter((d) => d !== date) : [...selected, date];
	}

	function remove(dates: string[]) {
		programme.removeDays(dates);
		selected = selected.filter((d) => !dates.includes(d));
	}

	function selectWeekday(day: number) {
		const matching = programme.days.filter((d) => weekdayOf(d) === day);
		const all = matching.length > 0 && matching.every((d) => selected.includes(d));
		selected = all ? selected.filter((d) => !matching.includes(d)) : [...new Set([...selected, ...matching])];
	}

	let grid: HTMLDivElement | undefined = $state();

	/** Focus the calendar (a Day blocks the save). */
	export function focus() {
		grid?.querySelector<HTMLElement>('[role="button"][aria-label]')?.focus();
	}

	function cellClass(date: string): string {
		const isDay = inEvent(date);
		if (preview?.dates.includes(date)) {
			return preview.adding
				? 'border-2 border-dashed border-foreground bg-muted text-foreground'
				: 'border-2 border-dashed border-red-400 bg-red-50 text-red-700';
		}
		if (!isDay) {
			if (!editable) return 'border border-transparent text-muted-foreground/60 cursor-default';
			return period?.first === date
				? 'border-2 border-foreground text-foreground'
				: 'border border-transparent text-muted-foreground hover:border-border-input hover:border-dashed';
		}
		const ring = selected.includes(date) ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-background' : '';
		return `border border-foreground bg-foreground text-background hover:bg-foreground/85 ${ring}`;
	}
</script>

<svelte:window onpointerup={up} onpointercancel={() => (drag = null)} />

<div class="select-none">
	<!-- Month and the period tool -->
	<div class="flex items-center justify-between gap-2 pb-3">
		<div class="flex items-center gap-1">
			<button type="button" onclick={() => shift(-1)} aria-label="Mois précédent" class="p-2 rounded-md hover:bg-muted cursor-pointer">
				<ChevronLeft size={18} />
			</button>
			<h4 class="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">{frMonth(year, month)}</h4>
			<button type="button" onclick={() => shift(1)} aria-label="Mois suivant" class="p-2 rounded-md hover:bg-muted cursor-pointer">
				<ChevronRight size={18} />
			</button>
		</div>
		{#if editable}
			<button
				type="button"
				aria-pressed={period !== null}
				onclick={() => (period = period ? null : { weekdays: [0, 1, 2, 3, 4, 5, 6], first: null })}
				class="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer {period
					? 'bg-foreground text-background border-foreground'
					: 'border-border-input hover:bg-muted'}"
			>
				<CalendarRange size={16} aria-hidden="true" />
				<span class="hidden sm:inline">Ajouter une période</span>
				<span class="sm:hidden">Période</span>
			</button>
		{/if}
	</div>

	{#if period}
		<div class="mb-3 rounded-lg bg-muted px-3 py-2.5 text-sm space-y-2" aria-live="polite">
			<p class="text-foreground">
				{period.first ? `Du ${frDay(period.first)} — touchez maintenant le dernier jour.` : 'Touchez le premier jour de la période.'}
			</p>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span class="text-xs text-foreground-alt">Seulement les</span>
				<div class="flex gap-1">
					{#each WEEKDAYS as weekday (weekday.day)}
						<button
							type="button"
							aria-pressed={period.weekdays.includes(weekday.day)}
							aria-label={weekday.long}
							onclick={() => togglePeriodWeekday(weekday.day)}
							class="size-8 rounded-md text-xs font-medium border transition-colors cursor-pointer {period.weekdays.includes(weekday.day)
								? 'bg-foreground text-background border-foreground'
								: 'border-border-input bg-background text-muted-foreground'}"
						>
							{weekday.short}
						</button>
					{/each}
				</div>
				<button type="button" onclick={() => (period = null)} class="ml-auto text-xs underline underline-offset-2 text-foreground-alt hover:text-foreground cursor-pointer">
					Annuler
				</button>
			</div>
		</div>
	{/if}

	<div bind:this={grid} class="grid grid-cols-7 gap-1 sm:gap-1.5">
		{#each WEEKDAYS as weekday (weekday.day)}
			<button
				type="button"
				onclick={() => selectWeekday(weekday.day)}
				title="Sélectionner tous les {weekday.long}s"
				class="py-1.5 text-[11px] sm:text-xs font-medium text-foreground-alt rounded-md hover:bg-muted hover:text-foreground capitalize cursor-pointer"
			>
				<span class="sm:hidden">{weekday.long.slice(0, 2)}</span><span class="hidden sm:inline">{weekday.long.slice(0, 3)}.</span>
			</button>
		{/each}

		{#each cells as date, i (date ?? `blank-${i}`)}
			{#if date === null}
				<span aria-hidden="true"></span>
			{:else}
				{@const isDay = inEvent(date)}
				<div
					role="button"
					tabindex={isDay || editable ? 0 : -1}
					aria-pressed={isDay && selected.includes(date)}
					aria-label="{frDay(date, 'long')}{isDay ? (programme.isCustom(date) ? ', exception' : ', suit le programme') : editable ? ', ajouter' : ''}"
					onpointerdown={(e) => down(date, e)}
					onpointerenter={() => {
						hovered = date;
						if (drag) drag.current = date;
					}}
					onpointerleave={() => hovered === date && (hovered = null)}
					onclick={(e) => tap(date, e.shiftKey)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							tap(date, e.shiftKey);
						} else if ((e.key === 'Delete' || e.key === 'Backspace') && isDay && editable) remove([date]);
					}}
					class="group relative h-11 sm:h-12 rounded-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 {cellClass(date)}"
				>
					<span class="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums {date === today ? 'underline underline-offset-2' : ''}">
						{Number(date.slice(8))}
					</span>
					{#if isDay && programme.isCustom(date)}
						<span class="absolute bottom-1.5 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
					{/if}
					{#if isDay && editable}
						<button
							type="button"
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								remove([date]);
							}}
							aria-label="Retirer le {frDay(date, 'long')}"
							title="Retirer ce jour"
							class="absolute -right-1.5 -top-1.5 z-10 hidden [@media(hover:hover)]:group-hover:inline-flex items-center justify-center size-5 rounded-full bg-background border border-border-input text-muted-foreground hover:text-red-600 hover:border-red-400 cursor-pointer"
						>
							<X size={11} />
						</button>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
