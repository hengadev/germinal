<script module lang="ts">
	// Types shared with the pages that host the picker. The serialized form
	// of `PickedDay` is parsed server-side by `parsePickedDays`.
	export type PickerServiceKind = 'lunch' | 'dinner';
	export type PickedDay = { date: string; kinds: PickerServiceKind[] };
</script>

<script lang="ts">
	// Days & Services picker (issue 019): the admin ticks the Event's Days
	// individually on a month calendar — non-consecutive Days are allowed —
	// and picks lunch and/or dinner per Day, or once for all Days. The
	// Event's start/end dates are derived from the first and last Day.
	import { Popover } from 'bits-ui';
	import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';

	let {
		days = $bindable(),
		idPrefix = 'days-picker',
	}: {
		/** The picked Days, kept sorted by date; two-way bound. */
		days: PickedDay[];
		/** Prefix for element ids, unique per form. */
		idPrefix?: string;
	} = $props();

	const WEEKDAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
	const ORDERED_KINDS: PickerServiceKind[] = ['lunch', 'dinner'];

	function todayKey(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function toKey(year: number, month: number, day: number): string {
		return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	function sortedKinds(kinds: PickerServiceKind[]): PickerServiceKind[] {
		return ORDERED_KINDS.filter((kind) => kinds.includes(kind));
	}

	// Anchor the calendar on the first picked Day when editing, else today.
	let view = $state(monthOf(days.length > 0 ? days[0].date : todayKey()));

	function monthOf(key: string): { year: number; month: number } {
		return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
	}

	function shiftMonth(delta: number) {
		const anchor = new Date(Date.UTC(view.year, view.month + delta, 1));
		view = { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() };
	}

	function monthLabel(): string {
		return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
			.format(new Date(Date.UTC(view.year, view.month, 15, 12)));
	}

	interface CalendarCell {
		key: string;
		day: number;
	}

	// Monday-first grid of the viewed month, padded with empty cells.
	const cells = $derived.by(() => {
		const first = new Date(Date.UTC(view.year, view.month, 1));
		const leading = (first.getUTCDay() + 6) % 7;
		const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
		const out: (CalendarCell | null)[] = Array.from({ length: leading }, () => null);
		for (let day = 1; day <= daysInMonth; day++) {
			out.push({ key: toKey(view.year, view.month, day), day });
		}
		return out;
	});

	function dayByKey(key: string): PickedDay | undefined {
		return days.find((day) => day.date === key);
	}

	function toggleDay(key: string) {
		if (dayByKey(key)) {
			days = days.filter((day) => day.date !== key);
		} else {
			// A newly picked Day defaults to dinner — most Germinal meals are
			// dinners; adjust per Day or with the "tous les jours" controls.
			days = sortDays([...days, { date: key, kinds: ['dinner'] }]);
		}
	}

	function sortDays(list: PickedDay[]): PickedDay[] {
		return [...list].sort((a, b) => a.date.localeCompare(b.date));
	}

	function toggleKind(date: string, kind: PickerServiceKind, on: boolean) {
		days = days.map((day) => {
			if (day.date !== date) return day;
			return {
				date,
				kinds: on
					? sortedKinds([...day.kinds, kind])
					: day.kinds.filter((candidate) => candidate !== kind),
			};
		});
	}

	const sortedDays = $derived(sortDays(days));

	function allHave(kind: PickerServiceKind): boolean {
		return sortedDays.length > 0 && sortedDays.every((day) => day.kinds.includes(kind));
	}

	function someHave(kind: PickerServiceKind): boolean {
		return sortedDays.some((day) => day.kinds.includes(kind));
	}

	function toggleAll(kind: PickerServiceKind, on: boolean) {
		days = sortedDays.map((day) => ({
			date: day.date,
			kinds: on
				? sortedKinds([...day.kinds, kind])
				: day.kinds.filter((candidate) => candidate !== kind),
		}));
	}

	// "Tous les jours" checkboxes show a mixed state when only some Days
	// offer the meal.
	let lunchAllEl: HTMLInputElement | undefined = $state();
	let dinnerAllEl: HTMLInputElement | undefined = $state();
	$effect(() => {
		const lunch = someHave('lunch');
		const dinner = someHave('dinner');
		if (lunchAllEl) lunchAllEl.indeterminate = lunch && !allHave('lunch');
		if (dinnerAllEl) dinnerAllEl.indeterminate = dinner && !allHave('dinner');
	});

	function frDate(key: string, options: Intl.DateTimeFormatOptions): string {
		// Noon UTC keeps the date stable under any local time zone offset.
		return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options })
			.format(new Date(`${key}T12:00:00Z`));
	}

	// The Event's window follows from its first and last Day (ADR 0005).
	const summary = $derived.by(() => {
		if (sortedDays.length === 0) return null;
		const first = frDate(sortedDays[0].date, { day: 'numeric', month: 'long', year: 'numeric' });
		const last = frDate(
			sortedDays[sortedDays.length - 1].date,
			{ day: 'numeric', month: 'long', year: 'numeric' }
		);
		const span = sortedDays.length === 1
			? `1 jour sélectionné — l'événement se tiendra le ${first}.`
			: `${sortedDays.length} jours sélectionnés — du ${first} au ${last}.`;
		return `${span} Les dates de début et de fin de l'événement en sont dérivées.`;
	});

	// The form's enhance handler focuses here when the Days are missing.
	let wrapperEl: HTMLDivElement | undefined = $state();

	export function focus() {
		wrapperEl?.focus();
	}
</script>

<div bind:this={wrapperEl} id={idPrefix} tabindex="-1" class="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 rounded-lg">
	<div>
		<span class="block text-sm font-medium text-foreground-alt mb-1">
			Jours de l'événement <span class="text-red-500">*</span>
		</span>
		<p class="text-xs text-muted-foreground">
			Sélectionnez chaque date où l'événement a lieu — des dates non consécutives sont permises.
			Un jour nouvellement sélectionné est coché «&nbsp;dîner&nbsp;» par défaut.
		</p>
	</div>

	<!-- Month calendar, in a popover so it only takes room while picking.
	     It holds no form fields (the hidden `days` input is outside), so
	     the popover unmounting it when closed is safe. -->
	<Popover.Root>
		<Popover.Trigger
			class="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-border-input rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer"
		>
			<CalendarDays size={16} aria-hidden="true" />
			{sortedDays.length === 0 ? 'Choisir les jours' : 'Ajouter ou retirer des jours'}
		</Popover.Trigger>
		<Popover.Content
			side="bottom"
			align="start"
			sideOffset={8}
			class="z-50 w-[min(28rem,calc(100vw-2rem))] border border-border-input rounded-lg p-4 bg-background shadow-lg"
		>
			<div class="flex items-center justify-between mb-3">
				<button
					type="button"
					onclick={() => shiftMonth(-1)}
					aria-label="Mois précédent"
					class="inline-flex items-center justify-center size-8 rounded-md text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
				>
					<ChevronLeft size={18} />
				</button>
				<span class="text-sm font-medium capitalize">{monthLabel()}</span>
				<button
					type="button"
					onclick={() => shiftMonth(1)}
					aria-label="Mois suivant"
					class="inline-flex items-center justify-center size-8 rounded-md text-foreground-alt hover:text-foreground hover:bg-muted transition-colors"
				>
					<ChevronRight size={18} />
				</button>
			</div>

			<div class="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Calendrier — jours de l'événement">
				{#each WEEKDAY_LABELS as weekday}
					<span class="text-xs text-muted-foreground py-1">{weekday}</span>
				{/each}
				{#each cells as cell, i}
					{#if cell}
						{@const picked = dayByKey(cell.key)}
						<button
							type="button"
							aria-pressed={Boolean(picked)}
							aria-label={frDate(cell.key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
							onclick={() => toggleDay(cell.key)}
							class="h-9 w-full text-sm rounded-md transition-colors cursor-pointer {picked
								? 'bg-foreground text-background font-semibold'
								: 'text-foreground hover:bg-muted'}"
						>
							{cell.day}
						</button>
					{:else}
						<span aria-hidden="true"></span>
					{/if}
				{/each}
			</div>

			<div class="mt-3 flex items-center justify-between">
				<button
					type="button"
					onclick={() => (view = monthOf(todayKey()))}
					class="text-xs text-foreground-alt hover:text-foreground font-medium cursor-pointer"
				>
					Revenir au mois en cours
				</button>
				<Popover.Close
					class="px-3 py-1.5 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer"
				>
					Terminé
				</Popover.Close>
			</div>
		</Popover.Content>
	</Popover.Root>

	<!-- Meals per Day, with the "tous les jours" shortcut -->
	<div class="space-y-2">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
			<span class="text-sm font-medium text-foreground-alt">Repas par jour</span>
			<div class="flex flex-wrap gap-4">
				<label for="{idPrefix}-lunch-all" class="inline-flex items-center gap-2 text-sm cursor-pointer">
					<input
						id="{idPrefix}-lunch-all"
						bind:this={lunchAllEl}
						type="checkbox"
						checked={allHave('lunch')}
						onchange={(event) => toggleAll('lunch', event.currentTarget.checked)}
						class="w-4 h-4 text-foreground border-border-input rounded focus:ring-foreground cursor-pointer"
					/>
					Déjeuner — tous les jours
				</label>
				<label for="{idPrefix}-dinner-all" class="inline-flex items-center gap-2 text-sm cursor-pointer">
					<input
						id="{idPrefix}-dinner-all"
						bind:this={dinnerAllEl}
						type="checkbox"
						checked={allHave('dinner')}
						onchange={(event) => toggleAll('dinner', event.currentTarget.checked)}
						class="w-4 h-4 text-foreground border-border-input rounded focus:ring-foreground cursor-pointer"
					/>
					Dîner — tous les jours
				</label>
			</div>
		</div>

		{#if sortedDays.length === 0}
			<p class="text-sm text-muted-foreground">Aucun jour sélectionné pour le moment.</p>
		{:else}
			<ul class="divide-y divide-border-card border border-border-input rounded-lg">
				{#each sortedDays as day (day.date)}
					<li class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5">
						<span class="text-sm capitalize">{frDate(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
						<span class="flex items-center gap-4">
							<label for="{idPrefix}-{day.date}-lunch" class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
								<input
									id="{idPrefix}-{day.date}-lunch"
									type="checkbox"
									checked={day.kinds.includes('lunch')}
									onchange={(event) => toggleKind(day.date, 'lunch', event.currentTarget.checked)}
									class="w-4 h-4 text-foreground border-border-input rounded focus:ring-foreground cursor-pointer"
								/>
								Déjeuner
							</label>
							<label for="{idPrefix}-{day.date}-dinner" class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
								<input
									id="{idPrefix}-{day.date}-dinner"
									type="checkbox"
									checked={day.kinds.includes('dinner')}
									onchange={(event) => toggleKind(day.date, 'dinner', event.currentTarget.checked)}
									class="w-4 h-4 text-foreground border-border-input rounded focus:ring-foreground cursor-pointer"
								/>
								Dîner
							</label>
							<button
								type="button"
								onclick={() => toggleDay(day.date)}
								class="text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer"
							>
								Retirer
							</button>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if summary}
		<p class="text-xs text-muted-foreground">{summary}</p>
	{/if}

	<input type="hidden" name="days" value={JSON.stringify(sortedDays)} />
</div>
