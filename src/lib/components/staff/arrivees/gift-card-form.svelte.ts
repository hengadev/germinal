/**
 * État partagé de la feuille « Carte cadeau » (issue 066) : la page du
 * portail Staff est rendue deux fois (mobile et bureau), la feuille passe
 * donc par ce module plutôt que par des props. `target` null = fermée.
 * Le formulaire vit dans la carte de chaque partie.
 */
export interface GiftCardTarget {
	reservationId: string;
	guestName: string | null;
	/** Le solde restant sur place, en centimes. */
	balance: number;
	/** Toujours EUR : les cartes cadeau sont en euros uniquement. */
	currency: string;
	/** L'heure de la Séance, « 12 h 30 » — ce que montre la carte. */
	seatingLabel: string;
}

export const giftCardForm = $state({ target: null as GiftCardTarget | null });

/** Ouvre la feuille sur une partie. */
export function openGiftCard(target: GiftCardTarget): void {
	giftCardForm.target = target;
}

export function closeGiftCard(): void {
	giftCardForm.target = null;
}
