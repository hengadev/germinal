/**
 * Shared open/close state of the scan overlay (issue 034): the staff
 * layout renders the page twice (mobile and desktop), so the overlay
 * lives once at the layout's top level and the BottomBar button and the
 * desktop sidebar drive it through this module.
 *
 * `eventId` is the Event being scanned; null means closed. `picking` is
 * the short list shown when several Events have a Day under way.
 */
export const scanOverlay = $state({
	eventId: null as string | null,
	picking: false
});

/** Open the overlay for `targets`: straight to the scanner, or the picker. */
export function openScanOverlay(targets: { eventId: string }[]): void {
	if (targets.length === 0) return;
	if (targets.length === 1) {
		scanOverlay.eventId = targets[0].eventId;
		scanOverlay.picking = false;
	} else {
		scanOverlay.eventId = null;
		scanOverlay.picking = true;
	}
}

export function closeScanOverlay(): void {
	scanOverlay.eventId = null;
	scanOverlay.picking = false;
}
