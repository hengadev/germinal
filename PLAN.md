# Germinal - Implementation Plan

## Executive Summary

Germinal is a public-facing web application for showcasing events and talents. Built with SvelteKit, PostgreSQL, and S3, it provides a clean, server-side rendered platform for managing and displaying events with media galleries and talent profiles.

---

## 1. Technology Stack & Architectural Decisions

### 1.1 Core Stack

- **Framework**: SvelteKit 2.x (SSR enabled)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 15+
- **ORM**: Drizzle ORM
- **Storage**: Amazon S3 (or compatible)
- **Styling**: Tailwind CSS 4.x (already configured)
- **Package Manager**: pnpm

### 1.2 ORM Choice: Drizzle ORM

**Justification:**

- **Type Safety**: Best-in-class TypeScript inference, compile-time type checking
- **Performance**: Zero overhead abstraction, generates optimized SQL
- **SQL Control**: SQL-like syntax, easy migration from raw SQL
- **Lightweight**: Smaller bundle size than Prisma
- **Modern**: Built for TypeScript-first applications
- **Migrations**: Built-in migration system with drizzle-kit
- **Developer Experience**: Excellent autocomplete and type inference

**vs Prisma**: While Prisma has better documentation, Drizzle offers better performance, more control, and lighter weight.

**vs Raw SQL**: Drizzle provides type safety and migration management while maintaining SQL-like expressiveness.

---

## 2. Project Structure

```
germinal/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ui/                    # Base UI components
│   │   │   │   ├── Button.svelte
│   │   │   │   ├── Card.svelte
│   │   │   │   ├── Input.svelte
│   │   │   │   └── Modal.svelte
│   │   │   ├── EventCard.svelte       # Event preview card
│   │   │   ├── EventGallery.svelte    # Media gallery for events
│   │   │   ├── TalentCard.svelte      # Talent preview card
│   │   │   ├── MediaUploader.svelte   # S3 upload component
│   │   │   ├── MediaGrid.svelte       # Reusable media grid
│   │   │   └── Navigation.svelte      # Main navigation
│   │   │
│   │   ├── server/
│   │   │   ├── db/
│   │   │   │   ├── index.ts           # Database client singleton
│   │   │   │   ├── schema.ts          # Drizzle schema definitions
│   │   │   │   └── migrations/        # SQL migrations
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── events.ts          # Event business logic
│   │   │   │   ├── talents.ts         # Talent business logic
│   │   │   │   ├── media.ts           # Media business logic
│   │   │   │   └── s3.ts              # S3 operations
│   │   │   │
│   │   │   └── validators/
│   │   │       ├── events.ts          # Event validation schemas
│   │   │       ├── talents.ts         # Talent validation schemas
│   │   │       └── media.ts           # Media validation schemas
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts               # Shared types
│   │   │   ├── events.ts              # Event types
│   │   │   ├── talents.ts             # Talent types
│   │   │   └── media.ts               # Media types
│   │   │
│   │   └── utils/
│   │       ├── slugify.ts             # Slug generation
│   │       ├── validation.ts          # Validation helpers
│   │       └── format.ts              # Formatting utilities
│   │
│   ├── routes/
│   │   ├── +layout.svelte             # Root layout with navigation
│   │   ├── +layout.server.ts          # Root layout data loader
│   │   ├── +page.svelte               # Homepage
│   │   ├── +page.server.ts            # Homepage data loader
│   │   │
│   │   ├── events/
│   │   │   ├── +page.svelte           # Events listing page
│   │   │   ├── +page.server.ts        # Events listing loader
│   │   │   └── [slug]/
│   │   │       ├── +page.svelte       # Event detail page
│   │   │       └── +page.server.ts    # Event detail loader
│   │   │
│   │   ├── talents/
│   │   │   ├── +page.svelte           # Talents listing page
│   │   │   ├── +page.server.ts        # Talents listing loader
│   │   │   └── [id]/
│   │   │       ├── +page.svelte       # Talent detail page
│   │   │       └── +page.server.ts    # Talent detail loader
│   │   │
│   │   ├── contact/
│   │   │   ├── +page.svelte           # Contact page
│   │   │   └── +page.server.ts        # Contact form handler
│   │   │
│   │   └── api/
│   │       ├── events/
│   │       │   ├── +server.ts         # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── +server.ts     # GET, PUT, DELETE
│   │       │
│   │       ├── talents/
│   │       │   ├── +server.ts         # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── +server.ts     # GET, PUT, DELETE
│   │       │
│   │       └── media/
│   │           ├── upload/
│   │           │   └── +server.ts     # POST (upload to S3)
│   │           └── [id]/
│   │               └── +server.ts     # GET, DELETE
│   │
│   ├── app.d.ts                       # App type definitions
│   ├── app.html                       # HTML template
│   └── hooks.server.ts                # Server hooks (error handling)
│
├── static/
│   ├── favicon.png
│   └── robots.txt
│
├── drizzle/
│   └── migrations/                    # Generated migrations
│
├── .env.example                       # Environment template
├── .env                              # Local environment (gitignored)
├── drizzle.config.ts                 # Drizzle configuration
├── package.json
├── tsconfig.json
├── svelte.config.js
└── vite.config.ts
```

---

## 3. Database Schema

### 3.1 PostgreSQL Schema (Drizzle Format)

```typescript
// src/lib/server/db/schema.ts

import { pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video']);

// ============================================
// TABLES
// ============================================

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  location: varchar('location', { length: 500 }).notNull(),
  coverMediaId: uuid('cover_media_id'), // References media table
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('events_slug_idx').on(table.slug),
  publishedIdx: index('events_published_idx').on(table.published),
  startDateIdx: index('events_start_date_idx').on(table.startDate),
}));

export const talents = pgTable('talents', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: varchar('role', { length: 150 }).notNull(),
  bio: text('bio').notNull(),
  profileMediaId: uuid('profile_media_id'), // References media table
  socialLinks: text('social_links'), // JSON string: {"instagram": "...", "linkedin": "..."}
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  publishedIdx: index('talents_published_idx').on(table.published),
  nameIdx: index('talents_name_idx').on(table.firstName, table.lastName),
}));

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: mediaTypeEnum('type').notNull(),
  url: varchar('url', { length: 1000 }).notNull(), // Full S3 URL
  s3Key: varchar('s3_key', { length: 500 }).notNull(), // S3 object key for deletion
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(), // File size in bytes
  eventId: uuid('event_id'), // Nullable FK to events
  talentId: uuid('talent_id'), // Nullable FK to talents
  isCover: boolean('is_cover').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventIdIdx: index('media_event_id_idx').on(table.eventId),
  talentIdIdx: index('media_talent_id_idx').on(table.talentId),
  coverIdx: index('media_is_cover_idx').on(table.isCover),
  // Constraint: media belongs to either event OR talent, not both
  checkEventOrTalent: check('media_event_or_talent_check',
    sql`(event_id IS NOT NULL AND talent_id IS NULL) OR (event_id IS NULL AND talent_id IS NOT NULL)`
  ),
}));

// ============================================
// RELATIONS
// ============================================

export const eventsRelations = relations(events, ({ many, one }) => ({
  media: many(media),
  coverMedia: one(media, {
    fields: [events.coverMediaId],
    references: [media.id],
  }),
}));

export const talentsRelations = relations(talents, ({ many, one }) => ({
  media: many(media),
  profileMedia: one(media, {
    fields: [talents.profileMediaId],
    references: [media.id],
  }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  event: one(events, {
    fields: [media.eventId],
    references: [events.id],
  }),
  talent: one(talents, {
    fields: [media.talentId],
    references: [talents.id],
  }),
}));
```

### 3.2 Database Constraints & Rules

1. **UUID Primary Keys**: All tables use UUIDs for better security and distribution
2. **Timestamps**: All entities track creation and update times
3. **Indexes**:
   - `events.slug`: Unique index for fast lookups by slug
   - `events.published`: Filter published events efficiently
   - `events.start_date`: Sort/filter by date
   - `talents.published`: Filter published talents
   - `media.event_id` & `media.talent_id`: Fast joins
   - `media.is_cover`: Quickly find cover images

4. **Check Constraint**: Media must belong to exactly one entity (event XOR talent)

5. **Foreign Keys**:
   - `media.event_id` → `events.id` (ON DELETE CASCADE)
   - `media.talent_id` → `talents.id` (ON DELETE CASCADE)
   - Cover media references are nullable to avoid circular dependencies

### 3.3 Migration Strategy

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Commands**:
- `pnpm drizzle-kit generate:pg` - Generate migrations
- `pnpm drizzle-kit push:pg` - Push schema to database
- `pnpm drizzle-kit studio` - Launch Drizzle Studio GUI

---

## 4. Environment Configuration

### 4.1 Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/germinal

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=germinal-media
S3_PUBLIC_URL=https://germinal-media.s3.amazonaws.com

# Application
PUBLIC_APP_URL=http://localhost:5173
NODE_ENV=development

# Upload Limits
MAX_FILE_SIZE=10485760  # 10MB in bytes
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp,image/gif
ALLOWED_VIDEO_TYPES=video/mp4,video/webm,video/quicktime
```

### 4.2 Type-Safe Environment Access

```typescript
// src/lib/server/env.ts

import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_PUBLIC_URL: z.string().url(),
  MAX_FILE_SIZE: z.string().transform(Number),
  ALLOWED_IMAGE_TYPES: z.string().transform(s => s.split(',')),
  ALLOWED_VIDEO_TYPES: z.string().transform(s => s.split(',')),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();
```

---

## 5. S3 Integration

### 5.1 S3 Service Implementation

```typescript
// src/lib/server/services/s3.ts

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface UploadResult {
  url: string;
  key: string;
  mimeType: string;
  size: number;
}

/**
 * Upload a file to S3
 * @param file - File buffer
 * @param mimeType - MIME type of the file
 * @param folder - S3 folder (events/talents)
 * @returns Upload result with URL and metadata
 */
export async function uploadToS3(
  file: Buffer,
  mimeType: string,
  folder: 'events' | 'talents'
): Promise<UploadResult> {
  const fileExtension = getExtensionFromMimeType(mimeType);
  const fileName = `${randomUUID()}${fileExtension}`;
  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: mimeType,
    // Make objects publicly readable
    ACL: 'public-read',
  });

  await s3Client.send(command);

  const url = `${env.S3_PUBLIC_URL}/${key}`;

  return {
    url,
    key,
    mimeType,
    size: file.length,
  };
}

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Upload multiple files to S3
 * @param files - Array of file buffers with metadata
 * @param folder - S3 folder
 * @returns Array of upload results
 */
export async function uploadMultipleToS3(
  files: Array<{ buffer: Buffer; mimeType: string }>,
  folder: 'events' | 'talents'
): Promise<UploadResult[]> {
  return Promise.all(
    files.map(file => uploadToS3(file.buffer, file.mimeType, folder))
  );
}

function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[mimeType] || '';
}
```

### 5.2 Media Upload Flow

1. **Client**: User selects files via `<input type="file" multiple>`
2. **Form Submission**: Files sent as `multipart/form-data` to `/api/media/upload`
3. **Server Validation**:
   - Check file size
   - Validate MIME type
   - Ensure limit per upload (e.g., max 10 files)
4. **S3 Upload**: Files uploaded to S3, URLs returned
5. **Database**: Media metadata saved to PostgreSQL
6. **Response**: Return media IDs and URLs to client

---

## 6. Backend Services & API

### 6.1 Database Client

```typescript
// src/lib/server/db/index.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
```

### 6.2 Events Service

```typescript
// src/lib/server/services/events.ts

import { db } from '../db';
import { events, media } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import type { Event, CreateEventInput, UpdateEventInput } from '$lib/types/events';

export async function getAllEvents(publishedOnly = true) {
  const query = db.query.events.findMany({
    where: publishedOnly ? eq(events.published, true) : undefined,
    orderBy: [desc(events.startDate)],
    with: {
      coverMedia: true,
    },
  });

  return await query;
}

export async function getEventBySlug(slug: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      coverMedia: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

export async function createEvent(input: CreateEventInput) {
  const [event] = await db.insert(events).values({
    title: input.title,
    slug: input.slug,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    location: input.location,
    published: input.published ?? false,
  }).returning();

  return event;
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  const [updated] = await db.update(events)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning();

  if (!updated) {
    throw new Error('Event not found');
  }

  return updated;
}

export async function deleteEvent(id: string) {
  // Media will cascade delete due to FK constraint
  await db.delete(events).where(eq(events.id, id));
}
```

### 6.3 Media Service

```typescript
// src/lib/server/services/media.ts

import { db } from '../db';
import { media } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { uploadToS3, deleteFromS3 } from './s3';
import type { CreateMediaInput } from '$lib/types/media';

export async function createMedia(input: CreateMediaInput) {
  const [newMedia] = await db.insert(media).values(input).returning();
  return newMedia;
}

export async function getMediaForEvent(eventId: string) {
  return await db.query.media.findMany({
    where: eq(media.eventId, eventId),
  });
}

export async function getMediaForTalent(talentId: string) {
  return await db.query.media.findMany({
    where: eq(media.talentId, talentId),
  });
}

export async function deleteMedia(id: string) {
  const [mediaItem] = await db.select().from(media).where(eq(media.id, id));

  if (!mediaItem) {
    throw new Error('Media not found');
  }

  // Delete from S3
  await deleteFromS3(mediaItem.s3Key);

  // Delete from database
  await db.delete(media).where(eq(media.id, id));
}

export async function setCoverMedia(
  mediaId: string,
  entityType: 'event' | 'talent',
  entityId: string
) {
  // Unset current cover
  await db.update(media)
    .set({ isCover: false })
    .where(
      entityType === 'event'
        ? eq(media.eventId, entityId)
        : eq(media.talentId, entityId)
    );

  // Set new cover
  await db.update(media)
    .set({ isCover: true })
    .where(eq(media.id, mediaId));
}
```

### 6.4 API Endpoints

#### Events API

```typescript
// src/routes/api/events/+server.ts

import { json } from '@sveltejs/kit';
import { getAllEvents, createEvent } from '$lib/server/services/events';
import type { RequestHandler } from './$types';

// GET /api/events - List all events
export const GET: RequestHandler = async ({ url }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const events = await getAllEvents(publishedOnly);
  return json(events);
};

// POST /api/events - Create event
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  // Validation would happen here
  const event = await createEvent(data);
  return json(event, { status: 201 });
};
```

```typescript
// src/routes/api/events/[id]/+server.ts

import { json, error } from '@sveltejs/kit';
import { getEventById, updateEvent, deleteEvent } from '$lib/server/services/events';
import type { RequestHandler } from './$types';

// GET /api/events/:id
export const GET: RequestHandler = async ({ params }) => {
  try {
    const event = await getEventById(params.id);
    return json(event);
  } catch (e) {
    throw error(404, 'Event not found');
  }
};

// PUT /api/events/:id
export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();
  try {
    const event = await updateEvent(params.id, data);
    return json(event);
  } catch (e) {
    throw error(404, 'Event not found');
  }
};

// DELETE /api/events/:id
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteEvent(params.id);
    return json({ success: true });
  } catch (e) {
    throw error(404, 'Event not found');
  }
};
```

#### Media Upload API

```typescript
// src/routes/api/media/upload/+server.ts

import { json, error } from '@sveltejs/kit';
import { uploadToS3 } from '$lib/server/services/s3';
import { createMedia } from '$lib/server/services/media';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  const entityType = formData.get('entityType') as 'event' | 'talent';
  const entityId = formData.get('entityId') as string;

  if (!files.length) {
    throw error(400, 'No files provided');
  }

  if (!entityType || !entityId) {
    throw error(400, 'Entity type and ID required');
  }

  const uploadedMedia = [];

  for (const file of files) {
    // Validate file size
    if (file.size > env.MAX_FILE_SIZE) {
      throw error(400, `File ${file.name} exceeds max size`);
    }

    // Validate MIME type
    const allowedTypes = [...env.ALLOWED_IMAGE_TYPES, ...env.ALLOWED_VIDEO_TYPES];
    if (!allowedTypes.includes(file.type)) {
      throw error(400, `File type ${file.type} not allowed`);
    }

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadToS3(buffer, file.type, entityType === 'event' ? 'events' : 'talents');

    // Save to database
    const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
    const mediaRecord = await createMedia({
      type: mediaType,
      url: uploadResult.url,
      s3Key: uploadResult.key,
      mimeType: file.type,
      size: file.size,
      eventId: entityType === 'event' ? entityId : null,
      talentId: entityType === 'talent' ? entityId : null,
      isCover: false,
    });

    uploadedMedia.push(mediaRecord);
  }

  return json(uploadedMedia, { status: 201 });
};
```

---

## 7. Frontend Implementation

### 7.1 Page Routes

#### Events Listing

```typescript
// src/routes/events/+page.server.ts

import { getAllEvents } from '$lib/server/services/events';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const events = await getAllEvents(true);

  return {
    events,
  };
};
```

```svelte
<!-- src/routes/events/+page.svelte -->

<script lang="ts">
  import EventCard from '$lib/components/EventCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Events | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-12">
  <h1 class="text-4xl font-bold mb-8">Upcoming Events</h1>

  {#if data.events.length === 0}
    <p class="text-gray-500">No events available at the moment.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.events as event}
        <EventCard {event} />
      {/each}
    </div>
  {/if}
</div>
```

#### Event Detail Page

```typescript
// src/routes/events/[slug]/+page.server.ts

import { getEventBySlug } from '$lib/server/services/events';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const event = await getEventBySlug(params.slug);

    return {
      event,
    };
  } catch (e) {
    throw error(404, 'Event not found');
  }
};
```

```svelte
<!-- src/routes/events/[slug]/+page.svelte -->

<script lang="ts">
  import EventGallery from '$lib/components/EventGallery.svelte';
  import { formatDate } from '$lib/utils/format';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const { event } = data;
</script>

<svelte:head>
  <title>{event.title} | Germinal</title>
  <meta name="description" content={event.description.slice(0, 160)} />
</svelte:head>

<article class="container mx-auto px-4 py-12 max-w-4xl">
  <!-- Cover Image/Video -->
  {#if event.coverMedia}
    <div class="mb-8 rounded-lg overflow-hidden">
      {#if event.coverMedia.type === 'image'}
        <img
          src={event.coverMedia.url}
          alt={event.title}
          class="w-full h-96 object-cover"
        />
      {:else}
        <video
          src={event.coverMedia.url}
          controls
          class="w-full h-96 object-cover"
        >
          Your browser does not support video.
        </video>
      {/if}
    </div>
  {/if}

  <!-- Event Info -->
  <header class="mb-8">
    <h1 class="text-5xl font-bold mb-4">{event.title}</h1>

    <div class="flex flex-wrap gap-4 text-gray-600 mb-4">
      <div class="flex items-center gap-2">
        <span>📅</span>
        <time>{formatDate(event.startDate)} - {formatDate(event.endDate)}</time>
      </div>
      <div class="flex items-center gap-2">
        <span>📍</span>
        <span>{event.location}</span>
      </div>
    </div>

    <p class="text-lg text-gray-700 leading-relaxed">{event.description}</p>
  </header>

  <!-- Media Gallery -->
  {#if event.media && event.media.length > 0}
    <section class="mt-12">
      <h2 class="text-3xl font-bold mb-6">Gallery</h2>
      <EventGallery media={event.media} />
    </section>
  {/if}
</article>
```

### 7.2 Components

#### EventCard Component

```svelte
<!-- src/lib/components/EventCard.svelte -->

<script lang="ts">
  import { formatDate } from '$lib/utils/format';
  import type { Event } from '$lib/types/events';

  interface Props {
    event: Event & { coverMedia?: Media | null };
  }

  let { event }: Props = $props();
</script>

<a
  href="/events/{event.slug}"
  class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
>
  {#if event.coverMedia}
    <div class="aspect-video overflow-hidden">
      {#if event.coverMedia.type === 'image'}
        <img
          src={event.coverMedia.url}
          alt={event.title}
          class="w-full h-full object-cover hover:scale-105 transition-transform"
        />
      {:else}
        <video
          src={event.coverMedia.url}
          class="w-full h-full object-cover"
          muted
        />
      {/if}
    </div>
  {:else}
    <div class="aspect-video bg-gray-200 flex items-center justify-center">
      <span class="text-gray-400 text-4xl">📸</span>
    </div>
  {/if}

  <div class="p-6">
    <h3 class="text-2xl font-bold mb-2">{event.title}</h3>
    <p class="text-gray-600 mb-4 line-clamp-2">{event.description}</p>

    <div class="flex items-center gap-4 text-sm text-gray-500">
      <div class="flex items-center gap-1">
        <span>📅</span>
        <time>{formatDate(event.startDate)}</time>
      </div>
      <div class="flex items-center gap-1">
        <span>📍</span>
        <span class="truncate">{event.location}</span>
      </div>
    </div>
  </div>
</a>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
```

#### EventGallery Component

```svelte
<!-- src/lib/components/EventGallery.svelte -->

<script lang="ts">
  import type { Media } from '$lib/types/media';

  interface Props {
    media: Media[];
  }

  let { media }: Props = $props();

  let selectedMedia = $state<Media | null>(null);

  function openLightbox(item: Media) {
    selectedMedia = item;
  }

  function closeLightbox() {
    selectedMedia = null;
  }
</script>

<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
  {#each media as item}
    <button
      onclick={() => openLightbox(item)}
      class="aspect-square overflow-hidden rounded-lg hover:opacity-90 transition-opacity"
    >
      {#if item.type === 'image'}
        <img
          src={item.url}
          alt="Event media"
          class="w-full h-full object-cover"
        />
      {:else}
        <video
          src={item.url}
          class="w-full h-full object-cover"
          muted
        />
      {/if}
    </button>
  {/each}
</div>

<!-- Lightbox Modal -->
{#if selectedMedia}
  <div
    class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
    onclick={closeLightbox}
    role="button"
    tabindex="-1"
  >
    <button
      class="absolute top-4 right-4 text-white text-4xl"
      onclick={closeLightbox}
    >
      ×
    </button>

    {#if selectedMedia.type === 'image'}
      <img
        src={selectedMedia.url}
        alt="Full size"
        class="max-w-full max-h-full object-contain"
      />
    {:else}
      <video
        src={selectedMedia.url}
        controls
        class="max-w-full max-h-full"
      >
        Your browser does not support video.
      </video>
    {/if}
  </div>
{/if}
```

#### TalentCard Component

```svelte
<!-- src/lib/components/TalentCard.svelte -->

<script lang="ts">
  import type { Talent } from '$lib/types/talents';

  interface Props {
    talent: Talent & { profileMedia?: Media | null };
  }

  let { talent }: Props = $props();
</script>

<a
  href="/talents/{talent.id}"
  class="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
>
  <div class="aspect-square overflow-hidden">
    {#if talent.profileMedia}
      <img
        src={talent.profileMedia.url}
        alt="{talent.firstName} {talent.lastName}"
        class="w-full h-full object-cover hover:scale-105 transition-transform"
      />
    {:else}
      <div class="w-full h-full bg-gray-200 flex items-center justify-center">
        <span class="text-gray-400 text-6xl">👤</span>
      </div>
    {/if}
  </div>

  <div class="p-6">
    <h3 class="text-2xl font-bold mb-1">
      {talent.firstName} {talent.lastName}
    </h3>
    <p class="text-gray-600 font-medium mb-3">{talent.role}</p>
    <p class="text-gray-700 line-clamp-3">{talent.bio}</p>
  </div>
</a>
```

#### Navigation Component

```svelte
<!-- src/lib/components/Navigation.svelte -->

<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
    { href: '/talents', label: 'Talents' },
    { href: '/contact', label: 'Contact' },
  ];

  function isActive(href: string): boolean {
    if (href === '/') {
      return $page.url.pathname === '/';
    }
    return $page.url.pathname.startsWith(href);
  }
</script>

<nav class="bg-white shadow-md">
  <div class="container mx-auto px-4">
    <div class="flex items-center justify-between h-16">
      <a href="/" class="text-2xl font-bold text-gray-900">
        Germinal
      </a>

      <ul class="flex gap-8">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="text-gray-700 hover:text-gray-900 font-medium transition-colors"
              class:text-blue-600={isActive(item.href)}
              class:font-bold={isActive(item.href)}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</nav>
```

### 7.3 Root Layout

```svelte
<!-- src/routes/+layout.svelte -->

<script lang="ts">
  import Navigation from '$lib/components/Navigation.svelte';
  import './layout.css';

  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <Navigation />

  <main class="flex-1">
    {@render children()}
  </main>

  <footer class="bg-gray-900 text-white py-8 mt-12">
    <div class="container mx-auto px-4 text-center">
      <p>&copy; {new Date().getFullYear()} Germinal. All rights reserved.</p>
    </div>
  </footer>
</div>
```

---

## 8. Utilities & Helpers

### 8.1 Slug Generation

```typescript
// src/lib/utils/slugify.ts

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens
    .replace(/^-|-$/g, ''); // Trim hyphens
}

export function ensureUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  let slug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
```

### 8.2 Date Formatting

```typescript
// src/lib/utils/format.ts

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(d);
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
```

### 8.3 Validation Schemas

```typescript
// src/lib/server/validators/events.ts

import { z } from 'zod';

export const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  location: z.string().min(1).max(500),
  published: z.boolean().optional(),
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const updateEventSchema = createEventSchema.partial();
```

---

## 9. Type Definitions

```typescript
// src/lib/types/events.ts

import type { events, media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Event = InferSelectModel<typeof events>;
export type CreateEventInput = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEventInput = Partial<CreateEventInput>;

export type EventWithMedia = Event & {
  media: Media[];
  coverMedia?: Media | null;
};
```

```typescript
// src/lib/types/talents.ts

import type { talents } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Talent = InferSelectModel<typeof talents>;
export type CreateTalentInput = Omit<Talent, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTalentInput = Partial<CreateTalentInput>;

export interface SocialLinks {
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}
```

```typescript
// src/lib/types/media.ts

import type { media } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type Media = InferSelectModel<typeof media>;
export type CreateMediaInput = Omit<Media, 'id' | 'createdAt'>;
```

---

## 10. Implementation Phases

### Phase 1: Project Setup & Infrastructure (Day 1)

1. **Install Dependencies**
   ```bash
   pnpm add drizzle-orm postgres
   pnpm add -D drizzle-kit
   pnpm add @aws-sdk/client-s3
   pnpm add zod
   ```

2. **Environment Configuration**
   - Create `.env` file with database and S3 credentials
   - Implement `src/lib/server/env.ts` for type-safe env access
   - Update `.gitignore` to exclude `.env`

3. **Database Setup**
   - Create PostgreSQL database
   - Implement schema in `src/lib/server/db/schema.ts`
   - Configure Drizzle in `drizzle.config.ts`
   - Generate and run initial migration
   - Test database connection

4. **S3 Configuration**
   - Create S3 bucket
   - Configure bucket policy for public reads
   - Set up CORS configuration
   - Implement S3 service in `src/lib/server/services/s3.ts`
   - Test file upload

### Phase 2: Backend Services (Day 2-3)

1. **Database Services**
   - Implement events service with CRUD operations
   - Implement talents service with CRUD operations
   - Implement media service with S3 integration
   - Add input validation using Zod schemas

2. **API Endpoints**
   - Create events API routes (GET, POST, PUT, DELETE)
   - Create talents API routes (GET, POST, PUT, DELETE)
   - Create media upload endpoint
   - Add error handling and status codes

3. **Testing**
   - Test all endpoints with curl or Postman
   - Verify database constraints
   - Test S3 upload/delete operations

### Phase 3: Frontend Pages (Day 4-5)

1. **Layout & Navigation**
   - Update root layout with Navigation component
   - Implement responsive navigation
   - Add footer

2. **Events Pages**
   - Create events listing page with SSR
   - Create event detail page with media gallery
   - Test slug-based routing

3. **Talents Pages**
   - Create talents listing page
   - Create talent detail page
   - Display social links

4. **Contact Page**
   - Simple contact page (can be expanded later)

### Phase 4: Components & UI (Day 6)

1. **Core Components**
   - Implement EventCard component
   - Implement EventGallery with lightbox
   - Implement TalentCard component
   - Implement MediaGrid component

2. **Styling**
   - Apply Tailwind CSS styles
   - Ensure responsive design
   - Add hover effects and transitions
   - Test on mobile devices

### Phase 5: Polish & Testing (Day 7)

1. **Error Handling**
   - Add 404 pages for missing entities
   - Implement global error handling in `hooks.server.ts`
   - Add loading states

2. **Performance**
   - Optimize images (consider adding image optimization)
   - Test page load times
   - Verify SSR is working correctly

3. **SEO**
   - Add meta tags to pages
   - Implement OpenGraph tags for social sharing
   - Create `robots.txt`

4. **Documentation**
   - Write README with setup instructions
   - Document API endpoints
   - Add code comments where needed

---

## 11. Database Seed Data (Optional)

```typescript
// scripts/seed.ts

import { db } from '../src/lib/server/db';
import { events, talents, media } from '../src/lib/server/db/schema';

async function seed() {
  // Create sample event
  const [event] = await db.insert(events).values({
    title: 'Summer Music Festival 2026',
    slug: 'summer-music-festival-2026',
    description: 'Join us for an unforgettable night of live music...',
    startDate: new Date('2026-07-15T18:00:00Z'),
    endDate: new Date('2026-07-15T23:00:00Z'),
    location: 'Central Park, New York',
    published: true,
  }).returning();

  // Create sample talent
  const [talent] = await db.insert(talents).values({
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'Lead Vocalist',
    bio: 'Award-winning vocalist with 10 years of experience...',
    socialLinks: JSON.stringify({
      instagram: 'https://instagram.com/janedoe',
      twitter: 'https://twitter.com/janedoe',
    }),
    published: true,
  }).returning();

  console.log('Seed data created successfully');
}

seed().catch(console.error);
```

---

## 12. Deployment Considerations

### 12.1 Environment Variables in Production

- Never commit `.env` to version control
- Use platform-specific secret management (Vercel, Railway, etc.)
- Ensure S3 bucket is in same region as app for better performance

### 12.2 Database Migrations

- Always run migrations before deploying new code
- Keep migration files in version control
- Test migrations on staging environment first

### 12.3 S3 Configuration

- Enable CloudFront CDN for faster media delivery
- Set appropriate cache headers
- Configure lifecycle policies to archive old media

### 12.4 Performance Optimizations

- Enable SvelteKit's prerendering for static pages
- Implement image optimization (sharp, etc.)
- Add database query caching if needed
- Use connection pooling for PostgreSQL

---

## 13. Future Enhancements (Out of Scope for Initial Version)

- Admin authentication and CMS interface
- Search functionality for events and talents
- Filtering and sorting on listings
- Email notifications for new events
- Social media integration for auto-posting
- Analytics tracking
- Event registration/ticketing
- Comments and reviews
- Multi-language support

---

## 14. Key Files Summary

### Must Create

1. `src/lib/server/db/schema.ts` - Database schema
2. `src/lib/server/db/index.ts` - Database client
3. `src/lib/server/services/events.ts` - Events service
4. `src/lib/server/services/talents.ts` - Talents service
5. `src/lib/server/services/media.ts` - Media service
6. `src/lib/server/services/s3.ts` - S3 service
7. `src/lib/server/env.ts` - Environment validation
8. `src/routes/api/events/+server.ts` - Events API
9. `src/routes/api/media/upload/+server.ts` - Media upload API
10. `src/routes/events/+page.svelte` - Events listing
11. `src/routes/events/[slug]/+page.svelte` - Event detail
12. `src/lib/components/EventCard.svelte` - Event card component
13. `src/lib/components/EventGallery.svelte` - Gallery component
14. `src/lib/components/Navigation.svelte` - Navigation component
15. `drizzle.config.ts` - Drizzle configuration
16. `.env.example` - Environment template

### Configuration Files

- `package.json` - Add new dependencies
- `tsconfig.json` - Already configured
- `svelte.config.js` - Already configured
- `.gitignore` - Add `.env`

---

## 15. Success Criteria

The implementation is complete when:

1. Events can be created with media and displayed on public pages
2. Event detail pages show cover media and full gallery
3. Talents can be created with profile pictures and displayed
4. Media files are successfully uploaded to S3
5. All pages are server-side rendered
6. Navigation works correctly across all pages
7. Database constraints are enforced
8. Responsive design works on mobile and desktop
9. No TypeScript errors
10. No console errors on frontend

---

## 16. Development Commands

```bash
# Development
pnpm dev                    # Start dev server

# Database
pnpm drizzle-kit generate   # Generate migrations
pnpm drizzle-kit push       # Push schema to database
pnpm drizzle-kit studio     # Open database GUI

# Build
pnpm build                  # Build for production
pnpm preview                # Preview production build

# Type checking
pnpm check                  # Run Svelte type checking
```

---

## Conclusion

This plan provides a complete roadmap for building Germinal from scratch. The architecture is clean, scalable, and follows SvelteKit best practices. By following this plan phase by phase, you'll have a production-ready application with solid foundations for future enhancements.

The key principles guiding this implementation:

- **Type Safety**: TypeScript everywhere, from database to frontend
- **Separation of Concerns**: Clear service layer, API routes, and components
- **Performance**: SSR, optimized queries, efficient S3 integration
- **Maintainability**: Consistent patterns, clear file structure
- **Simplicity**: No over-engineering, focused on core requirements
