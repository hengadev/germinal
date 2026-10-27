import { invalidateAll } from '$app/navigation';
import type { ActionResult } from '@sveltejs/kit';
import { announceSaved } from '$lib/utils/leave-guard';

/**
 * Shared by the Event editor's tabs (issue 036). Each tab posts its own
 * form, always on a saved Event (ADR 0010).
 */

interface Toast {
	success: (title: string, message: string) => void;
	error: (title: string, message: string) => void;
}

/**
 * Answer a tab's save: a toast, then fresh data. Returns whether the save
 * went through (so the tab can reset its drafts). A save that went through
 * cleans `form` for the leave guard (issue 037).
 */
export async function handleTabResult(
	result: ActionResult,
	toast: Toast,
	successFallback: string,
	form?: HTMLFormElement
): Promise<boolean> {
	if (result.type === 'success') {
		toast.success('Succès', (result.data as { success?: string } | undefined)?.success ?? successFallback);
		await invalidateAll();
		announceSaved(form);
		return true;
	}
	if (result.type === 'failure') {
		toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Une erreur est survenue');
	} else if (result.type === 'error') {
		toast.error('Erreur', 'Une erreur est survenue');
	}
	return false;
}

/** The saved Event as the editor's tabs read it. */
export interface EditorEvent {
	id: string;
	titleEn: string | null;
	titleFr: string | null;
	subtitleEn: string | null;
	subtitleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	locationEn: string | null;
	locationFr: string | null;
	venueNameEn: string | null;
	venueNameFr: string | null;
	streetAddressEn: string | null;
	streetAddressFr: string | null;
	districtEn: string | null;
	districtFr: string | null;
	cityEn: string | null;
	cityFr: string | null;
	postalCode: string | null;
	countryEn: string | null;
	countryFr: string | null;
	timeZone: string;
	collaborators: string | null;
	timings: string | null;
	curatorEn: string | null;
	curatorFr: string | null;
	admissionInfoEn: string | null;
	admissionInfoFr: string | null;
	/** Internal Notes (issue 039): only Admins ever see them. */
	internalNotes?: string | null;
	// Practical Info (issue 040): Ticket holders only, never public.
	practicalInfoEn: string | null;
	practicalInfoFr: string | null;
	/** Whether the booking form asks for Dietary Requirements (issue 041). */
	askDietaryRequirements?: boolean;
	/** The Recap (issue 045), for the Portfolio project page. */
	recapEn?: string | null;
	recapFr?: string | null;
	/** Visuals and Event Photos alike (issue 045); each tab reads its own. */
	media?: import('$lib/types/media').Media[] | null;
	visibility: 'draft' | 'private' | 'public';
	isSpotlight: boolean | null;
	isPortfolio: boolean | null;
}
