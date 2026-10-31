/**
 * État partagé du formulaire walk-in / invitation (issue 038) : la page du
 * portail Staff est rendue deux fois (mobile et bureau), le menu ⋮ et la
 * feuille qui porte le formulaire passent donc par ce module plutôt que par
 * des props. `kind` null = fermée.
 */
export const spotForm = $state({ kind: null as 'walk_in' | 'comp' | null });

/** Ouvre la feuille sur un walk-in ou une invitation offerte. */
export function openSpotForm(kind: 'walk_in' | 'comp'): void {
	spotForm.kind = kind;
}

export function closeSpotForm(): void {
	spotForm.kind = null;
}
