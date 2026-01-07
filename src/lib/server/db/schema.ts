import { pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

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
  coverMediaId: uuid('cover_media_id'),
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
  profileMediaId: uuid('profile_media_id'),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  quote: text('quote'),
  specializations: text('specializations'),
  socialLinks: text('social_links'),
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
  url: varchar('url', { length: 1000 }).notNull(),
  s3Key: varchar('s3_key', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  eventId: uuid('event_id'),
  talentId: uuid('talent_id'),
  isCover: boolean('is_cover').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventIdIdx: index('media_event_id_idx').on(table.eventId),
  talentIdIdx: index('media_talent_id_idx').on(table.talentId),
  coverIdx: index('media_is_cover_idx').on(table.isCover),
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

// ============================================
// AUTHENTICATION TABLES
// ============================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  expiresAtIndex: index('sessions_expires_at_idx').on(table.expiresAt),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
