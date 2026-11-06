import { describe, it, expect } from 'vitest';
import {
	eventPhotoCover,
	eventPhotosOf,
	isEventPhoto,
	projectCover,
	projectPhotosOf,
	projectStream,
	projectVideosOf,
	visualsOf,
	withProjectCover,
} from '../../../src/lib/utils/event-photos';

/**
 * Issue 045 — Visuals and Event Photos never mix, each role has its own
 * cover, and a Portfolio project is shown with its Event Photos' cover,
 * falling back to its Visual cover.
 */

const visual = { id: 'v1', role: 'visual' as const, isCover: true };
const legacy = { id: 'v0', role: null, isCover: false };
const photoA = { id: 'p1', role: 'event_photo' as const, isCover: false };
const photoB = { id: 'p2', role: 'event_photo' as const, isCover: true };const MEDIA = [visual, photoA, legacy, photoB];

describe('Visuals and Event Photos', () => {
	it('tells an Event Photo from a Visual (a media without role is a Visual)', () => {
		expect(isEventPhoto(photoA)).toBe(true);
		expect(isEventPhoto(visual)).toBe(false);
		expect(isEventPhoto(legacy)).toBe(false);
	});

	it('splits an Event’s media by role', () => {
		expect(visualsOf(MEDIA)).toEqual([visual, legacy]);
		expect(eventPhotosOf(MEDIA)).toEqual([photoB, photoA]);
		expect(visualsOf(null)).toEqual([]);
		expect(eventPhotosOf(undefined)).toEqual([]);
	});

	it('finds the Event Photos’ cover, never the Visuals’', () => {
		expect(eventPhotoCover(MEDIA)).toBe(photoB);
		expect(eventPhotoCover([visual, photoA])).toBeNull();
	});
});

describe('projectCover / withProjectCover', () => {
	const coverMedia = { id: 'v1', role: 'visual' as const, isCover: true };
	const coverVideo = { id: 'vid', role: 'visual' as const, isCover: false };

	it('uses the Event Photos’ cover first', () => {
		expect(projectCover({ media: MEDIA, coverMedia })).toBe(photoB);
		const listed = withProjectCover({ id: 'e', media: MEDIA, coverMedia, coverVideo });
		expect(listed.coverMedia).toBe(photoB);
		// The cover video is a Visual: it gives way to the Event Photo.
		expect(listed.coverVideo).toBeNull();
		expect(listed.id).toBe('e');
	});

	it('falls back to the Visual cover', () => {
		const event = { media: [visual, photoA], coverMedia, coverVideo };
		expect(projectCover(event)).toBe(coverMedia);
		expect(withProjectCover(event)).toBe(event);
		expect(projectCover({ media: [] })).toBeNull();
	});
});

describe('project videos (issue 084)', () => {
	// Videos are Event Photos of type video; they never mix with images.
	const videoA = { id: 'm1', role: 'event_photo' as const, type: 'video' as const, isCover: false };
	const videoB = { id: 'm2', role: 'event_photo' as const, type: 'video' as const, isCover: false };
	const photoC = { id: 'p3', role: 'event_photo' as const, type: 'image' as const, isCover: false };
	const photoD = { id: 'p4', role: 'event_photo' as const, type: 'image' as const, isCover: true };
	const MEDIA = [photoC, videoA, photoD, videoB];

	it('splits an Event’s Event Photos into photos and videos, cover first on the photos’ side', () => {
		expect(projectPhotosOf(MEDIA).map((m) => m.id)).toEqual(['p4', 'p3']);
		expect(projectVideosOf(MEDIA).map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(projectPhotosOf(null)).toEqual([]);
		expect(projectVideosOf(undefined)).toEqual([]);
	});

	it('never takes a video as the cover, even one marked as such', () => {
		const marked = [{ ...videoA, isCover: true }];
		expect(eventPhotoCover(marked)).toBeNull();
		expect(projectPhotosOf(marked)).toEqual([]);
		expect(projectStream(projectCover({ media: marked }), marked).map((m) => m.id)).toEqual(['m1']);
	});

	it('streams the cover, then the videos, then the other photos', () => {
		const cover = photoD;
		expect(projectStream(cover, MEDIA).map((m) => m.id)).toEqual(['p4', 'm1', 'm2', 'p3']);
		// Without a cover the videos lead.
		expect(projectStream(null, [photoC, videoA]).map((m) => m.id)).toEqual(['m1', 'p3']);
		// No videos: unchanged.
		expect(projectStream(photoD, [photoC, photoD]).map((m) => m.id)).toEqual(['p4', 'p3']);
	});
});
