/**
 * État partagé de la feuille « Fermer aux réservations » (issue 039) : la
 * page du portail Staff est rendue deux fois (mobile et bureau), le menu ⋮
 * et la feuille passent donc par ce module plutôt que par des props.
 * Ouverte = true, fermée = false.
 */
export const closeBookingsForm = $state({ open: false });

export function openCloseBookingsForm(): void {
	closeBookingsForm.open = true;
}

export function closeCloseBookingsForm(): void {
	closeBookingsForm.open = false;
}
