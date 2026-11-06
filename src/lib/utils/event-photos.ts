/**
 * Visuals and Event Photos (issue 045, ADR 0007) — pure, no database.
 *
 * An Event's media play one of two roles: Visuals announce it beforehand,
 * Event Photos show it once it took place, for its Portfolio project. The
 * two never mix: each editor tab and each public view reads only its own.
 * Each role has at most one cover; the Event Photos' cover is the
 * project's, used by "Projets" and the homepage gallery.
 */

/** What these helpers read off a media row. */
export interface RoledMedia {
	id: string;
	/** `image` or `video`; Event Photos of type video are the project's
	 * videos (issue 084) and never a cover. Read loosely (a string) so the
	 * public pages' media types fit without a cast. */
	type?: string | null;
	/** `visual`, `event_photo`, or null (media from before roles, Talent
	 * media) — anything but `event_photo` reads as a Visual. */
	role?: 'visual' | 'event_photo' | null;
	isCover?: boolean | null;
}

/** Whether a media row is an Event Photo. */
export function isEventPhoto(medium: RoledMedia): boolean {
	return medium.role === 'event_photo';
}

/** An Event's Visuals, in the order given. */
export function visualsOf<M extends RoledMedia>(media: readonly M[] | null | undefined): M[] {
	return (media ?? []).filter((medium) => !isEventPhoto(medium));
}

/** An Event's Event Photos, cover first, then in the order given. */
export function eventPhotosOf<M extends RoledMedia>(media: readonly M[] | null | undefined): M[] {
	const photos = (media ?? []).filter(isEventPhoto);
	const cover = photos.find((photo) => photo.isCover === true);
	return cover ? [cover, ...photos.filter((photo) => photo !== cover)] : photos;
}

/** The Event Photo chosen as the project cover, or null. A video is
 * never the cover (issue 084). */
export function eventPhotoCover<M extends RoledMedia>(media: readonly M[] | null | undefined): M | null {
	return (media ?? []).find((medium) => isEventPhoto(medium) && medium.type !== 'video' && medium.isCover === true) ?? null;
}

/** An Event's project videos (issue 084): its Event Photos of type
 * video, in the order given. */
export function projectVideosOf<M extends RoledMedia>(media: readonly M[] | null | undefined): M[] {
	return (media ?? []).filter((medium) => isEventPhoto(medium) && medium.type === 'video');
}

/** An Event's Event Photos that are images, cover first (the videos are
 * left to `projectVideosOf`, issue 084). */
export function projectPhotosOf<M extends RoledMedia>(media: readonly M[] | null | undefined): M[] {
	return eventPhotosOf(media).filter((medium) => medium.type !== 'video');
}

/** The project page's photo stream (issue 084): the cover, then the
 * videos in their order, then the other photos in theirs. The cover is
 * never a video (`eventPhotoCover`); if it comes from elsewhere it is
 * only kept out of the photos. */
export function projectStream<M extends RoledMedia>(
	cover: M | RoledMedia | null | undefined,
	media: readonly M[] | null | undefined
): M[] {
	const photos = projectPhotosOf(media).filter((photo) => photo.id !== cover?.id);
	const stream = cover ? [cover, ...projectVideosOf(media), ...photos] : [...projectVideosOf(media), ...photos];
	return stream as M[];
}

/** An Event as listings read it: its media and its Visual cover. */
interface ListedEvent<M extends RoledMedia> {
	media?: readonly M[] | null;
	coverMedia?: M | null;
	coverVideo?: M | null;
}

/**
 * The image a Portfolio project is shown with: the Event Photos' cover,
 * falling back to the Visual cover (null when neither exists).
 */
export function projectCover<M extends RoledMedia>(event: ListedEvent<M>): M | null {
	return eventPhotoCover(event.media) ?? event.coverMedia ?? null;
}

/**
 * The Event with its project cover in place of its Visual cover, for the
 * cards of "Projets" and the homepage gallery (which read `coverMedia`,
 * and `coverVideo` first). Unchanged when it has no Event Photo cover.
 */
export function withProjectCover<E extends ListedEvent<RoledMedia>>(event: E): E {
	const cover = eventPhotoCover(event.media);
	if (!cover) return event;
	return { ...event, coverMedia: cover, coverVideo: null };
}
