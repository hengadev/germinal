<script lang="ts">
	// One meal's settings, for the programme (no `base`) or for one or more
	// Days (`base` is the programme's meal: a field that differs from it is
	// marked « personnalisé » and can go back to it in one tap).
	// A Seating's title, description and badge open from its time.
	import { Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-svelte';
	import EnglishVersion from '$lib/components/admin/EnglishVersion.svelte';
	import { formatDayKey } from '$lib/utils/event-time';
	import {
		BADGES,
		FACET_FIELDS,
		MEAL,
		capacityLabel,
		durationLabel,
		endOf,
		frClock,
		infoAt,
		isBlankInfo,
		sameInfo,
		type Facet,
		type SeatingInfo,
		type Field,
		type Kind,
		type MealPlan,
		type Wording,
	} from './programme.svelte';

	let {
		kind,
		facet,
		value,
		base = null,
		overridden = () => false,
		mixed = () => false,
		onset,
		onreset,
		onrename,
		onsetinfo,
		idPrefix,
		words,
		menus = [],
		currency = 'EUR',
		dates = [],
	}: {
		kind: Kind;
		facet: Facet;
		value: MealPlan;
		/** The programme's meal, when editing Days. */
		base?: MealPlan | null;
		overridden?: (field: Field) => boolean;
		/** Several Days selected that disagree on this field. */
		mixed?: (field: Field) => boolean;
		onset: <F extends Field>(field: F, value: MealPlan[F]) => void;
		onreset?: (field: Field) => void;
		/** A start time changed in place: its Seating is kept. */
		onrename: (from: string, to: string) => void;
		/** A Seating's title, description and badge. */
		onsetinfo?: (start: string, info: SeatingInfo) => void;
		idPrefix: string;
		words: Wording;
		/** The Event's Menus (« Menus & tarifs »). */
		menus?: { key: string; label: string }[];
		currency?: string;
		/** The Days edited; none for the programme. */
		dates?: string[];
	} = $props();

	const DURATIONS = $derived.by(() => {
		// 15 min to 6 h, by quarter hours; a saved duration off that list stays.
		const list = Array.from({ length: 24 }, (_, i) => 15 + i * 15);
		if (value.duration !== null && !list.includes(value.duration)) list.push(value.duration);
		return list.sort((a, b) => a - b);
	});

	function nextStart(): string {
		const latest = value.starts.at(-1);
		if (!latest) return kind === 'lunch' ? '12:00' : '19:30';
		return endOf(latest, value.duration ?? 90);
	}

	function addStart() {
		const start = nextStart();
		if (value.starts.includes(start)) return;
		onset('starts', [...value.starts, start].sort());
		requestAnimationFrame(() => document.getElementById(`${idPrefix}-start-${start}`)?.focus());
	}

	function setStart(from: string, to: string) {
		if (!to || to === from || value.starts.includes(to)) return;
		if (openStart === from) openStart = to;
		onrename(from, to);
	}

	/** The Seating whose title, description and badge are open. */
	let openStart: string | null = $state(null);
	$effect(() => {
		if (openStart && !value.starts.includes(openStart)) openStart = null;
	});

	/** This time's info differs from the programme's at the same time. */
	const infoDiffers = (start: string) => !!base && base.starts.includes(start) && !sameInfo(infoAt(value, start), infoAt(base, start));

	function setInfo(start: string, patch: Partial<SeatingInfo>) {
		onsetinfo?.(start, { ...infoAt(value, start), ...patch });
	}

	/** The name a Seating without a title is shown with (as
	 * `derivedSeatingTitle` builds it): its meal, Day and time. */
	function builtName(start: string): string {
		const day = dates.length === 0 ? '<jour>' : formatDayKey(dates[0], 'fr');
		return `${MEAL[kind]} — ${day}, ${frClock(start)}`;
	}

	/** A title goes on this Seating, or on every Seating of the meal those
	 * Days (the default when they all share one). */
	let titleScope: 'meal' | 'seating' = $state('seating');
	$effect(() => {
		if (!openStart) return;
		const titles = new Set(value.starts.map((start) => infoAt(value, start).titleFr));
		titleScope = value.starts.length > 1 && titles.size === 1 ? 'meal' : 'seating';
	});

	function setTitle(start: string, patch: Pick<Partial<SeatingInfo>, 'titleFr' | 'titleEn'>) {
		const starts = titleScope === 'meal' ? value.starts : [start];
		for (const each of starts) setInfo(each, patch);
	}

	const BADGE_LABEL = Object.fromEntries(BADGES.map((badge) => [badge.value, badge.label]));

	function removeStart(start: string) {
		onset('starts', value.starts.filter((t) => t !== start));
	}

	function inherited(field: Field): string {
		if (!base) return '';
		switch (field) {
			case 'served':
				return base.served ? 'servi' : 'non servi';
			case 'starts':
				return base.starts.length ? base.starts.map(frClock).join(' · ') : 'aucune séance';
			case 'duration':
				return durationLabel(base.duration);
			case 'capacity':
				return capacityLabel(base.capacity, words.venueCapacity);
			case 'menu':
				return words.menuName(base.menu);
			case 'price':
				return words.price(base.price);
			case 'published':
				return base.published ? 'en vente' : 'hors vente';
			case 'waitlist':
				return base.waitlist ? 'oui' : 'non';
			case 'seatings':
				return '';
		}
	}

	// The programme's capacity is the Venue Capacity, set once above both meals.
	const shows = (field: Field) => FACET_FIELDS[facet].includes(field) && !(field === 'capacity' && !base);
	const LABEL = 'block text-xs font-medium text-foreground-alt mb-1';
	const INPUT =
		'px-3 py-2 border border-border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent';
</script>

{#snippet mark(field: Field)}
	{#if base && overridden(field)}
		<span class="ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
			<span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
			personnalisé
		</span>
		{#if onreset}
			<button
				type="button"
				onclick={() => onreset(field)}
				class="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
				title="Revenir au programme : {inherited(field)}"
			>
				<RotateCcw size={11} aria-hidden="true" />
				programme : {inherited(field)}
			</button>
		{/if}
	{:else if base && mixed(field)}
		<span class="ml-1.5 text-[11px] text-muted-foreground">valeurs différentes selon les jours</span>
	{/if}
{/snippet}

<div class="space-y-4">
	{#if shows('served')}
		<div class="flex flex-wrap items-center gap-x-1">
			<label class="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
				<input
					id="{idPrefix}-served"
					type="checkbox"
					role="switch"
					checked={value.served}
					onchange={(e) => onset('served', e.currentTarget.checked)}
					class="peer sr-only"
				/>
				<span
					class="relative inline-block h-5 w-9 rounded-full bg-surface-active transition-colors peer-checked:bg-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-background after:transition-transform peer-checked:after:translate-x-4"
					aria-hidden="true"
				></span>
				{base ? `${MEAL[kind]} servi` : `${MEAL[kind]} servi chaque jour`}
			</label>
			{@render mark('served')}
		</div>
	{/if}

	{#if value.served}
		{#if shows('starts')}
			<div>
				<span class={LABEL}>Séances{@render mark('starts')}</span>
				<div class="flex flex-wrap items-center gap-2">
					{#each value.starts as start (start)}
						{@const info = infoAt(value, start)}
						<span class="inline-flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-foreground {openStart === start
							? 'border-foreground'
							: infoDiffers(start)
								? 'border-amber-400'
								: 'border-border-input'}">
							<input
								id="{idPrefix}-start-{start}"
								type="time"
								value={start}
								onchange={(e) => setStart(start, e.currentTarget.value)}
								aria-label="Séance de {frClock(start)}"
								class="bg-transparent pl-3 py-1.5 text-sm tabular-nums focus:outline-none"
							/>
							{#if value.duration !== null}
								<span class="px-1 text-xs text-muted-foreground tabular-nums" aria-hidden="true">→ {frClock(endOf(start, value.duration))}</span>
							{/if}
							{#if onsetinfo}
								<button
									type="button"
									onclick={() => (openStart = openStart === start ? null : start)}
									aria-expanded={openStart === start}
									aria-controls="{idPrefix}-info"
									aria-label="Titre, description et badge de la séance de {frClock(start)}"
									title="Titre, description, badge"
									class="inline-flex items-center gap-1 px-1.5 py-1.5 text-xs cursor-pointer {isBlankInfo(info)
										? 'text-muted-foreground hover:text-foreground'
										: 'text-foreground font-medium'}"
								>
									{#if info.badge !== 'none'}
										<span class="rounded bg-foreground px-1 py-0.5 text-[10px] uppercase tracking-wide text-background">{BADGE_LABEL[info.badge]}</span>
									{:else if info.titleFr || info.descriptionFr}
										<span class="max-w-24 truncate">{info.titleFr || 'Description'}</span>
									{:else}
										<SlidersHorizontal size={13} aria-hidden="true" />
									{/if}
								</button>
							{/if}
							<button
								type="button"
								onclick={() => removeStart(start)}
								aria-label="Retirer la séance de {frClock(start)}"
								class="px-2 py-1.5 text-muted-foreground hover:text-red-600 cursor-pointer"
							>
								<X size={14} />
							</button>
						</span>
					{/each}
					<button
						type="button"
						id="{idPrefix}-add"
						onclick={addStart}
						class="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-dashed border-border-input text-foreground-alt hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
					>
						<Plus size={14} aria-hidden="true" />
						Séance
					</button>
				</div>
				{#if openStart && onsetinfo}
					{@const start = openStart}
					{@const info = infoAt(value, start)}
					{@const titled = !!(info.titleFr || info.titleEn)}
					<div id="{idPrefix}-info" class="mt-3 rounded-lg border border-border-card bg-muted/40 p-3 space-y-3">
						<div class="flex items-start justify-between gap-2">
							<p class="text-sm font-semibold text-foreground">
								Séance de {frClock(start)}
								{#if infoDiffers(start)}
									<span class="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
										<span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>personnalisée
									</span>
									<button
										type="button"
										onclick={() => base && onsetinfo(start, infoAt(base, start))}
										class="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
									>
										<RotateCcw size={11} aria-hidden="true" /> comme le programme
									</button>
								{/if}
							</p>
							<button type="button" onclick={() => (openStart = null)} aria-label="Fermer" class="p-1 -m-1 rounded text-muted-foreground hover:text-foreground cursor-pointer">
								<X size={16} />
							</button>
						</div>
						<!-- What guests read. A title is an exception of the Days:
						     the programme keeps the name built for each Day. -->
						<div class="rounded-md bg-background border border-border-card px-3 py-2">
							<p class="text-xs text-muted-foreground">Nom affiché</p>
							<p class="text-sm text-foreground">
								{info.titleFr || builtName(start)}
								{#if !titled}<span class="text-xs text-muted-foreground">(automatique{dates.length > 1 ? ', selon le jour' : ''})</span>{/if}
							</p>
							{#if titled && base}
								<button
									type="button"
									onclick={() => setTitle(start, { titleFr: '', titleEn: '' })}
									class="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
								>
									<RotateCcw size={11} aria-hidden="true" /> Revenir au nom automatique
								</button>
							{/if}
						</div>
						{#if base || titled}
							<div class="space-y-2">
								{#if base && value.starts.length > 1}
									<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="radiogroup" aria-label="Le titre vaut pour">
										<label class="inline-flex items-center gap-2 cursor-pointer">
											<input type="radio" bind:group={titleScope} value="meal" class="accent-foreground" />
											Toutes les séances du {MEAL[kind].toLowerCase()}
										</label>
										<label class="inline-flex items-center gap-2 cursor-pointer">
											<input type="radio" bind:group={titleScope} value="seating" class="accent-foreground" />
											Cette séance seulement
										</label>
									</div>
								{/if}
								<div>
									<label for="{idPrefix}-info-titleFr" class={LABEL}>Titre {base ? (dates.length > 1 ? 'pour ces jours' : 'pour ce jour') : ''}</label>
									<input
										id="{idPrefix}-info-titleFr"
										type="text"
										maxlength="255"
										value={info.titleFr}
										placeholder={builtName(start)}
										oninput={(e) => setTitle(start, { titleFr: e.currentTarget.value })}
										class="{INPUT} w-full"
									/>
								</div>
							</div>
						{:else}
							<p class="text-xs text-muted-foreground">
								Pour donner un titre à une séance, touchez son jour sur le calendrier : un titre est une exception.
							</p>
						{/if}
						<p class="text-xs text-muted-foreground">
							{base ? 'Description et badge : pour les jours sélectionnés seulement.' : 'Description et badge : pour cette séance, chaque jour qui suit le programme.'}
						</p>
						<div>
							<label for="{idPrefix}-info-descriptionFr" class={LABEL}>Description (facultative)</label>
							<textarea
								id="{idPrefix}-info-descriptionFr"
								rows="2"
								value={info.descriptionFr}
								oninput={(e) => setInfo(start, { descriptionFr: e.currentTarget.value })}
								class="{INPUT} w-full resize-none"
							></textarea>
						</div>
						<div>
							<label for="{idPrefix}-info-badge" class={LABEL}>Badge</label>
							<select
								id="{idPrefix}-info-badge"
								value={info.badge}
								onchange={(e) => setInfo(start, { badge: e.currentTarget.value as SeatingInfo['badge'] })}
								class="{INPUT} pr-8 cursor-pointer"
							>
								{#each BADGES as badge (badge.value)}
									<option value={badge.value}>{badge.label}</option>
								{/each}
							</select>
						</div>
						<EnglishVersion>
							{#if base || titled}
							<div>
								<label for="{idPrefix}-info-titleEn" class={LABEL}>Titre (anglais, facultatif)</label>
								<input
									id="{idPrefix}-info-titleEn"
									type="text"
									maxlength="255"
									value={info.titleEn}
									oninput={(e) => setTitle(start, { titleEn: e.currentTarget.value })}
									class="{INPUT} w-full"
								/>
							</div>
							{/if}
							<div>
								<label for="{idPrefix}-info-descriptionEn" class={LABEL}>Description (anglais, facultative)</label>
								<textarea
									id="{idPrefix}-info-descriptionEn"
									rows="2"
									value={info.descriptionEn}
									oninput={(e) => setInfo(start, { descriptionEn: e.currentTarget.value })}
									class="{INPUT} w-full resize-none"
								></textarea>
							</div>
						</EnglishVersion>
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap gap-4">
			{#if shows('duration')}
				<div>
					<label for="{idPrefix}-duration" class={LABEL}>Durée{@render mark('duration')}</label>
					<select
						id="{idPrefix}-duration"
						value={value.duration ?? ''}
						onchange={(e) => onset('duration', Number(e.currentTarget.value))}
						class="{INPUT} pr-8 cursor-pointer"
					>
						{#if value.duration === null}<option value="" disabled>À choisir</option>{/if}
						{#each DURATIONS as minutes (minutes)}
							<option value={minutes}>{durationLabel(minutes)}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if shows('capacity')}
				<div>
					<label for="{idPrefix}-capacity" class={LABEL}>Places par séance{@render mark('capacity')}</label>
					<input
						id="{idPrefix}-capacity"
						type="number"
						min="1"
						max="10000"
						inputmode="numeric"
						placeholder={words.venueCapacity == null ? 'Sans limite' : `${words.venueCapacity} (lieu)`}
						value={value.capacity ?? ''}
						oninput={(e) => onset('capacity', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
						class="{INPUT} w-36 tabular-nums"
					/>
				</div>
			{/if}
			{#if shows('menu')}
				<div class="min-w-0 max-w-full">
					<label for="{idPrefix}-menu" class={LABEL}>Menu{@render mark('menu')}</label>
					<select
						id="{idPrefix}-menu"
						value={value.menu}
						onchange={(e) => onset('menu', e.currentTarget.value)}
						class="{INPUT} max-w-full pr-8 cursor-pointer"
					>
						<option value="">Aucun menu</option>
						{#each menus as menu (menu.key)}
							<option value={menu.key}>{menu.label}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if shows('price')}
				<div>
					<label for="{idPrefix}-price" class={LABEL}>Prix par convive, {currency}{@render mark('price')}</label>
					<input
						id="{idPrefix}-price"
						type="number"
						min="0"
						step="0.01"
						inputmode="decimal"
						placeholder="Non défini"
						value={value.price ?? ''}
						oninput={(e) => onset('price', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
						class="{INPUT} w-36 tabular-nums"
					/>
				</div>
			{/if}
		</div>

		{#if shows('published') || shows('waitlist')}
			<div class="space-y-2">
				{#each [{ field: 'published' as const, label: 'En vente', help: 'Décoché : ses séances sont cachées du site.' }, { field: 'waitlist' as const, label: 'Liste d’attente quand c’est complet', help: '' }] as option (option.field)}
					{#if shows(option.field)}
						<div class="flex flex-wrap items-center gap-x-1">
							<label class="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
								<input
									id="{idPrefix}-{option.field}"
									type="checkbox"
									checked={value[option.field]}
									onchange={(e) => onset(option.field, e.currentTarget.checked)}
									class="size-4 accent-foreground cursor-pointer"
								/>
								{option.label}
							</label>
							{@render mark(option.field)}
							{#if option.help && !value[option.field]}
								<span class="basis-full pl-6 text-xs text-muted-foreground">{option.help}</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	{:else}
		<p class="text-sm text-muted-foreground">
			Pas de {MEAL[kind].toLowerCase()}{base ? (base.served ? ' ces jours-là' : '') : ''}.{#if !shows('served')}
				Il se règle dans « Dates &amp; séances ».{/if}
		</p>
	{/if}
</div>
