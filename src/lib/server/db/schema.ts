import { pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================
// ENUMS
// ============================================

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video']);

export const inquiryTypeEnum = pgEnum('inquiry_type', [
    'collaboration',
    'new_project',
    'join_roster',
    'other'
]);

export const reservationStatusEnum = pgEnum('reservation_status', [
    'pending',
    'processing',
    'confirmed',
    'cancelled',
    'expired'
]);

export const paymentStatusEnum = pgEnum('payment_status', [
    'pending',
    'processing',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded'
]);

// ============================================
// TABLES
// ============================================

export const events = pgTable('events', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    description: text('description').notNull(),
    subtitle: text('subtitle'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    location: varchar('location', { length: 500 }).notNull(),
    venueName: varchar('venue_name', { length: 200 }),
    streetAddress: varchar('street_address', { length: 255 }),
    district: varchar('district', { length: 100 }),
    city: varchar('city', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 }),
    collaborators: text('collaborators'),
    timings: text('timings'),
    curator: varchar('curator', { length: 150 }),
    materials: text('materials'),
    admissionInfo: varchar('admission_info', { length: 150 }),
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

// ============================================
// CONTACT FORM TABLES
// ============================================

export const contactSubmissions = pgTable('contact_submissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    company: varchar('company', { length: 255 }),
    inquiryType: inquiryTypeEnum('inquiry_type').notNull(),
    message: text('message').notNull(),
    honeypot: varchar('honeypot', { length: 100 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 500 }),
    emailSent: boolean('email_sent').default(false).notNull(),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    emailError: text('email_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    emailIdx: index('contact_submissions_email_idx').on(table.email),
    createdAtIdx: index('contact_submissions_created_at_idx').on(table.createdAt),
    inquiryTypeIdx: index('contact_submissions_inquiry_type_idx').on(table.inquiryType),
    emailSentIdx: index('contact_submissions_email_sent_idx').on(table.emailSent),
}));

// ============================================
// EMAIL QUEUE TABLES
// ============================================

export const emailQueue = pgTable('email_queue', {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // 'ticket_confirmation', 'contact_notification'
    recipient: varchar('recipient', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    textBody: text('text_body').notNull(),
    htmlBody: text('html_body').notNull(),
    metadata: text('metadata'), // JSON with reservation ID, etc.
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, sent, failed
    lastError: text('last_error'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    statusIdx: index('email_queue_status_idx').on(table.status),
    createdAtIdx: index('email_queue_created_at_idx').on(table.createdAt),
}));

// ============================================
// WAITLIST TABLES
// ============================================

export const waitlist = pgTable('waitlist', {
    id: uuid('id').defaultRandom().primaryKey(),
    eventSessionId: uuid('event_session_id')
        .notNull()
        .references(() => eventSessions.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    quantity: integer('quantity').notNull().default(1),
    notified: boolean('notified').default(false).notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    sessionIdIdx: index('waitlist_session_id_idx').on(table.eventSessionId),
    emailIdx: index('waitlist_email_idx').on(table.email),
    notifiedIdx: index('waitlist_notified_idx').on(table.notified),
    expiresAtIdx: index('waitlist_expires_at_idx').on(table.expiresAt),
    quantityCheck: check('waitlist_quantity_check', sql`quantity > 0`),
}));

// ============================================
// RESERVATION AND TICKETING TABLES
// ============================================

export const eventSessions = pgTable('event_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
        .notNull()
        .references(() => events.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    totalCapacity: integer('total_capacity').notNull(),
    availableCapacity: integer('available_capacity').notNull(),
    priceAmount: integer('price_amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    published: boolean('published').default(false).notNull(),
    allowWaitlist: boolean('allow_waitlist').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    eventIdIdx: index('event_sessions_event_id_idx').on(table.eventId),
    publishedIdx: index('event_sessions_published_idx').on(table.published),
    startTimeIdx: index('event_sessions_start_time_idx').on(table.startTime),
    capacityCheck: check('event_sessions_capacity_check',
        sql`available_capacity >= 0 AND available_capacity <= total_capacity`
    ),
    timeRangeCheck: check('event_sessions_time_range_check',
        sql`end_time > start_time`
    ),
    priceCheck: check('event_sessions_price_check',
        sql`price_amount >= 0`
    ),
}));

export const reservations = pgTable('reservations', {
    id: uuid('id').defaultRandom().primaryKey(),
    eventSessionId: uuid('event_session_id')
        .notNull()
        .references(() => eventSessions.id, { onDelete: 'restrict' }),
    guestEmail: varchar('guest_email', { length: 255 }).notNull(),
    guestName: varchar('guest_name', { length: 255 }).notNull(),
    guestPhone: varchar('guest_phone', { length: 50 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull().default(1),
    totalAmount: integer('total_amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    status: reservationStatusEnum('status').notNull().default('pending'),
    accessToken: varchar('access_token', { length: 64 }).notNull().unique(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 500 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    sessionIdIdx: index('reservations_session_id_idx').on(table.eventSessionId),
    emailIdx: index('reservations_email_idx').on(table.guestEmail),
    accessTokenIdx: index('reservations_access_token_idx').on(table.accessToken),
    statusIdx: index('reservations_status_idx').on(table.status),
    expiresAtIdx: index('reservations_expires_at_idx').on(table.expiresAt),
    // Composite indexes for common query patterns
    sessionStatusIdx: index('reservations_session_status_idx')
        .on(table.eventSessionId, table.status),
    statusExpiresIdx: index('reservations_status_expires_idx')
        .on(table.status, table.expiresAt),
    quantityCheck: check('reservations_quantity_check', sql`quantity > 0`),
    amountCheck: check('reservations_amount_check', sql`total_amount >= 0`),
}));

export const payments = pgTable('payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    reservationId: uuid('reservation_id')
        .notNull()
        .references(() => reservations.id, { onDelete: 'restrict' }),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }).notNull().unique(),
    stripeClientSecret: text('stripe_client_secret'),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 }),
    refundedAmount: integer('refunded_amount').default(0).notNull(),
    receiptUrl: varchar('receipt_url', { length: 1000 }),
    stripeChargeId: varchar('stripe_charge_id', { length: 255 }),
    lastError: text('last_error'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
    webhookProcessedAt: timestamp('webhook_processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    reservationIdIdx: index('payments_reservation_id_idx').on(table.reservationId),
    stripePaymentIntentIdx: index('payments_stripe_payment_intent_idx').on(table.stripePaymentIntentId),
    statusIdx: index('payments_status_idx').on(table.status),
    idempotencyKeyIdx: index('payments_idempotency_key_idx').on(table.idempotencyKey),
    // Index for monitoring unprocessed webhooks (partial index for efficiency)
    webhookProcessedIdx: index('payments_webhook_processed_idx')
        .on(table.webhookProcessedAt)
        .where(sql`webhook_processed_at IS NULL`),
    refundCheck: check('payments_refund_check',
        sql`refunded_amount >= 0 AND refunded_amount <= amount`
    ),
}));

// ============================================
// RESERVATION AND TICKETING RELATIONS
// ============================================

export const eventSessionsRelations = relations(eventSessions, ({ one, many }) => ({
    event: one(events, {
        fields: [eventSessions.eventId],
        references: [events.id],
    }),
    reservations: many(reservations),
    waitlistEntries: many(waitlist),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
    eventSession: one(eventSessions, {
        fields: [reservations.eventSessionId],
        references: [eventSessions.id],
    }),
    user: one(users, {
        fields: [reservations.userId],
        references: [users.id],
    }),
    payment: one(payments, {
        fields: [reservations.id],
        references: [payments.reservationId],
    }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
    reservation: one(reservations, {
        fields: [payments.reservationId],
        references: [reservations.id],
    }),
}));

export const waitlistRelations = relations(waitlist, ({ one }) => ({
    eventSession: one(eventSessions, {
        fields: [waitlist.eventSessionId],
        references: [eventSessions.id],
    }),
}));

export const emailQueueRelations = relations(emailQueue, () => ({
    // Email queue is a standalone table with no direct relations
    // Metadata field contains JSON with references to other entities
}));
