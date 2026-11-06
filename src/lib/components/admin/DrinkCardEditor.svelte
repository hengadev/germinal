<script module lang="ts">
	// The Drinks card drafts of the Menus tab (issues 086, 087): one card
	// per Event became a list, each edited on the printed card in
	// DrinksCardEditor.svelte (like MenuCardEditor for the Menus). What is
	// left here is the drafts and their validation: a drink's price must be
	// a non-negative amount to the cent when set. The host page (Pricing.svelte)
	// owns the drafts; PricingEditor posts them within its `pricing` payload
	// and calls `firstBlockingField()` before submitting.
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

	/** A Drinks card as edited (issue 087): its name, then its sections. */
	export interface DraftDrinkCard {
		key: string;
		id: string | null;
		nameEn: string;
		nameFr: string;
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

	/** A new, blank card opened on the Drinks modal. */
	export function newDrinkCard(key: string): DraftDrinkCard {
		return { key, id: null, nameEn: '', nameFr: '', sections: [newDrinkSection()], noteEn: '', noteFr: '' };
	}

	export function toDraftDrinkCards(pricing: { drinkCards?: EditorDrinkCard[] } | undefined): DraftDrinkCard[] {
		return (pricing?.drinkCards ?? []).map((card) => ({
			key: card.id,
			id: card.id,
			nameEn: card.nameEn,
			nameFr: card.nameFr,
			sections: card.sections.map((section) => ({
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
			noteEn: card.noteEn ?? '',
			noteFr: card.noteFr ?? '',
		}));
	}

	function isBlank(value: number | null | undefined | ''): boolean {
		return value === null || value === undefined || value === '';
	}

	export function isValidDrinkPrice(price: number | null): boolean {
		return isBlank(price) || (price !== null && Number.isFinite(price) && price >= 0 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6);
	}

	/** A card as posted: drinks without a French name and sections left
	 * without a drink are not saved. An invalid price is caught before
	 * posting (sent as -1, which the server refuses). */
	export function drinkCardPayload(card: DraftDrinkCard) {
		return {
			key: card.key,
			id: card.id,
			nameEn: card.nameEn.trim(),
			nameFr: card.nameFr.trim(),
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
							priceAmount: isBlank(drink.price) ? null : isValidDrinkPrice(drink.price) ? Math.round((drink.price as number) * 100) : -1,
						})),
				}))
				.filter((section) => section.drinks.length > 0),
			noteEn: card.noteEn.trim() || null,
			noteFr: card.noteFr.trim() || null,
		};
	}
</script>
