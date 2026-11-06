<script lang="ts">
	// The Event's Drinks cards, edited on the card like MenuCardEditor
	// edits its Menus (issue 087): the cards as tabs, and the chosen one
	// laid out as guests read it — name, then its sections (label in small
	// capitals), each drink a line with its price on the right and its
	// description under it — then the note. FR/EN shows the card in either
	// language; with translation on, the English is generated from the
	// French on save and a correction typed here is kept.
	import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-svelte';
	import {
		MAX_DRINK_CARD_NOTE,
		MAX_DRINK_DESCRIPTION,
		MAX_DRINK_NAME,
		MAX_DRINK_SECTION_LABEL,
		MAX_DRINK_SECTIONS,
		MAX_DRINKS_PER_SECTION,
	} from '$lib/types/pricing-editor';
	import { newDrink, type DraftDrinkCard } from './DrinkCardEditor.svelte';

	let {
		cards,
		selected = $bindable(),
		english = $bindable(false),
		englishAuto,
		cardLabel,
		offering,
		onadd,
	}: {
		cards: DraftDrinkCard[];
		/** Key of the card shown. */
		selected: string | null;
		english?: boolean;
		englishAuto: boolean;
		cardLabel: (card: DraftDrinkCard, index: number) => string;
		/** How many meals offer this card. */
		offering: (card: DraftDrinkCard) => number;
		onadd: () => void;
	} = $props();

	const index = $derived(cards.findIndex((c) => c.key === selected));
	const card = $derived(index === -1 ? undefined : cards[index]);

	/** Key of the section the bar acts on. */
	let current: number | null = $state(null);
	const at = $derived(card ? card.sections.findIndex((s) => s.key === current) : -1);

	function focusLater(id: string) {
		requestAnimationFrame(() => document.getElementById(id)?.focus());
	}

	function move(to: number) {
		if (!card || at === -1 || to < 0 || to >= card.sections.length) return;
		const [section] = card.sections.splice(at, 1);
		card.sections.splice(to, 0, section);
	}

	/** A new section after the current one, or at the end. */
	function insert() {
		if (!card || card.sections.length >= MAX_DRINK_SECTIONS) return;
		const after = at === -1 ? card.sections.length - 1 : at;
		const section = { key: nextKey(), labelFr: '', labelEn: '', drinks: [newDrink()] };
		card.sections.splice(after + 1, 0, section);
		current = section.key;
		focusLater(drinkId(section.key, section.drinks[0].key));
	}

	let keySeq = 0;
	const nextKey = () => keySeq++;

	function addDrink(sectionKey: number) {
		const section = card?.sections.find((s) => s.key === sectionKey);
		if (!section || section.drinks.length >= MAX_DRINKS_PER_SECTION) return;
		const drink = newDrink();
		section.drinks.push(drink);
		focusLater(drinkId(section.key, drink.key));
	}

	function remove() {
		if (!card || at === -1) return;
		card.sections.splice(at, 1);
		current = card.sections[Math.max(0, at - 1)]?.key ?? null;
	}

	const drinkId = (sectionKey: number, drinkKey: number) =>
		`drink-${card?.key}-section-${sectionKey}-drink-${drinkKey}${english ? 'En' : 'Fr'}`;

	// Inputs that read as the printed card until touched.
	const BARE =
		'w-full bg-transparent text-center rounded-sm border border-transparent hover:border-border-input focus:border-foreground focus:outline-none placeholder:text-muted-foreground/60';
	const LABEL = `${BARE} text-[11px] uppercase tracking-[0.2em] text-muted-foreground`;
	const TOOL =
		'flex-1 min-h-11 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] text-foreground-alt hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default';
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-border-card pb-3">
	<div class="flex flex-wrap gap-1" role="tablist" aria-label="Cartes des boissons">
		{#each cards as c, i (c.key)}
			<button
				type="button"
				role="tab"
				aria-selected={c.key === selected}
				onclick={() => (selected = c.key)}
				class="max-w-[14rem] truncate px-3 py-1.5 text-sm rounded-md text-foreground-alt hover:bg-muted aria-selected:bg-foreground aria-selected:text-background cursor-pointer"
			>
				{cardLabel(c, i)}
			</button>
		{/each}
		<button
			type="button"
			onclick={onadd}
			class="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md text-foreground-alt hover:bg-muted cursor-pointer"
		>
			<Plus size={14} aria-hidden="true" />
			{cards.length === 0 ? 'Créer une carte' : 'Nouvelle'}
		</button>
	</div>
	<div class="ml-auto inline-flex rounded-md bg-muted p-0.5 text-xs" role="group" aria-label="Langue de la carte">
		<button type="button" onclick={() => (english = false)} aria-pressed={!english} class="px-2.5 py-1 rounded aria-pressed:bg-background aria-pressed:shadow-sm cursor-pointer">FR</button>
		<button type="button" onclick={() => (english = true)} aria-pressed={english} class="px-2.5 py-1 rounded aria-pressed:bg-background aria-pressed:shadow-sm cursor-pointer">EN</button>
	</div>
</div>

{#if english}
	<p class="mt-3 text-xs text-muted-foreground">
		{englishAuto
			? 'L’anglais est traduit du français à chaque enregistrement ; une correction faite ici est gardée tant que le français ne change pas.'
			: 'La traduction automatique n’est pas configurée : saisissez l’anglais vous-même.'}
	</p>
{/if}

{#if card}
	{@const c = card}
	<div class="mx-auto max-w-md px-2 py-8 text-foreground" style="font-family: 'Newsreader Variable', serif">
		{#if english}
			<input
				id="drink-{c.key}-nameEn"
				aria-label="Nom de la carte (anglais)"
				maxlength="255"
				bind:value={c.nameEn}
				placeholder={c.nameFr || 'Drinks'}
				class="{BARE} text-3xl"
				style="font-family: 'Gilda Display', serif"
			/>
		{:else}
			<input
				id="drink-{c.key}-nameFr"
				aria-label="Nom de la carte"
				maxlength="255"
				required
				bind:value={c.nameFr}
				placeholder="Nom de la carte"
				class="{BARE} text-3xl"
				style="font-family: 'Gilda Display', serif"
			/>
		{/if}
		<span class="mx-auto my-5 block h-px w-10 bg-foreground/40" aria-hidden="true"></span>

		<ol aria-label="Sections">
			{#each c.sections as section, s (section.key)}
				<li
					class="my-1 rounded-lg border px-2 py-3 transition-colors {section.key === current ? 'border-foreground/30 bg-background' : 'border-transparent'}"
					onfocusin={() => (current = section.key)}
					onpointerdown={() => (current = section.key)}
				>
					{#if english}
						<input maxlength={MAX_DRINK_SECTION_LABEL} bind:value={section.labelEn} placeholder={section.labelFr || 'Section'} aria-label="Section {s + 1} (anglais)" class={LABEL} />
					{:else}
						<input maxlength={MAX_DRINK_SECTION_LABEL} bind:value={section.labelFr} placeholder="Section (Cocktails, Soft…)" aria-label="Section {s + 1}" class={LABEL} />
					{/if}
					{#each section.drinks as drink, d (drink.key)}
						<div class="relative">
							<div class="flex items-baseline gap-3">
								{#if english}
									<input
										id={drinkId(section.key, drink.key)}
										maxlength={MAX_DRINK_NAME}
										bind:value={drink.nameEn}
										placeholder={drink.nameFr || 'Boisson'}
										aria-label="Boisson {d + 1} de la section {s + 1} (anglais)"
										class="{BARE} text-lg italic"
									/>
								{:else}
									<input
										id={drinkId(section.key, drink.key)}
										maxlength={MAX_DRINK_NAME}
										bind:value={drink.nameFr}
										placeholder="Boisson"
										aria-label="Boisson {d + 1} de la section {s + 1}"
										class="{BARE} text-lg italic"
									/>
								{/if}
								<input
									id="drink-{c.key}-section-{section.key}-drink-{drink.key}-price"
									type="number"
									min="0"
									step="0.01"
									inputmode="decimal"
									bind:value={drink.price}
									placeholder="Prix"
									aria-label="Prix de la boisson {d + 1} de la section {s + 1} (facultatif)"
									class="w-20 shrink-0 bg-transparent text-right text-sm tabular-nums border border-transparent rounded-sm hover:border-border-input focus:border-foreground focus:outline-none placeholder:text-muted-foreground/60"
									style="font-family: var(--font-sans)"
								/>
							</div>
							{#if english}
								<input
									maxlength={MAX_DRINK_DESCRIPTION}
									bind:value={drink.descriptionEn}
									placeholder={drink.descriptionFr || 'Description (optional)'}
									aria-label="Description de la boisson {d + 1} de la section {s + 1} (anglais)"
									class="{BARE} text-xs text-muted-foreground"
								/>
							{:else}
								<input
									maxlength={MAX_DRINK_DESCRIPTION}
									bind:value={drink.descriptionFr}
									placeholder="Une précision sur cette boisson ?"
									aria-label="Description de la boisson {d + 1} de la section {s + 1}"
									class="{BARE} text-xs text-muted-foreground"
								/>
							{/if}
							{#if section.drinks.length > 1}
								<button
									type="button"
									onclick={() => section.drinks.splice(d, 1)}
									aria-label="Retirer la boisson {d + 1} de la section {s + 1}"
									class="absolute right-0 top-0 size-9 inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-red-600 hover:bg-muted cursor-pointer"
								>
									<X size={14} />
								</button>
							{/if}
						</div>
					{/each}
					<button
						type="button"
						onclick={() => addDrink(section.key)}
						disabled={section.drinks.length >= MAX_DRINKS_PER_SECTION}
						class="mx-auto block min-h-9 px-4 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground cursor-pointer"
						style="font-family: var(--font-sans)"
					>
						+ Ajouter une boisson
					</button>
				</li>
			{/each}
		</ol>
		{#if c.sections.length === 0}
			<button type="button" onclick={insert} class="mx-auto block min-h-11 px-4 text-sm text-muted-foreground hover:text-foreground cursor-pointer" style="font-family: var(--font-sans)">
				+ Ajouter une section
			</button>
		{/if}

		{#if english}
			<input id="drink-{c.key}-noteEn" maxlength={MAX_DRINK_CARD_NOTE} bind:value={c.noteEn} placeholder={c.noteFr || 'Note (optional)'} aria-label="Note (anglais)" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{:else}
			<input id="drink-{c.key}-noteFr" maxlength={MAX_DRINK_CARD_NOTE} bind:value={c.noteFr} placeholder="Une note ? Réglées sur place…" aria-label="Note" class="{BARE} mt-6 text-xs text-muted-foreground" />
		{/if}
	</div>

	<div
		class="sticky bottom-0 z-10 mb-3 flex gap-1 rounded-xl border border-border-card bg-background-alt/95 p-1 backdrop-blur"
		role="toolbar"
		aria-label={at === -1 ? 'Sections' : `Section ${at + 1}`}
	>
		<button type="button" class={TOOL} disabled={at <= 0} onclick={() => move(at - 1)}><ArrowUp size={18} aria-hidden="true" />Monter</button>
		<button type="button" class={TOOL} disabled={at === -1 || at === c.sections.length - 1} onclick={() => move(at + 1)}><ArrowDown size={18} aria-hidden="true" />Descendre</button>
		<button type="button" class={TOOL} disabled={at === -1 || c.sections[at].drinks.length >= MAX_DRINKS_PER_SECTION} onclick={() => addDrink(c.sections[at].key)}><Plus size={18} aria-hidden="true" />Boisson</button>
		<button type="button" class={TOOL} disabled={c.sections.length >= MAX_DRINK_SECTIONS} onclick={insert}><Plus size={18} aria-hidden="true" />Section</button>
		<button type="button" class="{TOOL} text-red-600" disabled={at === -1} onclick={remove}><Trash2 size={18} aria-hidden="true" />Retirer</button>
	</div>

	<p class="border-t border-border-card pt-3 text-sm text-muted-foreground">
		{offering(c) === 0 ? 'Proposée sur aucun repas' : `Proposée sur ${offering(c)} repas`}
	</p>
{:else}
	<p class="py-10 text-center text-sm text-muted-foreground">Aucune carte. Créez-en une pour la proposer sur les repas.</p>
{/if}
