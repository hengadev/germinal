import { goto, invalidateAll } from '$app/navigation';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Shared by the Event editor's tabs (issue 036). Each tab posts its own
 * form; on a new Event the first save creates the Draft and answers with a
 * redirect to its page.
 */

interface Toast {
	success: (title: string, message: string) => void;
	error: (title: string, message: string) => void;
}

/**
 * Answer a tab's save: a toast, then the new Draft's page after a first
 * save, or fresh data for a saved Event. Returns whether the save went
 * through on the same page (so the tab can reset its drafts).
 */
export async function handleTabResult(result: ActionResult, toast: Toast, successFallback: string): Promise<boolean> {
	if (result.type === 'redirect') {
		toast.success('Succès', 'Brouillon créé.');
		await goto(result.location, { invalidateAll: true });
		return false;
	}
	if (result.type === 'success') {
		toast.success('Succès', (result.data as { success?: string } | undefined)?.success ?? successFallback);
		await invalidateAll();
		return true;
	}
	if (result.type === 'failure') {
		toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Une erreur est survenue');
	} else if (result.type === 'error') {
		toast.error('Erreur', 'Une erreur est survenue');
	}
	return false;
}

/**
 * Copy into `target` the fields of another tab's form that `target` does
 * not hold already: on a new Event, « Dates & séances » and « Menus &
 * tarifs » are saved together by the first save of either.
 */
export function mergeFormFields(target: FormData, form: HTMLFormElement | null): void {
	if (!form) return;
	for (const [name, value] of new FormData(form)) {
		if (!target.has(name)) target.set(name, value);
	}
}

/** The saved Event as the editor's tabs read it; null on a new Event. */
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
	// Practical Info (issue 040): Ticket holders only, never public.
	practicalInfoEn: string | null;
	practicalInfoFr: string | null;
	visibility: 'draft' | 'private' | 'public';
	isSpotlight: boolean | null;
	isPortfolio: boolean | null;
}
