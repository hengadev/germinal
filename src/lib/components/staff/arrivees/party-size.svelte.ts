/**
 * État partagé de la feuille « Modifier le nombre » (issue 048) : la page
 * du portail Staff est rendue deux fois (mobile et bureau), la feuille
 * passe donc par ce module plutôt que par des props. `target` null =
 * fermée. Le formulaire vit dans la carte de chaque partie.
 */
import type { RefundPolicy } from '$lib/utils/refund-policy';

export interface PartySizeTarget {
	reservationId: string;
	guestName: string | null;
	quantity: number;
	/** L'heure de la Séance, « 12 h 30 » — ce que montre la carte. */
	seatingLabel: string;
	/** total_amount, en centimes. */
	total: number;
	/** balance_amount, en centimes. */
	balance: number;
	/** L'acompte payé en ligne, remboursements déduits, en centimes. */
	depositPaid: number;
	/** Personnes déjà arrivées. */
	checkedIn: number;
	isComp: boolean;
	currency: string;
	/** Places encore libres sur la Séance (null : pas de limite). */
	availableCapacity: number | null;
	refundPolicy: RefundPolicy | null;
	/** ISO : le début de la Séance. */
	seatingStart: string;
	/** La permission « Annuler et rembourser » : sans elle, la suppression
	 * s'arrête au solde et aucun remboursement n'est proposé. */
	canRefund: boolean;
}

export const partySizeForm = $state({ target: null as PartySizeTarget | null });

/** Ouvre la feuille sur une partie. */
export function openPartySize(target: PartySizeTarget): void {
	partySizeForm.target = target;
}

export function closePartySize(): void {
	partySizeForm.target = null;
}
