/**
 * État partagé de la feuille Annuler / Rembourser (issue 041) : la page
 * du portail Staff est rendue deux fois (mobile et bureau), la feuille
 * passe donc par ce module plutôt que par des props. `target` null =
 * fermée. Le formulaire vit dans la carte de chaque partie.
 */
export interface CancelRefundTarget {
	reservationId: string;
	guestName: string | null;
	quantity: number | undefined;
	/** L'heure de la Séance, « 12 h 30 » — ce que montre la carte. */
	seatingLabel: string;
	/** L'acompte payé en ligne, en centimes. */
	paidOnline: number;
	/** Ce qui reste remboursable, en centimes. */
	refundable: number;
	/** Ce que la politique d'annulation suggère, en centimes (null : politique manuelle). */
	suggested: number | null;
	currency: string;
}

export const cancelRefundForm = $state({
	kind: null as 'cancel' | 'refund' | null,
	target: null as CancelRefundTarget | null
});

/** Ouvre la feuille sur une partie : annulation ou remboursement partiel. */
export function openCancelRefund(kind: 'cancel' | 'refund', target: CancelRefundTarget): void {
	cancelRefundForm.kind = kind;
	cancelRefundForm.target = target;
}

export function closeCancelRefund(): void {
	cancelRefundForm.kind = null;
	cancelRefundForm.target = null;
}
