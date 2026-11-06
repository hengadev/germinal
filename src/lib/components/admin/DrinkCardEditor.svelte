<script module lang="ts">
	// « Carte des boissons » of the Menus tab (issue 086): the Event's one
	// optional Drinks card — sections (« Cocktails », « Soft »…), each with
	// its drinks (name, description, price optional). Informational only:
	// the drinks are paid on site. Fields only: the host page owns the
	// draft and the <form>; this editor posts its payload as `drinkCard`
	// and exposes `firstBlockingField()`. The English is generated from the
	// French on save, like the Menus'.
	import type { EditorDrinkCard } from '$lib/types/pricing-editor';

	/** A drink as edited; `key` keeps its row while the card is reordered. */
	export interface DraftDrink {
		key: number;
		nameEn: string;
		nameFr: string;
		descriptionEn: string;
		descriptionFr: string;
		/** Price in major units as typed; null when the drink has none. */
		price: number | null;
	}

	export interface DraftDrinkSection {
		key: number;
		labelEn: string;
		labelFr: string;
		drinks: DraftDrink[];
	}

	export interface DraftDrinkCard {
		sections: DraftDrinkSection[];
		noteEn: string;
		noteFr: string;
	}

	let nextKey = 0;

	export function newDrink(): DraftDrink {
		return { key: nextKey++, nameEn: '', nameFr: '', descriptionEn: '', descriptionFr: '', price: null };
	}

	export function newDrinkSection(): DraftDrinkSection {
		return { key: nextKey++, labelEn: '', labelFr: '', drinks: [newDrink()] };
	}

	export function toDraftDrinkCard(pricing: { drinkCard?: EditorDrinkCard | null } | undefined): DraftDrinkCard {
		const card = pricing?.drinkCard;
		return {
			sections: (card?.sections ?? []).map((section) => ({
				key: nextKey++,
				labelEn: section.labelEn,
				labelFr: section.labelFr,
				drinks: section.drinks.map((drink) => ({
					key: nextKey++,
					nameEn: drink.nameEn,
					nameFr: drink.nameFr,
					descriptionEn: drink.descriptionEn ?? '',
					descriptionFr: drink.descriptionFr ?? '',
					price: drink.priceAmount === null ? null : drink.priceAmount / 100,
				})),
			})),
			noteEn: card?.noteEn ?? '',
			noteFr: card?.noteFr ?? '',
		};
	}

	function isBlank(value: number | null | undefined | ''): boolean {
		return value === null || value === undefined || value === '';
	}

	export function isValidDrinkPrice(price: number | null): boolean {
		return isBlank(price) || (price !== null && Number.isFinite(price) && price >= 0 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6);
	}

	/** The card as posted: drinks without a French name and sections left
	 * without a drink are not saved; no drink at all removes the card. */
	export function drinkCardPayload(card: DraftDrinkCard): string {
		return JSON.stringify({
			sections: card.sections
				.map((section) => ({
					labelEn: section.labelEn.trim(),
					labelFr: section.labelFr.trim(),
					drinks: section.drinks
						.filter((drink) => drink.nameFr.trim())
						.map((drink) => ({
							nameEn: drink.nameEn.trim(),
							nameFr: drink.nameFr.trim(),
							descriptionEn: drink.descriptionEn.trim() || null,
							descriptionFr: drink.descriptionFr.trim() || null,
							// An invalid price is caught before posting.
							priceAmount: isBlank(drink.price) ? null : isValidDrinkPrice(drink.price) ? Math.round((drink.price as number) * 100) : -1,
						})),
				}))
				.filter((section) => section.drinks.length > 0),
			noteEn: card.noteEn.trim() || null,
			noteFr: card.noteFr.trim() || null,
		});
	}
</script>

<script lang="ts">
	import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-svelte';
	import {
		MAX_DRINK_CARD_NOTE,
		MAX_DRINK_DESCRIPTION,
		MAX_DRINK_NAME,
		MAX_DRINK_SECTION_LABEL,
		MAX_DRINK_SECTIONS,
		MAX_DRINKS_PER_SECTION,
	} from '$lib/types/pricing-editor';

	let {
		card = $bindable(),
		currency,
	}: {
		card: DraftDrinkCard;
		/** The Event's currency (issue 042): every price is in it. */
		currency: string;
	} = $props();
	const uid = $props.id();

	const INPUT_CLASS =
		'w-full px-3 py-2 border border-border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground focus:border-transparent text-sm';
	const ICON_BUTTON =
		'inline-flex items-center justify-center size-8 rounded-md text-foreground-alt hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer';

	const payload = $derived(drinkCardPayload(card));

	function move<T>(list: T[], index: number, delta: number) {
		const next = index + delta;
		if (next < 0 || next >= list.length) return;
		const [item] = list.splice(index, 1);
		list.splice(next, 0, item);
	}

	/** First field that blocks the save, with the message to show. */
	export function firstBlockingField(): { id: string; message: string } | null {
		for (const section of card.sections) {
			for (const drink of section.drinks) {
				if (!isValidDrinkPrice(drink.price)) {
					const label = drink.nameFr.trim() || 'une boisson';
					return { id: `${uid}-drink-${drink.key}-price`, message: `Prix invalide pour « ${label} » : un montant positif ou nul, au centime près, ou vide.` };
				}
			}
		}
		return null;
	}
</script>

<section class="bg-background rounded-lg border border-border-card" aria-labelledby="{uid}-title">
	<header class="p-4 lg:p-6 border-b border-border-card">
		<h3 id="{uid}-title" class="text-lg font-semibold text-foreground">Carte des boissons</h3>
		<p class="text-sm text-muted-foreground">
			Facultative, affichée après les menus. Les boissons sont réglées sur place : rien ici n’est réservé ni payé
			en ligne. Le prix ({currency}) est facultatif. L’anglais est généré à l’enregistrement.
		</p>
	</header>

	<input type="hidden" name="drinkCard" value={payload} />

	{#if card.sections.length === 0}
		<div class="px-4 lg:px-6 py-8 text-center">
			<p class="text-sm text-muted-foreground">Pas de carte des boissons.</p>
			<button
				type="button"
				onclick={() => card.sections.push(newDrinkSection())}
				class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted cursor-pointer"
			>
				<Plus size={16} /> Ajouter une carte des boissons
			</button>
		</div>
	{:else}
		<div class="divide-y divide-border-card">
			{#each card.sections as section, s (section.key)}
				<div class="px-4 lg:px-6 py-4 space-y-3">
					<div class="flex items-center gap-2">
						<input
							maxlength={MAX_DRINK_SECTION_LABEL}
							bind:value={section.labelFr}
							placeholder="Section (Cocktails, Soft…)"
							aria-label="Titre de la section {s + 1}"
							class="{INPUT_CLASS} font-medium"
						/>
						<button type="button" onclick={() => move(card.sections, s, -1)} disabled={s === 0} aria-label="Monter la section {s + 1}" class={ICON_BUTTON}><ArrowUp size={16} /></button>
						<button type="button" onclick={() => move(card.sections, s, 1)} disabled={s === card.sections.length - 1} aria-label="Descendre la section {s + 1}" class={ICON_BUTTON}><ArrowDown size={16} /></button>
						<button type="button" onclick={() => card.sections.splice(s, 1)} aria-label="Supprimer la section {s + 1}" class="{ICON_BUTTON} hover:text-red-600"><Trash2 size={16} /></button>
					</div>

					<ol class="space-y-3 sm:pl-4">
						{#each section.drinks as drink, d (drink.key)}
							<li class="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_7rem_auto]">
								<input
									maxlength={MAX_DRINK_NAME}
									bind:value={drink.nameFr}
									placeholder="Boisson"
									aria-label="Boisson {d + 1} de la section {s + 1}"
									class={INPUT_CLASS}
								/>
								<div class="relative order-last col-span-2 sm:order-none sm:col-span-1">
									<input
										id="{uid}-drink-{drink.key}-price"
										type="number"
										min="0"
										step="0.01"
										inputmode="decimal"
										bind:value={drink.price}
										placeholder="Prix"
										aria-label="Prix de la boisson {d + 1} de la section {s + 1}, en {currency} (facultatif)"
										aria-invalid={!isValidDrinkPrice(drink.price)}
										class="{INPUT_CLASS} pr-12 tabular-nums"
									/>
									<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currency}</span>
								</div>
								<div class="flex items-center">
									<button type="button" onclick={() => move(section.drinks, d, -1)} disabled={d === 0} aria-label="Monter la boisson {d + 1}" class={ICON_BUTTON}><ArrowUp size={16} /></button>
									<button type="button" onclick={() => move(section.drinks, d, 1)} disabled={d === section.drinks.length - 1} aria-label="Descendre la boisson {d + 1}" class={ICON_BUTTON}><ArrowDown size={16} /></button>
									<button type="button" onclick={() => section.drinks.splice(d, 1)} aria-label="Retirer la boisson {d + 1}" class="{ICON_BUTTON} hover:text-red-600"><X size={16} /></button>
								</div>
								<input
									maxlength={MAX_DRINK_DESCRIPTION}
									bind:value={drink.descriptionFr}
									placeholder="Description (facultatif)"
									aria-label="Description de la boisson {d + 1} de la section {s + 1}"
									class="{INPUT_CLASS} col-span-2 sm:col-span-3 text-muted-foreground"
								/>
							</li>
						{/each}
					</ol>
					<button
						type="button"
						onclick={() => section.drinks.push(newDrink())}
						disabled={section.drinks.length >= MAX_DRINKS_PER_SECTION}
						class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-foreground-alt hover:bg-muted disabled:opacity-30 cursor-pointer sm:ml-4"
					>
						<Plus size={16} /> Ajouter une boisson
					</button>
				</div>
			{/each}
		</div>
		<div class="px-4 lg:px-6 py-4 space-y-3 border-t border-border-card">
			<button
				type="button"
				onclick={() => card.sections.push(newDrinkSection())}
				disabled={card.sections.length >= MAX_DRINK_SECTIONS}
				class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-input text-foreground-alt hover:bg-muted disabled:opacity-30 cursor-pointer"
			>
				<Plus size={16} /> Ajouter une section
			</button>
			<label class="block">
				<span class="block text-xs font-medium text-foreground-alt mb-1">Note (facultatif)</span>
				<textarea
					rows="2"
					maxlength={MAX_DRINK_CARD_NOTE}
					bind:value={card.noteFr}
					placeholder="Réglées sur place, au bar."
					class={INPUT_CLASS}
				></textarea>
			</label>
		</div>
	{/if}
</section>
