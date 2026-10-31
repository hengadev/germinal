/**
 * État partagé de la feuille « Pour quel événement ? » : un raccourci de
 * l'en-tête (Nouvelle réservation, Fermer aux réservations, walk-in)
 * demande d'abord l'événement quand il y en a plusieurs. Le portail est
 * rendu deux fois (mobile et bureau), d'où ce module plutôt que des props.
 */
export interface PickableEvent {
	eventId: string;
	title: string;
}

export const eventPicker = $state({
	/** Le raccourci choisi, en titre de la feuille ; null = fermée. */
	action: null as string | null,
	events: [] as PickableEvent[],
	onpick: (_event: PickableEvent) => {}
});

export function pickEvent(action: string, events: PickableEvent[], onpick: (event: PickableEvent) => void): void {
	eventPicker.events = events;
	eventPicker.onpick = onpick;
	eventPicker.action = action;
}

export function closeEventPicker(): void {
	eventPicker.action = null;
}
