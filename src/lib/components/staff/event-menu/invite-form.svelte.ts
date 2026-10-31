/**
 * État partagé de la feuille « Nouvelle réservation » (issue 040) : la
 * page du portail Staff est rendue deux fois (mobile et bureau), le menu ⋮
 * et la feuille passent donc par ce module plutôt que par des props.
 * Ouverte = true, fermée = false.
 */
export const inviteForm = $state({ open: false });

export function openInviteForm(): void {
	inviteForm.open = true;
}

export function closeInviteForm(): void {
	inviteForm.open = false;
}
