/** A photograph from a Portfolio project, with the project it shows. */
export interface ManifestoPhoto {
	id: string;
	type: string;
	url: string;
	altEn: string | null;
	altFr: string | null;
	eventId: string;
	titleEn: string | null;
	titleFr: string | null;
	year: string;
}
