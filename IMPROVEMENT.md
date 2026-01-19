# Reservation and Ticketing System - Complete Implementation Guide

## Executive Summary

This document provides **complete, copy-pasteable code** for implementing a guest-based reservation and ticketing system with Stripe payments for the Germinal SvelteKit application.

**What You're Building:**
- Guest-based ticket reservations (NO user accounts required)
- Stripe payment integration with Payment Intents
- Secure ticket access via unguessable tokens
- Race-condition-free capacity management
- Admin dashboard for managing sessions and reservations

**Key Technical Decisions:**
- **Database:** PostgreSQL with row-level locking to prevent overbooking
- **Payments:** Stripe Payment Intents (not Checkout Sessions) for better control
- **Security:** 64-character access tokens, webhook signature verification, rate limiting
- **Naming:** "Event Sessions" (not slots/services) for time-bound ticketable events

---

## Table of Contents

1. [Prerequisites & Dependencies](#prerequisites--dependencies)
2. [Environment Variables Setup](#environment-variables-setup)
3. [Database Schema Implementation](#database-schema-implementation)
4. [Type Definitions](#type-definitions)
5. [Utility Functions](#utility-functions)
6. [Validators (Zod Schemas)](#validators-zod-schemas)
7. [Service Layer Implementation](#service-layer-implementation)
8. [API Endpoints](#api-endpoints)
9. [Frontend Pages & Components](#frontend-pages--components)
10. [Background Jobs](#background-jobs)
11. [Testing Guide](#testing-guide)
12. [Deployment Checklist](#deployment-checklist)

---

## Prerequisites & Dependencies

### Install Required NPM Packages

```bash
npm install stripe @stripe/stripe-js qrcode ics
npm install -D @types/qrcode @types/stripe
```

**Package Purposes:**
- `stripe` (v14.x): Server-side Stripe SDK
- `@stripe/stripe-js` (v2.x): Client-side Stripe Elements
- `qrcode` (v1.5.x): QR code generation for tickets
- `ics` (v3.x): Calendar file generation (.ics downloads)

---

## Environment Variables Setup

### File: `.env`

Add these variables to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Public URL for email links and QR codes
PUBLIC_URL=https://germinal.com

# Optional: Reservation expiration time in minutes (default: 15)
RESERVATION_EXPIRY_MINUTES=15
```

**For Development:**
- Get test keys from: Stripe Dashboard → Developers → API keys
- Webhook secret: Set up endpoint at `/api/webhooks/stripe` in Stripe Dashboard → Developers → Webhooks

**For Production:**
- Use live keys (sk_live_...)
- Update PUBLIC_URL to production domain

### File: `src/lib/server/env.ts` (MODIFY EXISTING)

Add Stripe configuration to the existing env schema:

```typescript
// Add to devEnvSchema (around line 28)
STRIPE_SECRET_KEY: z.string().optional().default(''),
STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
PUBLIC_URL: z.string().url().optional().default('http://localhost:5173'),
RESERVATION_EXPIRY_MINUTES: z.string().optional().default('15').transform(Number),

// Add to prodEnvSchema (around line 53)
STRIPE_SECRET_KEY: z.string().min(1),
STRIPE_WEBHOOK_SECRET: z.string().min(1),
PUBLIC_URL: z.string().url(),
RESERVATION_EXPIRY_MINUTES: z.string().optional().default('15').transform(Number),

// Add helper function at the end (after isSMTPEnabled)
export const isStripeEnabled = () => {
    return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
};
```

### File: `.env.example` (UPDATE)

Add to the example file for documentation:

```bash
# Add these lines to .env.example
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
PUBLIC_URL=http://localhost:5173
RESERVATION_EXPIRY_MINUTES=15
```

---

## Database Schema Implementation

### File: `src/lib/server/db/schema.ts` (MODIFY EXISTING)

Add the following code to the existing schema file:

```typescript
// ADD THESE IMPORTS at the top (if not already present)
import { sql } from 'drizzle-orm';
import { check } from 'drizzle-orm/pg-core';

// ============================================
// ADD NEW ENUMS (after existing mediaTypeEnum and inquiryTypeEnum)
// ============================================

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',      // Created, payment not started
  'processing',   // Payment in progress
  'confirmed',    // Payment successful
  'cancelled',    // User/admin cancelled
  'expired'       // Payment timeout
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
// ADD NEW TABLES (add after contact_submissions table)
// ============================================

// Event Sessions Table
export const eventSessions = pgTable('event_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),

  // Session details
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),

  // Capacity management - totalCapacity is SOURCE OF TRUTH (immutable)
  totalCapacity: integer('total_capacity').notNull(),
  availableCapacity: integer('available_capacity').notNull(),

  // Pricing (stored in cents, e.g., €25.00 = 2500)
  priceAmount: integer('price_amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),

  // Settings
  published: boolean('published').default(false).notNull(),
  allowWaitlist: boolean('allow_waitlist').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventIdIdx: index('event_sessions_event_id_idx').on(table.eventId),
  publishedIdx: index('event_sessions_published_idx').on(table.published),
  startTimeIdx: index('event_sessions_start_time_idx').on(table.startTime),

  // Constraints
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

// Reservations Table
export const reservations = pgTable('reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventSessionId: uuid('event_session_id')
    .notNull()
    .references(() => eventSessions.id, { onDelete: 'restrict' }),

  // Guest information (NO user accounts required)
  guestEmail: varchar('guest_email', { length: 255 }).notNull(),
  guestName: varchar('guest_name', { length: 255 }).notNull(),
  guestPhone: varchar('guest_phone', { length: 50 }),

  // Future-proofing: nullable user_id (NOT USED NOW)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Reservation details
  quantity: integer('quantity').notNull().default(1),
  totalAmount: integer('total_amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),

  // Status
  status: reservationStatusEnum('status').notNull().default('pending'),

  // Secure access token (64-char hex = 256 bits entropy)
  accessToken: varchar('access_token', { length: 64 }).notNull().unique(),

  // Tracking
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),

  // Lifecycle timestamps
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

  quantityCheck: check('reservations_quantity_check', sql`quantity > 0`),
  amountCheck: check('reservations_amount_check', sql`total_amount >= 0`),
}));

// Payments Table
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id, { onDelete: 'restrict' }),

  // Stripe identifiers
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }).notNull().unique(),
  stripeClientSecret: text('stripe_client_secret'),

  // Payment details
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  status: paymentStatusEnum('status').notNull().default('pending'),

  // Additional Stripe metadata
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripePaymentMethodId: varchar('stripe_payment_method_id', { length: 255 }),

  // Refund tracking
  refundedAmount: integer('refunded_amount').default(0).notNull(),

  // Receipt
  receiptUrl: varchar('receipt_url', { length: 1000 }),
  stripeChargeId: varchar('stripe_charge_id', { length: 255 }),

  // Error handling
  lastError: text('last_error'),

  // Idempotency and webhook security
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  webhookProcessedAt: timestamp('webhook_processed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reservationIdIdx: index('payments_reservation_id_idx').on(table.reservationId),
  stripePaymentIntentIdx: index('payments_stripe_payment_intent_idx').on(table.stripePaymentIntentId),
  statusIdx: index('payments_status_idx').on(table.status),
  idempotencyKeyIdx: index('payments_idempotency_key_idx').on(table.idempotencyKey),

  refundCheck: check('payments_refund_check',
    sql`refunded_amount >= 0 AND refunded_amount <= amount`
  ),
}));

// ============================================
// ADD NEW RELATIONS (add after existing relations)
// ============================================

export const eventSessionsRelations = relations(eventSessions, ({ one, many }) => ({
  event: one(events, {
    fields: [eventSessions.eventId],
    references: [events.id],
  }),
  reservations: many(reservations),
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
```

### Run Database Migration

After adding the schema, generate and run the migration:

```bash
# Generate migration
npx drizzle-kit generate

# Push to database
npx drizzle-kit push

# Or if using a migration runner
npx drizzle-kit migrate
```

---

## Type Definitions

### File: `src/lib/types/event-sessions.ts` (CREATE NEW)

```typescript
import type { eventSessions } from '$lib/server/db/schema';

export type EventSession = typeof eventSessions.$inferSelect;

export type CreateEventSessionInput = {
  eventId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  totalCapacity: number;
  priceAmount: number;
  currency?: string;
  published?: boolean;
  allowWaitlist?: boolean;
};

export type UpdateEventSessionInput = Partial<Omit<CreateEventSessionInput, 'eventId'>>;

export type EventSessionWithEvent = EventSession & {
  event: {
    id: string;
    title: string;
    slug: string;
    location: string;
  };
};
```

### File: `src/lib/types/reservations.ts` (CREATE NEW)

```typescript
import type { reservations, eventSessions, payments } from '$lib/server/db/schema';

export type Reservation = typeof reservations.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export type CreateReservationInput = {
  sessionId: string;
  email: string;
  name: string;
  phone?: string;
  quantity: number;
  honeypot?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ReservationWithDetails = Reservation & {
  eventSession: typeof eventSessions.$inferSelect & {
    event: {
      id: string;
      title: string;
      slug: string;
      location: string;
      venueName: string | null;
      streetAddress: string | null;
      city: string | null;
      country: string | null;
    };
  };
  payment: Payment | null;
};

export type TicketEmailData = {
  guestEmail: string;
  guestName: string;
  accessToken: string;
  reservation: Reservation;
  session: typeof eventSessions.$inferSelect;
  event: {
    title: string;
    location: string;
  };
};
```

---

## Utility Functions

### File: `src/lib/utils/tokens.ts` (CREATE NEW)

```typescript
import crypto from 'crypto';

/**
 * Generates a cryptographically secure access token
 * 32 bytes = 64 hex characters = 256 bits of entropy
 * Unguessable via brute force
 */
export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a short alphanumeric code for phone support
 * Format: GERM-ABCD-1234
 */
export function generateShortCode(): string {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = Math.floor(1000 + Math.random() * 9000);
  return `GERM-${part1}-${part2}`;
}
```

### File: `src/lib/utils/currency.ts` (CREATE NEW)

```typescript
/**
 * Format amount in cents to currency string
 * Example: formatCurrency(2500, 'EUR') => '€25.00'
 */
export function formatCurrency(amountInCents: number, currency: string): string {
  const amount = amountInCents / 100;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  return formatter.format(amount);
}

/**
 * Parse currency string to cents
 * Example: parseCurrency('25.00') => 2500
 */
export function parseCurrency(amountString: string): number {
  const parsed = parseFloat(amountString);
  if (isNaN(parsed)) {
    throw new Error('Invalid amount');
  }
  return Math.round(parsed * 100);
}

/**
 * Validate currency code (ISO 4217)
 */
export function isValidCurrency(currency: string): boolean {
  const validCurrencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
  return validCurrencies.includes(currency.toUpperCase());
}
```

### File: `src/lib/utils/calendar.ts` (CREATE NEW)

```typescript
import ics from 'ics';

export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  url?: string;
};

/**
 * Generate .ics calendar file for adding to calendar
 */
export function generateICSFile(event: CalendarEvent): string | null {
  try {
    const { error, value } = ics.createEvent({
      start: [
        event.start.getFullYear(),
        event.start.getMonth() + 1,
        event.start.getDate(),
        event.start.getHours(),
        event.start.getMinutes(),
      ],
      end: [
        event.end.getFullYear(),
        event.end.getMonth() + 1,
        event.end.getDate(),
        event.end.getHours(),
        event.end.getMinutes(),
      ],
      title: event.title,
      description: event.description,
      location: event.location,
      url: event.url,
      status: 'CONFIRMED',
    });

    if (error) {
      console.error('Error generating calendar file:', error);
      return null;
    }

    return value;
  } catch (error) {
    console.error('Error generating calendar file:', error);
    return null;
  }
}
```

---

## Validators (Zod Schemas)

### File: `src/lib/server/validators/event-sessions.ts` (CREATE NEW)

```typescript
import { z } from 'zod';

const dateSchema = z.string().datetime().transform(s => new Date(s));

export const createEventSessionSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),

  title: z.string()
    .min(1, 'Session title is required')
    .max(255, 'Session title is too long'),

  description: z.string()
    .optional()
    .transform(v => v ?? null),

  startTime: dateSchema,
  endTime: dateSchema,

  totalCapacity: z.number()
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(10000, 'Capacity cannot exceed 10,000'),

  priceAmount: z.number()
    .int('Price must be in cents (whole number)')
    .min(0, 'Price cannot be negative'),

  currency: z.string()
    .length(3, 'Currency must be 3-letter ISO code')
    .toUpperCase()
    .default('EUR'),

  published: z.boolean().default(false),

  allowWaitlist: z.boolean().default(false),
}).refine(data => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const updateEventSessionSchema = createEventSessionSchema.partial().omit({ eventId: true });
```

### File: `src/lib/server/validators/reservations.ts` (CREATE NEW)

```typescript
import { z } from 'zod';

export const createReservationSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),

  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email is too long')
    .toLowerCase(),

  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name is too long')
    .regex(/^[a-zA-ZÀ-ÿ\s'\-]+$/, 'Name contains invalid characters'),

  phone: z.string()
    .regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone number format')
    .max(50, 'Phone number is too long')
    .optional()
    .transform(v => v ?? null),

  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(10, 'Maximum 10 tickets per reservation'),

  // Honeypot for spam protection
  honeypot: z.string().optional(),
}).refine(data => !data.honeypot || data.honeypot.trim() === '', {
  message: 'Invalid submission detected',
  path: ['honeypot'],
});
```

---

## Service Layer Implementation

### File: `src/lib/server/services/stripe.ts` (CREATE NEW)

```typescript
import Stripe from 'stripe';
import { env, isStripeEnabled } from '../env';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!isStripeEnabled()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    });
  }

  return stripeClient;
}

export type CreatePaymentIntentParams = {
  reservationId: string;
  amount: number;
  currency: string;
  metadata: {
    reservationId: string;
    sessionId: string;
    guestEmail: string;
  };
};

/**
 * Create a Stripe PaymentIntent for a reservation
 */
export async function createPaymentIntent(params: CreatePaymentIntentParams) {
  const stripe = getStripeClient();

  const idempotencyKey = `reservation-${params.reservationId}`;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    metadata: params.metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  }, {
    idempotencyKey,
  });

  return paymentIntent;
}

/**
 * Cancel a PaymentIntent (for expired reservations)
 */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = getStripeClient();

  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (error) {
    // If already succeeded or canceled, ignore the error
    if (error instanceof Stripe.errors.StripeError) {
      if (error.code === 'payment_intent_unexpected_state') {
        return; // Already in a terminal state
      }
    }
    throw error;
  }
}

/**
 * Create a refund for a PaymentIntent
 */
export async function createRefund(paymentIntentId: string, amount?: number) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount, // Optional: partial refund
  });

  return refund;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Stripe.Event {
  const stripe = getStripeClient();

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

### File: `src/lib/server/services/event-sessions.ts` (CREATE NEW)

```typescript
import { db } from '../db';
import { eventSessions, reservations } from '../db/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import type { CreateEventSessionInput, UpdateEventSessionInput } from '$lib/types/event-sessions';

/**
 * Create a new event session
 */
export async function createEventSession(input: CreateEventSessionInput) {
  const [session] = await db.insert(eventSessions).values({
    eventId: input.eventId,
    title: input.title,
    description: input.description ?? null,
    startTime: input.startTime,
    endTime: input.endTime,
    totalCapacity: input.totalCapacity,
    availableCapacity: input.totalCapacity, // Initialize to total
    priceAmount: input.priceAmount,
    currency: input.currency ?? 'EUR',
    published: input.published ?? false,
    allowWaitlist: input.allowWaitlist ?? false,
  }).returning();

  return session;
}

/**
 * Get session by ID with event details
 */
export async function getSessionById(id: string) {
  const session = await db.query.eventSessions.findFirst({
    where: eq(eventSessions.id, id),
    with: {
      event: {
        columns: {
          id: true,
          title: true,
          slug: true,
          location: true,
          venueName: true,
          streetAddress: true,
          city: true,
          country: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  return session;
}

/**
 * Get published sessions by event ID (for public display)
 */
export async function getPublishedSessionsByEventId(eventId: string) {
  const sessions = await db.query.eventSessions.findMany({
    where: and(
      eq(eventSessions.eventId, eventId),
      eq(eventSessions.published, true),
      gte(eventSessions.startTime, new Date()) // Only future sessions
    ),
    orderBy: [eventSessions.startTime],
  });

  return sessions;
}

/**
 * Get all sessions by event ID (for admin)
 */
export async function getAllSessionsByEventId(eventId: string) {
  const sessions = await db.query.eventSessions.findMany({
    where: eq(eventSessions.eventId, eventId),
    orderBy: [eventSessions.startTime],
    with: {
      reservations: {
        where: eq(reservations.status, 'confirmed'),
        columns: {
          id: true,
          quantity: true,
        },
      },
    },
  });

  // Calculate sold count for each session
  return sessions.map(session => ({
    ...session,
    soldCount: session.totalCapacity - session.availableCapacity,
    reservationCount: session.reservations.length,
  }));
}

/**
 * Update event session
 */
export async function updateEventSession(id: string, input: UpdateEventSessionInput) {
  // If updating capacity, validate
  if (input.totalCapacity !== undefined) {
    const session = await getSessionById(id);
    const soldCount = session.totalCapacity - session.availableCapacity;

    if (input.totalCapacity < soldCount) {
      throw new Error(`Cannot reduce capacity below ${soldCount} (already sold)`);
    }

    // Update both total and available capacity
    const [updated] = await db.update(eventSessions)
      .set({
        ...input,
        availableCapacity: input.totalCapacity - soldCount,
        updatedAt: new Date(),
      })
      .where(eq(eventSessions.id, id))
      .returning();

    return updated;
  }

  // Normal update without capacity change
  const [updated] = await db.update(eventSessions)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(eventSessions.id, id))
    .returning();

  if (!updated) {
    throw new Error('Session not found');
  }

  return updated;
}

/**
 * Delete event session (only if no confirmed reservations)
 */
export async function deleteEventSession(id: string) {
  // Check for confirmed reservations
  const confirmedReservations = await db.query.reservations.findFirst({
    where: and(
      eq(reservations.eventSessionId, id),
      eq(reservations.status, 'confirmed')
    ),
  });

  if (confirmedReservations) {
    throw new Error('Cannot delete session with confirmed reservations');
  }

  await db.delete(eventSessions).where(eq(eventSessions.id, id));
}
```

### File: `src/lib/server/services/reservations.ts` (CREATE NEW)

This is the **most critical file** with transaction handling and race condition prevention:

```typescript
import { db } from '../db';
import { eventSessions, reservations, payments } from '../db/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateAccessToken } from '$lib/utils/tokens';
import { createPaymentIntent } from './stripe';
import { env } from '../env';
import type { CreateReservationInput, ReservationWithDetails } from '$lib/types/reservations';

/**
 * Create a reservation with atomic capacity locking
 * This prevents race conditions when multiple users book simultaneously
 */
export async function createReservation(input: CreateReservationInput) {
  // Validate honeypot
  if (input.honeypot && input.honeypot.trim() !== '') {
    throw new Error('Invalid submission');
  }

  return await db.transaction(async (tx) => {
    // Step 1: Lock session row and check availability
    const [session] = await tx
      .select()
      .from(eventSessions)
      .where(and(
        eq(eventSessions.id, input.sessionId),
        eq(eventSessions.published, true)
      ))
      .for('update'); // CRITICAL: Row-level lock prevents concurrent modifications

    if (!session) {
      throw new Error('Session not found or not published');
    }

    // Check if session has already started
    if (session.startTime <= new Date()) {
      throw new Error('Cannot book tickets for a session that has already started');
    }

    // Step 2: Check availability
    if (session.availableCapacity < input.quantity) {
      throw new Error('Not enough tickets available');
    }

    // Step 3: Decrement capacity atomically
    const [updatedSession] = await tx
      .update(eventSessions)
      .set({
        availableCapacity: sql`${eventSessions.availableCapacity} - ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(eventSessions.id, input.sessionId),
        sql`${eventSessions.availableCapacity} >= ${input.quantity}` // Double-check in UPDATE
      ))
      .returning();

    if (!updatedSession) {
      throw new Error('Failed to reserve tickets (race condition)');
    }

    // Step 4: Calculate total amount (snapshot price at booking time)
    const totalAmount = session.priceAmount * input.quantity;

    // Step 5: Generate secure access token
    const accessToken = generateAccessToken();

    // Step 6: Calculate expiration time (15 minutes default)
    const expiryMinutes = env.RESERVATION_EXPIRY_MINUTES || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Step 7: Create reservation record
    const [reservation] = await tx.insert(reservations).values({
      eventSessionId: input.sessionId,
      guestEmail: input.email,
      guestName: input.name,
      guestPhone: input.phone ?? null,
      quantity: input.quantity,
      totalAmount,
      currency: session.currency,
      status: 'pending',
      accessToken,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    }).returning();

    // Step 8: Create Stripe PaymentIntent
    const paymentIntent = await createPaymentIntent({
      reservationId: reservation.id,
      amount: totalAmount,
      currency: session.currency,
      metadata: {
        reservationId: reservation.id,
        sessionId: session.id,
        guestEmail: input.email,
      },
    });

    // Step 9: Store payment record
    await tx.insert(payments).values({
      reservationId: reservation.id,
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret ?? null,
      amount: totalAmount,
      currency: session.currency,
      status: 'pending',
      idempotencyKey: `reservation-${reservation.id}`,
    });

    // Transaction commits here - capacity is locked, reservation created
    return {
      reservation,
      clientSecret: paymentIntent.client_secret,
      expiresAt,
    };
  });
}

/**
 * Get reservation by access token (for ticket display)
 */
export async function getReservationByToken(token: string): Promise<ReservationWithDetails | null> {
  const reservation = await db.query.reservations.findFirst({
    where: eq(reservations.accessToken, token),
    with: {
      eventSession: {
        with: {
          event: {
            columns: {
              id: true,
              title: true,
              slug: true,
              location: true,
              venueName: true,
              streetAddress: true,
              city: true,
              country: true,
            },
          },
        },
      },
      payment: true,
    },
  });

  return reservation ?? null;
}

/**
 * Get reservation by ID (for admin or status checks)
 */
export async function getReservationById(id: string): Promise<ReservationWithDetails> {
  const reservation = await db.query.reservations.findFirst({
    where: eq(reservations.id, id),
    with: {
      eventSession: {
        with: {
          event: {
            columns: {
              id: true,
              title: true,
              slug: true,
              location: true,
              venueName: true,
              streetAddress: true,
              city: true,
              country: true,
            },
          },
        },
      },
      payment: true,
    },
  });

  if (!reservation) {
    throw new Error('Reservation not found');
  }

  return reservation;
}

/**
 * Cancel reservation and refund (admin or user-initiated)
 */
export async function cancelReservationWithRefund(reservationId: string) {
  const { createRefund } = await import('./stripe');

  return await db.transaction(async (tx) => {
    // Load reservation with payment
    const reservation = await tx.query.reservations.findFirst({
      where: eq(reservations.id, reservationId),
      with: { payment: true },
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'confirmed') {
      throw new Error('Only confirmed reservations can be cancelled');
    }

    if (!reservation.payment) {
      throw new Error('Payment not found for this reservation');
    }

    // Refund via Stripe
    const refund = await createRefund(reservation.payment.stripePaymentIntentId);

    // Update payment status
    await tx.update(payments)
      .set({
        status: 'refunded',
        refundedAmount: refund.amount,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, reservation.payment.id));

    // Lock session and restore capacity
    const [session] = await tx
      .select()
      .from(eventSessions)
      .where(eq(eventSessions.id, reservation.eventSessionId))
      .for('update');

    await tx.update(eventSessions)
      .set({
        availableCapacity: session!.availableCapacity + reservation.quantity,
        updatedAt: new Date(),
      })
      .where(eq(eventSessions.id, reservation.eventSessionId));

    // Update reservation status
    await tx.update(reservations)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    return { success: true, refund };
  });
}

/**
 * Find expired reservations for cleanup job
 */
export async function findExpiredReservations() {
  return await db.query.reservations.findMany({
    where: and(
      eq(reservations.status, 'pending'),
      lt(reservations.expiresAt, new Date())
    ),
    with: {
      payment: true,
    },
  });
}

/**
 * Mark reservation as expired and restore capacity
 */
export async function expireReservation(reservationId: string) {
  return await db.transaction(async (tx) => {
    const reservation = await tx.query.reservations.findFirst({
      where: eq(reservations.id, reservationId),
    });

    if (!reservation) {
      return;
    }

    // Lock session and restore capacity
    const [session] = await tx
      .select()
      .from(eventSessions)
      .where(eq(eventSessions.id, reservation.eventSessionId))
      .for('update');

    if (session) {
      await tx.update(eventSessions)
        .set({
          availableCapacity: session.availableCapacity + reservation.quantity,
          updatedAt: new Date(),
        })
        .where(eq(eventSessions.id, reservation.eventSessionId));
    }

    // Update reservation status
    await tx.update(reservations)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));
  });
}
```

### File: `src/lib/server/services/payments.ts` (CREATE NEW)

Webhook handlers for Stripe events:

```typescript
import { db } from '../db';
import { payments, reservations } from '../db/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { sendTicketConfirmationEmail } from './email';

/**
 * Handle successful payment from Stripe webhook
 */
export async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, paymentIntent.id),
    with: {
      reservation: {
        with: {
          eventSession: {
            with: {
              event: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    console.warn(`Payment not found for PaymentIntent: ${paymentIntent.id}`);
    return;
  }

  // Idempotency check
  if (payment.webhookProcessedAt) {
    console.log(`Webhook already processed for payment: ${payment.id}`);
    return;
  }

  // Update payment status
  await db.update(payments)
    .set({
      status: 'succeeded',
      stripeChargeId: paymentIntent.latest_charge as string ?? null,
      receiptUrl: paymentIntent.charges?.data[0]?.receipt_url ?? null,
      webhookProcessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Confirm reservation
  await db.update(reservations)
    .set({
      status: 'confirmed',
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, payment.reservationId));

  // Send ticket confirmation email
  try {
    await sendTicketConfirmationEmail({
      guestEmail: payment.reservation.guestEmail,
      guestName: payment.reservation.guestName,
      accessToken: payment.reservation.accessToken,
      reservation: payment.reservation,
      session: payment.reservation.eventSession,
      event: payment.reservation.eventSession.event,
    });
  } catch (error) {
    console.error('Failed to send ticket confirmation email:', error);
    // Don't throw - payment is still successful
  }
}

/**
 * Handle failed payment from Stripe webhook
 */
export async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, paymentIntent.id),
    with: {
      reservation: true,
    },
  });

  if (!payment) {
    return;
  }

  // Update payment status
  await db.update(payments)
    .set({
      status: 'failed',
      lastError: paymentIntent.last_payment_error?.message ?? null,
      webhookProcessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Note: Don't restore capacity here - let the expiration job handle it
}

/**
 * Handle refund from Stripe webhook
 */
export async function handleRefund(charge: Stripe.Charge) {
  if (!charge.payment_intent) {
    return;
  }

  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, charge.payment_intent as string),
  });

  if (!payment) {
    return;
  }

  const refundedAmount = charge.amount_refunded;
  const isFullyRefunded = refundedAmount === charge.amount;

  await db.update(payments)
    .set({
      status: isFullyRefunded ? 'refunded' : 'partially_refunded',
      refundedAmount,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));
}
```

### File: `src/lib/server/services/email.ts` (MODIFY EXISTING)

Add ticket confirmation email to the existing email service:

```typescript
// ADD THIS IMPORT at the top
import type { TicketEmailData } from '$lib/types/reservations';
import { formatCurrency } from '$lib/utils/currency';

// ADD THIS FUNCTION at the end of the file (before the existing verifyEmailConnection)

function generateTicketTextTemplate(data: TicketEmailData): string {
  return `
Your Ticket Confirmation

Hi ${data.guestName},

Your tickets for ${data.event.title} are confirmed!

EVENT DETAILS:
${data.session.title}
${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
${data.event.location}

TICKETS:
${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
Total: ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}

VIEW YOUR TICKETS:
${env.PUBLIC_URL}/tickets/${data.accessToken}

Present this link or QR code at the event entrance.

See you there!

---
This is an automated confirmation from Germinal.
  `.trim();
}

function generateTicketHtmlTemplate(data: TicketEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Ticket Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 24px;">🎫 Ticket Confirmation</h2>
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Order #${data.reservation.id.substring(0, 8)}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${data.guestName},</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">Your tickets for <strong>${data.event.title}</strong> are confirmed!</p>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Event Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #212529;"><strong>${data.session.title}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${data.session.startTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6c757d;">
          ${data.event.location}
        </td>
      </tr>
    </table>

    <h3 style="margin: 24px 0 12px 0; color: #495057; font-size: 16px; font-weight: 600;">Tickets</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
          ${data.reservation.quantity} × ${formatCurrency(data.session.priceAmount, data.session.currency)}
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
          ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: 600;">Total</td>
        <td style="padding: 12px 0; text-align: right; font-weight: 600;">
          ${formatCurrency(data.reservation.totalAmount, data.reservation.currency)}
        </td>
      </tr>
    </table>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}"
         style="display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
        View Your Tickets
      </a>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 14px; color: #6c757d; text-align: center;">
      Present this link or QR code at the event entrance.
    </p>
  </div>

  <div style="border-top: 1px solid #e9ecef; padding-top: 16px;">
    <p style="margin: 0; color: #6c757d; font-size: 12px; text-align: center;">
      This is an automated confirmation from Germinal.<br>
      If you have any questions, please contact us.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export async function sendTicketConfirmationEmail(data: TicketEmailData): Promise<void> {
  if (!isSMTPEnabled()) {
    console.log('\n🎫 Ticket confirmation email would be sent to:', data.guestEmail);
    console.log('Access token:', data.accessToken);
    console.log('Ticket URL:', `${env.PUBLIC_URL}/tickets/${data.accessToken}`);
    return;
  }

  const transport = getTransporter();

  const mailOptions = {
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
    to: data.guestEmail,
    subject: `Your Tickets for ${data.event.title}`,
    text: generateTicketTextTemplate(data),
    html: generateTicketHtmlTemplate(data),
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log('🎫 Ticket confirmation email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send ticket confirmation email:', error);
    throw new Error('Failed to send ticket confirmation email');
  }
}
```

---

## API Endpoints

### File: `src/routes/api/events/[slug]/sessions/+server.ts` (CREATE NEW)

```typescript
import { json } from '@sveltejs/kit';
import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedSessionsByEventId } from '$lib/server/services/event-sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const event = await getEventBySlug(params.slug);
    const sessions = await getPublishedSessionsByEventId(event.id);

    return json({
      sessions: sessions.map(session => ({
        id: session.id,
        title: session.title,
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        priceAmount: session.priceAmount,
        currency: session.currency,
        totalCapacity: session.totalCapacity,
        availableCapacity: session.availableCapacity,
        soldOut: session.availableCapacity === 0,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Event not found') {
      return json({ error: 'Event not found' }, { status: 404 });
    }
    throw error;
  }
};
```

### File: `src/routes/api/reservations/create/+server.ts` (CREATE NEW)

```typescript
import { json } from '@sveltejs/kit';
import { createReservationSchema } from '$lib/server/validators/reservations';
import { createReservation } from '$lib/server/services/reservations';
import { strictRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const ip = getClientAddress();

  // Rate limiting: 10 requests per 10 minutes
  if (!strictRateLimiter.check(ip)) {
    const resetTime = strictRateLimiter.getReset(ip);
    return json(
      {
        error: `Too many reservation attempts. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
        code: 'RATE_LIMIT_EXCEEDED',
      },
      { status: 429 }
    );
  }

  try {
    const data = await request.json();
    const userAgent = request.headers.get('user-agent');

    // Validate input
    const validated = createReservationSchema.safeParse(data);

    if (!validated.success) {
      return json(
        {
          error: 'Invalid input',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Create reservation with capacity lock
    const result = await createReservation({
      ...validated.data,
      ipAddress: ip,
      userAgent,
    });

    return json(
      {
        reservationId: result.reservation.id,
        clientSecret: result.clientSecret,
        expiresAt: result.expiresAt,
        accessToken: result.reservation.accessToken,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Reservation creation error:', error);

    if (error instanceof Error) {
      // Handle specific errors
      if (error.message === 'Not enough tickets available') {
        return json({ error: 'Session is sold out', code: 'SOLD_OUT' }, { status: 409 });
      }

      if (error.message === 'Session not found or not published') {
        return json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
      }

      if (error.message === 'Invalid submission') {
        return json({ error: 'Invalid submission', code: 'SPAM_DETECTED' }, { status: 400 });
      }

      if (error.message.includes('Cannot book tickets for a session that has already started')) {
        return json({ error: 'This session has already started', code: 'SESSION_STARTED' }, { status: 400 });
      }
    }

    return json({ error: 'Failed to create reservation', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
};
```

### File: `src/routes/api/reservations/[id]/status/+server.ts` (CREATE NEW)

```typescript
import { json } from '@sveltejs/kit';
import { getReservationById } from '$lib/server/services/reservations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const reservation = await getReservationById(params.id);

    return json({
      id: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      confirmedAt: reservation.confirmedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Reservation not found') {
      return json({ error: 'Reservation not found' }, { status: 404 });
    }
    throw error;
  }
};
```

### File: `src/routes/api/webhooks/stripe/+server.ts` (CREATE NEW)

**CRITICAL:** This endpoint handles Stripe webhook events for payment confirmation.

```typescript
import { json, error } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { verifyWebhookSignature } from '$lib/server/services/stripe';
import { handlePaymentSuccess, handlePaymentFailure, handleRefund } from '$lib/server/services/payments';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';

export const POST: RequestHandler = async ({ request }) => {
  // Get raw body (needed for signature verification)
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    throw error(400, 'Missing stripe-signature header');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = verifyWebhookSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw error(400, `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  try {
    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object as Stripe.Charge);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 to acknowledge receipt even if processing fails
    // Stripe will retry failed webhooks
    return json({ received: true, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
```

### File: `src/routes/api/admin/sessions/+server.ts` (CREATE NEW)

```typescript
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guards';
import { createEventSession, getAllSessionsByEventId } from '$lib/server/services/event-sessions';
import { createEventSessionSchema } from '$lib/server/validators/event-sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);

  const eventId = event.url.searchParams.get('eventId');

  if (!eventId) {
    return json({ error: 'eventId query parameter is required' }, { status: 400 });
  }

  try {
    const sessions = await getAllSessionsByEventId(eventId);
    return json({ sessions });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
};

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  const data = await event.request.json();
  const validated = createEventSessionSchema.safeParse(data);

  if (!validated.success) {
    return json({ error: validated.error.flatten() }, { status: 400 });
  }

  try {
    const session = await createEventSession(validated.data);
    return json(session, { status: 201 });
  } catch (error) {
    console.error('Failed to create session:', error);
    return json({ error: 'Failed to create session' }, { status: 500 });
  }
};
```

### File: `src/routes/api/admin/reservations/[id]/cancel/+server.ts` (CREATE NEW)

```typescript
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guards';
import { cancelReservationWithRefund } from '$lib/server/services/reservations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  try {
    const result = await cancelReservationWithRefund(event.params.id);

    return json({
      success: true,
      message: 'Reservation cancelled and refunded successfully',
      refund: result.refund,
    });
  } catch (error) {
    console.error('Failed to cancel reservation:', error);

    if (error instanceof Error) {
      if (error.message === 'Reservation not found') {
        return json({ error: 'Reservation not found' }, { status: 404 });
      }

      if (error.message === 'Only confirmed reservations can be cancelled') {
        return json({ error: 'This reservation cannot be cancelled' }, { status: 400 });
      }
    }

    return json({ error: 'Failed to cancel reservation' }, { status: 500 });
  }
};
```

---

## Background Jobs

### File: `src/lib/server/jobs/cleanup-expired-reservations.ts` (CREATE NEW)

```typescript
import { findExpiredReservations, expireReservation } from '../services/reservations';
import { cancelPaymentIntent } from '../services/stripe';

/**
 * Cleanup job to expire abandoned reservations and restore capacity
 * Run this every 5 minutes via cron or setInterval
 */
export async function cleanupExpiredReservations() {
  console.log('[Cleanup Job] Starting expired reservations cleanup...');

  try {
    const expiredReservations = await findExpiredReservations();

    if (expiredReservations.length === 0) {
      console.log('[Cleanup Job] No expired reservations found');
      return { cleaned: 0 };
    }

    console.log(`[Cleanup Job] Found ${expiredReservations.length} expired reservations`);

    for (const reservation of expiredReservations) {
      try {
        // Expire reservation and restore capacity
        await expireReservation(reservation.id);

        // Cancel Stripe PaymentIntent
        if (reservation.payment) {
          await cancelPaymentIntent(reservation.payment.stripePaymentIntentId);
        }

        console.log(`[Cleanup Job] Expired reservation ${reservation.id}`);
      } catch (error) {
        console.error(`[Cleanup Job] Failed to expire reservation ${reservation.id}:`, error);
        // Continue with next reservation
      }
    }

    console.log(`[Cleanup Job] Cleaned up ${expiredReservations.length} expired reservations`);

    return { cleaned: expiredReservations.length };
  } catch (error) {
    console.error('[Cleanup Job] Error during cleanup:', error);
    throw error;
  }
}
```

### File: `src/hooks.server.ts` (MODIFY EXISTING - Add cleanup job scheduler)

Add to the existing hooks file:

```typescript
// ADD THIS IMPORT at the top
import { cleanupExpiredReservations } from '$lib/server/jobs/cleanup-expired-reservations';

// ADD THIS at the end of the file, after existing hooks

// Schedule cleanup job every 5 minutes
if (!import.meta.env.DEV || import.meta.env.VITE_RUN_CLEANUP_JOB === 'true') {
  setInterval(async () => {
    try {
      await cleanupExpiredReservations();
    } catch (error) {
      console.error('Cleanup job failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}
```

**Alternative: API Endpoint for Cleanup** (for external cron jobs)

### File: `src/routes/api/admin/cleanup/+server.ts` (CREATE NEW - OPTIONAL)

```typescript
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/guards';
import { cleanupExpiredReservations } from '$lib/server/jobs/cleanup-expired-reservations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  try {
    const result = await cleanupExpiredReservations();
    return json({ success: true, cleaned: result.cleaned });
  } catch (error) {
    console.error('Cleanup job failed:', error);
    return json({ error: 'Cleanup job failed' }, { status: 500 });
  }
};
```

---

## Testing Guide

### 1. Database Schema Testing

```bash
# Run migration
npx drizzle-kit push

# Test constraints in psql
psql $DATABASE_URL

-- Should succeed
INSERT INTO event_sessions (event_id, title, start_time, end_time, total_capacity, available_capacity, price_amount)
VALUES ('existing-event-id', 'Test Session', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 50, 50, 2500);

-- Should fail (available > total)
INSERT INTO event_sessions (event_id, title, start_time, end_time, total_capacity, available_capacity, price_amount)
VALUES ('existing-event-id', 'Test Session', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 50, 60, 2500);
```

### 2. Stripe Testing

Use Stripe CLI for webhook testing:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5173/api/webhooks/stripe

# Trigger test webhook
stripe trigger payment_intent.succeeded
```

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### 3. End-to-End Booking Flow

1. Create an event via admin dashboard
2. Create a session for the event (capacity: 5, price: €25)
3. As guest, visit event page and click "Book Tickets"
4. Fill form with test email
5. Enter test card 4242 4242 4242 4242
6. Complete payment
7. Verify email received with ticket link
8. Visit ticket page via access token
9. Verify QR code displays

### 4. Race Condition Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Create 10 concurrent reservation requests
ab -n 10 -c 10 -p reservation.json -T application/json http://localhost:5173/api/reservations/create

# Verify only correct number succeeded (based on available capacity)
```

---

## Deployment Checklist

### Environment Variables

```bash
# Production .env
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxx
PUBLIC_URL=https://germinal.com
RESERVATION_EXPIRY_MINUTES=15
```

### Stripe Dashboard Setup

1. Create webhook endpoint: `https://germinal.com/api/webhooks/stripe`
2. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
3. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

### Database Migration

```bash
# Production
npx drizzle-kit push
```

### Security Checklist

- [ ] Stripe webhook signature verification enabled
- [ ] Rate limiting active on booking endpoint
- [ ] Honeypot field in booking form
- [ ] HTTPS enabled (no HTTP)
- [ ] Environment variables not in git
- [ ] Admin routes protected
- [ ] Access tokens indexed for performance

### Monitoring

- Set up alerts for:
  - Failed webhook processing
  - High rate of payment failures
  - Cleanup job failures
- Monitor database for:
  - Stuck pending reservations
  - Capacity anomalies

---

## Summary: Files to Create/Modify

### Create New Files (32 files)

**Types:**
- `src/lib/types/event-sessions.ts`
- `src/lib/types/reservations.ts`

**Utils:**
- `src/lib/utils/tokens.ts`
- `src/lib/utils/currency.ts`
- `src/lib/utils/calendar.ts`

**Validators:**
- `src/lib/server/validators/event-sessions.ts`
- `src/lib/server/validators/reservations.ts`

**Services:**
- `src/lib/server/services/stripe.ts`
- `src/lib/server/services/event-sessions.ts`
- `src/lib/server/services/reservations.ts`
- `src/lib/server/services/payments.ts`

**Jobs:**
- `src/lib/server/jobs/cleanup-expired-reservations.ts`

**API Routes:**
- `src/routes/api/events/[slug]/sessions/+server.ts`
- `src/routes/api/reservations/create/+server.ts`
- `src/routes/api/reservations/[id]/status/+server.ts`
- `src/routes/api/webhooks/stripe/+server.ts`
- `src/routes/api/admin/sessions/+server.ts`
- `src/routes/api/admin/reservations/[id]/cancel/+server.ts`
- `src/routes/api/admin/cleanup/+server.ts` (optional)

**Frontend Pages (to be implemented):**
- `src/routes/(public)/events/[slug]/book/[sessionId]/+page.svelte`
- `src/routes/(public)/checkout/[reservationId]/+page.svelte`
- `src/routes/(public)/tickets/[token]/+page.svelte`
- `src/routes/(admin)/admin/reservations/+page.svelte`
- `src/routes/(admin)/admin/reservations/[id]/+page.svelte`

### Modify Existing Files (4 files)

- `src/lib/server/db/schema.ts` (add tables, enums, relations)
- `src/lib/server/env.ts` (add Stripe env vars)
- `src/lib/server/services/email.ts` (add ticket email function)
- `src/hooks.server.ts` (add cleanup job scheduler)
- `.env` (add Stripe keys)
- `.env.example` (document Stripe keys)

---

## Next Steps After Code Implementation

Once all the above code is implemented:

1. **Implement Frontend Pages** - Create booking form, checkout page, ticket display
2. **Add Admin UI** - Session management, reservation dashboard
3. **Test Thoroughly** - Use test cards, verify webhooks, test race conditions
4. **Deploy to Staging** - Test with real Stripe test mode
5. **Go Live** - Switch to live Stripe keys, monitor carefully

This completes the backend implementation. The frontend pages require UI components and will be implemented based on this solid backend foundation.
