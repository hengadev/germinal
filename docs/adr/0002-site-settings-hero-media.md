# ADR 0002 — Site settings singleton and `siteRole` on media

**Status**: Accepted  
**Date**: 2026-05-25

## Context

The homepage hero section previously used a hardcoded static file (`/hero/hero.webp`). Making it configurable from the admin panel requires a place to store the reference to whichever image or video is currently active, and a way to keep that media from being deleted by the orphaned-media cleanup job.

The existing `media` table ties every record to either an `eventId` or a `talentId`. The cleanup job deletes any record where both are NULL and the record is older than 24 hours.

## Decision

### `site_settings` table (singleton)

Introduce a `site_settings` table with a single row, holding `heroImageId` and `heroVideoId` as nullable FKs into `media`. A singleton row (seeded at migration time) was chosen over a key-value store because the settings are typed and few; a key-value store would lose type safety and make queries awkward for no benefit at this scale.

### `siteRole` column on `media`

Add a nullable `siteRole` varchar column to `media` (values: `'hero_image'`, `'hero_video'`). The cleanup job excludes any record where `siteRole IS NOT NULL`.

The alternative was making the cleanup job join against `site_settings` to discover which media IDs to skip. That was rejected because it couples two unrelated concerns: the cleanup job should not need to understand the shape of site configuration.

### Replacement and clearing

When the admin uploads a new hero image or video, the previous media record is deleted from S3 and the database immediately — there is no retention of previous hero media. The admin can also clear hero media entirely; the homepage falls back to the static `/hero/hero.webp`.

### Video precedence

When both a hero image and a hero video are set, the video is shown (looping, muted, autoplay). This mirrors the existing pattern used for event cover media.

## Consequences

- Migrations required: new `site_settings` table, `siteRole` column on `media`, cleanup job updated.
- The `MediaUpload` component cannot be reused as-is (it is typed to `'event' | 'talent'`); the settings page uses a dedicated upload UI.
- Future site-wide config (e.g. OG image, logo) can be added as columns on the `site_settings` row.
