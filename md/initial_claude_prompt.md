## **LLM Prompt – Germinal Web Application (Updated with Event Media)**

You are a senior full-stack engineer.

I want you to **design and implement the initial version** of a web application called **Germinal**.

---

## 1. Tech Stack (mandatory)

* **Framework:** SvelteKit (frontend + backend)
* **Database:** PostgreSQL
* **Storage:** Amazon S3 (or S3-compatible) for images and videos
* **ORM / DB access:** Your choice (Prisma, Drizzle, or SQL) — briefly justify
* **Type safety:** TypeScript everywhere
* **Environment configuration:** `.env`

---

## 2. Core Domain

The application manages **two main public entities**:

---

### A. Events

Events represent public happenings.

Each event must support:

* `id` (UUID)
* `title`
* `slug`
* `description`
* `start_date`
* `end_date`
* `location`
* `cover_media_id` (optional reference to media)
* `published`
* `created_at`
* `updated_at`

---

### B. Talents

Talents are people working with us.

Each talent must support:

* `id` (UUID)
* `first_name`
* `last_name`
* `role / specialty`
* `bio`
* `profile_media_id` (optional reference to media)
* `social_links` (optional)
* `published`
* `created_at`
* `updated_at`

---

### C. Media (shared entity)

Media represents **images or videos stored in S3** and linked to Events or Talents.

Each media record must support:

* `id` (UUID)
* `type` (`image` | `video`)
* `url` (public S3 URL)
* `mime_type`
* `size`
* `event_id` (nullable)
* `talent_id` (nullable)
* `is_cover` (boolean)
* `created_at`

Rules:

* An **event can have multiple media items**
* A **talent can have multiple media items**
* A media item belongs to **either an event OR a talent**, never both
* Cover images/videos are selected using `is_cover = true`

---

## 3. Application Behavior

### Event detail page

When navigating to `/events/[slug]`:

* Fetch the event by slug
* Fetch **all related media** for that event
* Display:

  * Cover media prominently
  * A gallery of images/videos linked to the event

---

## 4. Application Structure

### Navigation (public)

* Events
* Talents
* Contact

No authentication required.

---

## 5. Backend Responsibilities (SvelteKit)

* CRUD endpoints for:

  * Events
  * Talents
  * Media
* Server-side fetching via `+page.server.ts`
* Media upload flow:

  1. File uploaded via form
  2. Stored in S3
  3. Metadata + URL persisted in PostgreSQL
* Input validation and error handling

---

## 6. Database

* PostgreSQL schema including:

  * `events`
  * `talents`
  * `media`
* UUID primary keys
* Foreign keys and constraints enforcing media ownership rules
* Indexes on:

  * `events.slug`
  * `media.event_id`
  * `media.talent_id`
  * `published`

---

## 7. S3 Integration

* Dedicated service/module for S3
* Support multiple file uploads per event
* Return URLs usable by the frontend

---

## 8. Frontend

* SSR enabled
* Clean, minimal UI
* Components:

  * `EventCard`
  * `EventGallery`
  * `TalentCard`
* Use server `load` functions
* Media gallery should support images and videos

---

## 9. Output Expectations

Produce:

1. Folder structure
2. PostgreSQL schema
3. Key SvelteKit routes
4. Example:

   * Event detail page fetching its media
   * Media upload logic
5. S3 service abstraction
6. Minimal UI examples
7. Short architectural explanations

---

## Constraints

* Do not over-engineer
* No authentication
* Focus on clarity and extensibility

