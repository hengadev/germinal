# Event Reservation System - Implementation Plan

**Version:** 1.0
**Date:** 2026-01-11
**Status:** Review Ready

---

## Executive Summary

This document outlines improvements needed for the event reservation and ticketing system. Issues are categorized by priority and impact. The plan addresses critical security vulnerabilities, race conditions in payment handling, and production readiness concerns.

---

## Priority Legend

- **P0 (Critical)**: Must fix before production deployment - security or data integrity risks
- **P1 (High)**: Should fix soon - affects reliability or user experience
- **P2 (Medium)**: Important for production quality
- **P3 (Low)**: Nice-to-have improvements

---

## Implementation Roadmap

### Phase 1: Critical Security & Data Integrity (P0)

#### 1.1 Fix Payment Intent Cleanup on Transaction Failure (P0)

**Issue:** If database transaction fails after creating a Stripe PaymentIntent, the PaymentIntent remains orphaned in Stripe without a corresponding reservation record.

**Location:** `src/lib/server/services/reservations.ts:88-97`

**Steps:**
1. Wrap PaymentIntent creation in try-catch block within transaction
2. If transaction fails after PaymentIntent creation, cancel it
3. Store PaymentIntent ID in a variable before database operations
4. Add error recovery logic to handle cancellation failures

**Implementation:**
```typescript
// In createReservation function
let paymentIntentId: string | null = null;

try {
  return await db.transaction(async (tx) => {
    // ... existing capacity locking code ...

    // Create Stripe PaymentIntent
    const paymentIntent = await createPaymentIntent({...});
    paymentIntentId = paymentIntent.id;

    // Store payment record
    await tx.insert(payments).values({...});

    return { reservation, clientSecret, expiresAt };
  });
} catch (error) {
  // Transaction failed - clean up orphaned PaymentIntent
  if (paymentIntentId) {
    try {
      await cancelPaymentIntent(paymentIntentId);
      console.log(`Cleaned up PaymentIntent ${paymentIntentId} after transaction failure`);
    } catch (cancelError) {
      console.error(`Failed to cancel orphaned PaymentIntent ${paymentIntentId}:`, cancelError);
      // Log to monitoring system for manual cleanup
    }
  }
  throw error;
}
```

**Testing:**
- Simulate database failures after PaymentIntent creation
- Verify PaymentIntent is cancelled in Stripe
- Verify capacity is not decremented
- Check for any orphaned PaymentIntents in Stripe dashboard

---

#### 1.2 Sanitize Email Template User Input (P0)

**Issue:** User input is inserted into HTML email templates without sanitization, creating XSS and HTML injection risks.

**Location:** `src/lib/server/services/email.ts:114`

**Steps:**
1. Install HTML sanitization library: `pnpm add dompurify` (or similar)
2. Create utility function for HTML escaping
3. Sanitize all user inputs before inserting into HTML templates
4. Apply to both contact form and ticket confirmation emails

**Implementation:**
```typescript
// src/lib/utils/html.ts (new file)
/**
 * Escape HTML special characters to prevent injection
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

**Then update email templates:**
```typescript
// In generateHtmlTemplate
<p style="...white-space: pre-wrap;">${escapeHtml(data.message)}</p>
<td style="...">${escapeHtml(data.name)}</td>
<td style="...">${escapeHtml(data.company || '')}</td>
```

**Testing:**
- Test with malicious inputs: `<script>alert('xss')</script>`
- Test with HTML entities: `<b>test</b>`, `&nbsp;`
- Verify emails render correctly in multiple email clients
- Ensure legitimate special characters (é, ñ, etc.) display properly

---

### Phase 2: High-Priority Reliability Improvements (P1)

#### 2.1 Restore Capacity Immediately on Payment Failure (P1)

**Issue:** When payment fails, capacity remains locked until cleanup job runs (up to 5 minutes delay).

**Location:** `src/lib/server/services/payments.ts:76-99`

**Steps:**
1. Update `handlePaymentFailure` to restore capacity immediately
2. Add transaction to ensure atomic capacity restoration
3. Update reservation status to 'expired' (not just failed payment)
4. Add logging for monitoring

**Implementation:**
```typescript
export async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, paymentIntent.id),
    with: { reservation: true },
  });

  if (!payment) {
    return;
  }

  await db.transaction(async (tx) => {
    // Update payment status
    await tx.update(payments)
      .set({
        status: 'failed',
        lastError: paymentIntent.last_payment_error?.message ?? null,
        webhookProcessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    // Expire reservation immediately
    await tx.update(reservations)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, payment.reservationId));

    // Restore capacity
    const [session] = await tx
      .select()
      .from(eventSessions)
      .where(eq(eventSessions.id, payment.reservation.eventSessionId))
      .for('update');

    if (session) {
      await tx.update(eventSessions)
        .set({
          availableCapacity: session.availableCapacity + payment.reservation.quantity,
          updatedAt: new Date(),
        })
        .where(eq(eventSessions.id, payment.reservation.eventSessionId));
    }

    console.log(`[Payment Failure] Restored ${payment.reservation.quantity} tickets for reservation ${payment.reservationId}`);
  });
}
```

**Testing:**
- Trigger payment failure using Stripe test card (4000 0000 0000 0002)
- Verify capacity is restored immediately
- Verify reservation status changes to 'expired'
- Check cleanup job doesn't double-restore capacity

---

#### 2.2 Implement Email Queue with Retry Logic (P1)

**Issue:** Failed ticket confirmation emails have no retry mechanism. Users get charged but receive no ticket.

**Steps:**
1. Create email queue table in database
2. Store email attempts with retry count
3. Create background job to process failed emails
4. Add exponential backoff for retries
5. Add admin interface to view failed emails

**Implementation:**

**Database Schema Addition:**
```typescript
// Add to src/lib/server/db/schema.ts
export const emailQueue = pgTable('email_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 50 }).notNull(), // 'ticket_confirmation', 'contact_notification'
  recipient: varchar('recipient', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
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
```

**Email Service Update:**
```typescript
// src/lib/server/services/email.ts
export async function queueTicketConfirmationEmail(data: TicketEmailData): Promise<void> {
  const textBody = generateTicketTextTemplate(data);
  const htmlBody = generateTicketHtmlTemplate(data);

  await db.insert(emailQueue).values({
    type: 'ticket_confirmation',
    recipient: data.guestEmail,
    subject: `Your Tickets for ${data.event.title}`,
    textBody,
    htmlBody,
    metadata: JSON.stringify({
      reservationId: data.reservation.id,
      accessToken: data.accessToken,
    }),
  });
}

// Immediate send with fallback to queue
export async function sendTicketConfirmationEmail(data: TicketEmailData): Promise<void> {
  try {
    if (!isSMTPEnabled()) {
      console.log('🎫 Ticket confirmation email would be sent to:', data.guestEmail);
      return;
    }

    const transport = getTransporter();
    const mailOptions = { /* ... */ };
    await transport.sendMail(mailOptions);
    console.log('🎫 Ticket confirmation email sent successfully');
  } catch (error) {
    console.error('❌ Failed to send ticket confirmation email:', error);
    // Queue for retry instead of throwing
    await queueTicketConfirmationEmail(data);
    console.log('📋 Email queued for retry');
  }
}
```

**Background Job:**
```typescript
// src/lib/server/jobs/process-email-queue.ts
export async function processEmailQueue() {
  const pendingEmails = await db.query.emailQueue.findMany({
    where: and(
      eq(emailQueue.status, 'pending'),
      sql`attempts < max_attempts`,
      or(
        sql`last_attempt_at IS NULL`,
        sql`last_attempt_at < NOW() - INTERVAL '5 minutes' * POWER(2, attempts)` // Exponential backoff
      )
    ),
    limit: 10,
  });

  for (const email of pendingEmails) {
    try {
      const transport = getTransporter();
      await transport.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
        to: email.recipient,
        subject: email.subject,
        text: email.textBody,
        html: email.htmlBody,
      });

      await db.update(emailQueue)
        .set({
          status: 'sent',
          sentAt: new Date(),
          lastAttemptAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id));

      console.log(`✅ Email sent successfully: ${email.id}`);
    } catch (error) {
      const newAttempts = email.attempts + 1;
      const newStatus = newAttempts >= email.maxAttempts ? 'failed' : 'pending';

      await db.update(emailQueue)
        .set({
          attempts: newAttempts,
          status: newStatus,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          lastAttemptAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id));

      console.error(`❌ Email send failed (attempt ${newAttempts}):`, email.id, error);
    }
  }
}
```

**Add to hooks.server.ts:**
```typescript
// Run email queue processor every 2 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    processEmailQueue()
      .then((result) => {
        // Log result
      })
      .catch((error) => {
        console.error('[Email Queue] Error:', error);
      });
  }, 2 * 60 * 1000);
}
```

**Testing:**
- Disable SMTP and verify emails are queued
- Re-enable SMTP and verify queued emails are sent
- Test exponential backoff timing
- Verify max attempts stops retrying
- Test admin interface to view failed emails

---

#### 2.3 Implement Transaction Timeout Protection (P1)

**Issue:** Long-running transactions with FOR UPDATE locks can block other users indefinitely.

**Steps:**
1. Set statement timeout at connection level
2. Add timeout to individual critical transactions
3. Handle timeout errors gracefully

**Implementation:**
```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Set statement timeout to 10 seconds for all queries
  prepare: false,
  onnotice: () => {}, // Suppress notices
  types: {
    // Custom type parsers if needed
  },
});

// Execute initial setup
await queryClient`SET statement_timeout = '10s'`;

export const db = drizzle(queryClient, { schema });
```

**Or per-transaction:**
```typescript
// In critical transaction operations
return await db.transaction(async (tx) => {
  // Set timeout for this transaction
  await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);

  // ... rest of transaction code ...
});
```

**Testing:**
- Simulate slow queries (use pg_sleep)
- Verify timeout errors are caught and handled
- Test concurrent reservations don't timeout normal operations

---

### Phase 3: Production Infrastructure (P2)

#### 3.1 Replace setInterval with Proper Job Scheduler (P2)

**Issue:** Background jobs in server hooks don't scale with multiple instances and aren't crash-resistant.

**Options:**
1. **pg-boss** (recommended for this stack): Uses PostgreSQL for job queue
2. **BullMQ**: Redis-based, more features but requires Redis
3. **Separate cron process**: Simple but requires deployment changes

**Recommendation:** Use pg-boss (PostgreSQL-based, no new infrastructure)

**Steps:**
1. Install pg-boss: `pnpm add pg-boss`
2. Create job scheduler service
3. Replace setInterval calls with scheduled jobs
4. Add monitoring for job failures

**Implementation:**
```typescript
// src/lib/server/jobs/scheduler.ts
import PgBoss from 'pg-boss';
import { env } from '../env';
import { cleanupExpiredReservations } from './cleanup-expired-reservations';
import { processEmailQueue } from './process-email-queue';
import { deleteExpiredSessions } from '../session';

let boss: PgBoss | null = null;

export async function initJobScheduler() {
  if (boss) {
    console.log('⚠️  Job scheduler already initialized');
    return boss;
  }

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss', // Separate schema for job tables
    retryLimit: 3,
    retryDelay: 60, // 1 minute
    expireInHours: 24,
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // 7 days
  });

  boss.on('error', (error) => {
    console.error('[Job Scheduler] Error:', error);
  });

  await boss.start();
  console.log('✅ Job scheduler started');

  // Register job handlers
  await boss.work('cleanup-expired-reservations', { teamSize: 1 }, async () => {
    console.log('[Job] Running cleanup-expired-reservations');
    const result = await cleanupExpiredReservations();
    return { cleaned: result.cleaned };
  });

  await boss.work('cleanup-expired-sessions', { teamSize: 1 }, async () => {
    console.log('[Job] Running cleanup-expired-sessions');
    const deleted = await deleteExpiredSessions();
    return { deleted };
  });

  await boss.work('process-email-queue', { teamSize: 2 }, async () => {
    console.log('[Job] Running process-email-queue');
    await processEmailQueue();
    return { processed: true };
  });

  // Schedule recurring jobs
  await boss.schedule('cleanup-expired-reservations', '*/5 * * * *'); // Every 5 minutes
  await boss.schedule('cleanup-expired-sessions', '0 * * * *'); // Every hour
  await boss.schedule('process-email-queue', '*/2 * * * *'); // Every 2 minutes

  console.log('✅ Jobs scheduled');

  return boss;
}

export async function stopJobScheduler() {
  if (boss) {
    await boss.stop();
    boss = null;
    console.log('✅ Job scheduler stopped');
  }
}
```

**Update hooks.server.ts:**
```typescript
// src/hooks.server.ts
import { initJobScheduler, stopJobScheduler } from '$lib/server/jobs/scheduler';

// Initialize job scheduler on startup
if (typeof setInterval !== 'undefined') {
  initJobScheduler().catch((error) => {
    console.error('[Job Scheduler] Failed to initialize:', error);
  });
}

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await stopJobScheduler();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await stopJobScheduler();
    process.exit(0);
  });
}
```

**Testing:**
- Deploy multiple server instances
- Verify jobs run only once (not duplicated)
- Kill server process and verify jobs resume on restart
- Check job completion/failure logs in database

---

#### 3.2 Add Structured Logging and Monitoring (P2)

**Issue:** No structured logging, metrics, or alerting for critical failures.

**Steps:**
1. Install logging library: `pnpm add pino pino-pretty`
2. Replace console.log with structured logger
3. Add error tracking (Sentry or similar)
4. Add metrics for key operations
5. Set up alerts for critical failures

**Implementation:**
```typescript
// src/lib/server/logger.ts
import pino from 'pino';
import { env } from './env';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Specialized loggers for different domains
export const reservationLogger = logger.child({ domain: 'reservation' });
export const paymentLogger = logger.child({ domain: 'payment' });
export const emailLogger = logger.child({ domain: 'email' });
export const jobLogger = logger.child({ domain: 'jobs' });
```

**Replace console.log calls:**
```typescript
// Before
console.log(`[Cleanup Job] Found ${expiredReservations.length} expired reservations`);

// After
jobLogger.info(
  { count: expiredReservations.length },
  'Found expired reservations'
);

// Error logging with context
reservationLogger.error(
  {
    reservationId,
    error: error.message,
    stack: error.stack,
  },
  'Failed to create reservation'
);
```

**Add Sentry for error tracking:**
```typescript
// src/lib/server/monitoring.ts
import * as Sentry from '@sentry/node';
import { env } from './env';

export function initMonitoring() {
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      beforeSend(event, hint) {
        // Filter sensitive data
        if (event.request) {
          delete event.request.cookies;
        }
        return event;
      },
    });
    console.log('✅ Sentry monitoring initialized');
  }
}

export function captureException(error: Error, context?: Record<string, any>) {
  logger.error({ error: error.message, context }, 'Exception captured');
  if (env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}
```

**Testing:**
- Trigger errors and verify they appear in logs
- Check log format is parseable (JSON in production)
- Verify Sentry captures exceptions with context

---

#### 3.3 Move Magic Numbers to Configuration (P2)

**Issue:** Hard-coded values scattered throughout codebase.

**Steps:**
1. Create configuration file for application settings
2. Move all magic numbers to config
3. Add environment variable overrides where appropriate

**Implementation:**
```typescript
// src/lib/server/config.ts
import { env } from './env';

export const config = {
  // Job intervals
  jobs: {
    sessionCleanupIntervalMs: 60 * 60 * 1000, // 1 hour
    reservationCleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    emailQueueIntervalMs: 2 * 60 * 1000, // 2 minutes
  },

  // Reservation limits
  reservations: {
    maxTicketsPerReservation: 10,
    expiryMinutes: env.RESERVATION_EXPIRY_MINUTES,
    holdTimeWarningMinutes: 5, // Show warning when 5 min left
  },

  // Rate limiting
  rateLimit: {
    reservationWindow: 10 * 60 * 1000, // 10 minutes
    reservationMaxAttempts: 10,
    contactFormWindow: 60 * 60 * 1000, // 1 hour
    contactFormMaxAttempts: 5,
  },

  // Email
  email: {
    maxRetryAttempts: 3,
    retryBaseDelayMinutes: 5,
  },

  // Payment
  payment: {
    supportedCurrencies: ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'],
  },
} as const;

// Type-safe config access
export type AppConfig = typeof config;
```

**Update validators:**
```typescript
// src/lib/server/validators/reservations.ts
import { config } from '../config';

export const createReservationSchema = z.object({
  // ...
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(config.reservations.maxTicketsPerReservation,
         `Maximum ${config.reservations.maxTicketsPerReservation} tickets per reservation`),
  // ...
});
```

---

### Phase 4: Code Quality Improvements (P3)

#### 4.1 Add Missing Database Indexes (P3)

**Steps:**
1. Analyze query patterns from logs
2. Add composite indexes for common query combinations
3. Add indexes for monitoring queries

**Implementation:**
```typescript
// Update src/lib/server/db/schema.ts

export const reservations = pgTable('reservations', {
  // ... existing fields ...
}, (table) => ({
  // Existing indexes
  sessionIdIdx: index('reservations_session_id_idx').on(table.eventSessionId),
  emailIdx: index('reservations_email_idx').on(table.guestEmail),
  accessTokenIdx: index('reservations_access_token_idx').on(table.accessToken),
  statusIdx: index('reservations_status_idx').on(table.status),
  expiresAtIdx: index('reservations_expires_at_idx').on(table.expiresAt),

  // NEW: Composite index for common queries
  sessionStatusIdx: index('reservations_session_status_idx')
    .on(table.eventSessionId, table.status),

  // NEW: Index for expiration cleanup job
  statusExpiresIdx: index('reservations_status_expires_idx')
    .on(table.status, table.expiresAt),

  // Existing constraints
  quantityCheck: check('reservations_quantity_check', sql`quantity > 0`),
  amountCheck: check('reservations_amount_check', sql`total_amount >= 0`),
}));

export const payments = pgTable('payments', {
  // ... existing fields ...
}, (table) => ({
  // Existing indexes
  reservationIdIdx: index('payments_reservation_id_idx').on(table.reservationId),
  stripePaymentIntentIdx: index('payments_stripe_payment_intent_idx').on(table.stripePaymentIntentId),
  statusIdx: index('payments_status_idx').on(table.status),
  idempotencyKeyIdx: index('payments_idempotency_key_idx').on(table.idempotencyKey),

  // NEW: Index for monitoring unprocessed webhooks
  webhookProcessedIdx: index('payments_webhook_processed_idx')
    .on(table.webhookProcessedAt)
    .where(sql`webhook_processed_at IS NULL`), // Partial index

  // Existing constraints
  refundCheck: check('payments_refund_check',
    sql`refunded_amount >= 0 AND refunded_amount <= amount`
  ),
}));
```

**Migration:**
```bash
# Generate migration
pnpm drizzle-kit generate:pg

# Review and apply
pnpm drizzle-kit push:pg
```

**Testing:**
- Run EXPLAIN ANALYZE on common queries before/after
- Monitor query performance in production
- Check index usage with pg_stat_user_indexes

---

#### 4.2 Implement Waitlist Feature (P3)

**Issue:** Schema has `allowWaitlist` but no implementation.

**Steps:**
1. Create waitlist table
2. Add API endpoint to join waitlist
3. Create notification system when capacity becomes available
4. Add admin interface to manage waitlist

**Implementation:**
```typescript
// Add to src/lib/server/db/schema.ts
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
}));
```

**Service:**
```typescript
// src/lib/server/services/waitlist.ts
export async function joinWaitlist(input: {
  sessionId: string;
  email: string;
  name: string;
  phone?: string;
  quantity: number;
}) {
  const session = await getSessionById(input.sessionId);

  if (!session.allowWaitlist) {
    throw new Error('Waitlist not available for this session');
  }

  // Check if already on waitlist
  const existing = await db.query.waitlist.findFirst({
    where: and(
      eq(waitlist.eventSessionId, input.sessionId),
      eq(waitlist.email, input.email),
      eq(waitlist.notified, false)
    ),
  });

  if (existing) {
    throw new Error('Already on waitlist');
  }

  // Add to waitlist (expires in 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(waitlist).values({
    eventSessionId: input.sessionId,
    email: input.email,
    name: input.name,
    phone: input.phone ?? null,
    quantity: input.quantity,
    expiresAt,
  });
}

export async function notifyWaitlist(sessionId: string, availableCapacity: number) {
  // Get unnotified waitlist entries
  const entries = await db.query.waitlist.findMany({
    where: and(
      eq(waitlist.eventSessionId, sessionId),
      eq(waitlist.notified, false),
      gt(waitlist.expiresAt, new Date())
    ),
    orderBy: [waitlist.createdAt], // First come, first served
  });

  let remaining = availableCapacity;
  const toNotify: typeof entries = [];

  for (const entry of entries) {
    if (remaining >= entry.quantity) {
      toNotify.push(entry);
      remaining -= entry.quantity;
    }
    if (remaining === 0) break;
  }

  // Send notifications
  for (const entry of toNotify) {
    try {
      await sendWaitlistNotificationEmail(entry);

      await db.update(waitlist)
        .set({
          notified: true,
          notifiedAt: new Date(),
        })
        .where(eq(waitlist.id, entry.id));
    } catch (error) {
      console.error('Failed to notify waitlist entry:', error);
    }
  }

  return { notified: toNotify.length };
}
```

**Integrate with capacity changes:**
```typescript
// In expireReservation and cancelReservationWithRefund
// After restoring capacity:
const session = await getSessionById(reservation.eventSessionId);
if (session.allowWaitlist && session.availableCapacity > 0) {
  await notifyWaitlist(session.id, session.availableCapacity);
}
```

---

#### 4.3 Add Type-Safe ID Branding (P3)

**Issue:** Easy to accidentally mix different types of UUIDs.

**Implementation:**
```typescript
// src/lib/types/branded.ts
declare const brand: unique symbol;

type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type ReservationId = Brand<string, 'ReservationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type EventId = Brand<string, 'EventId'>;
export type PaymentId = Brand<string, 'PaymentId'>;

export function reservationId(id: string): ReservationId {
  return id as ReservationId;
}

export function sessionId(id: string): SessionId {
  return id as SessionId;
}

// Update function signatures
export async function getReservationById(id: ReservationId): Promise<ReservationWithDetails> {
  // ...
}
```

This prevents accidentally calling `getReservationById(sessionId)`.

---

#### 4.4 Add Integration Tests (P3)

**Issue:** No test coverage for critical race condition scenarios.

**Steps:**
1. Install testing framework: `pnpm add -D vitest @testing-library/svelte`
2. Set up test database
3. Write integration tests for critical paths
4. Add CI/CD integration

**Implementation:**
```typescript
// tests/integration/reservations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createReservation } from '$lib/server/services/reservations';

describe('Reservation Race Conditions', () => {
  beforeEach(async () => {
    // Setup test database with known state
    await setupTestDatabase();
  });

  it('should prevent double-booking with concurrent requests', async () => {
    const sessionId = await createTestSession({ totalCapacity: 1 });

    // Simulate two concurrent reservations for the last ticket
    const [result1, result2] = await Promise.allSettled([
      createReservation({
        sessionId,
        email: 'user1@test.com',
        name: 'User 1',
        quantity: 1,
      }),
      createReservation({
        sessionId,
        email: 'user2@test.com',
        name: 'User 2',
        quantity: 1,
      }),
    ]);

    // One should succeed, one should fail
    const succeeded = [result1, result2].filter(r => r.status === 'fulfilled');
    const failed = [result1, result2].filter(r => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.message).toContain('Not enough tickets available');
  });

  it('should restore capacity on payment failure', async () => {
    // Test implementation
  });

  it('should handle transaction rollback correctly', async () => {
    // Test implementation
  });
});
```

---

## Testing Strategy

### Pre-deployment Testing Checklist

- [ ] Run full test suite
- [ ] Load test reservation system (simulate 100 concurrent bookings)
- [ ] Test all error paths
- [ ] Verify webhook signature validation
- [ ] Test email queue with SMTP disabled
- [ ] Test capacity locking under load
- [ ] Verify job scheduler works across server restarts
- [ ] Test payment failure scenarios with Stripe test cards
- [ ] Security scan (SQL injection, XSS, CSRF)
- [ ] Performance testing (database query analysis)

### Monitoring Post-deployment

- [ ] Set up alerts for failed payments
- [ ] Monitor orphaned PaymentIntents in Stripe
- [ ] Track email queue failures
- [ ] Monitor job completion rates
- [ ] Alert on high error rates
- [ ] Track reservation funnel (created → confirmed)

---

## Database Migrations

After implementing changes, generate migrations:

```bash
# Generate migration files
pnpm drizzle-kit generate:pg

# Review migrations in /drizzle folder

# Apply to development
pnpm drizzle-kit push:pg

# For production, use proper migration workflow:
# 1. Test migration on staging
# 2. Backup production database
# 3. Apply migration during maintenance window
# 4. Verify data integrity
```

---

## Configuration Changes Required

### Environment Variables to Add

```bash
# Add to .env
SENTRY_DSN=https://...  # Optional but recommended
PUBLIC_URL=https://your-domain.com  # Must be set correctly

# Job scheduler
PGBOSS_ENABLED=true

# Email queue
EMAIL_MAX_RETRY_ATTEMPTS=3
```

---

## Dependencies to Install

```bash
# Phase 1
pnpm add dompurify
pnpm add -D @types/dompurify

# Phase 2
# (No new dependencies - uses existing database)

# Phase 3
pnpm add pg-boss
pnpm add pino pino-pretty
pnpm add @sentry/node

# Phase 4 (optional)
pnpm add -D vitest @testing-library/svelte
```

---

## Risk Assessment

| Change | Risk Level | Mitigation |
|--------|-----------|------------|
| Payment cleanup on failure | Low | Comprehensive testing with Stripe test mode |
| Email HTML sanitization | Low | Test with edge cases, verify rendering |
| Immediate capacity restoration | Medium | Test race conditions, add monitoring |
| Email queue | Low | Graceful fallback to existing behavior |
| Job scheduler | Medium | Deploy to staging first, test multi-instance |
| Database indexes | Low | Apply during low-traffic period |
| Transaction timeouts | Medium | Start with generous timeout, monitor |

---

## Rollback Plan

For each phase:

1. **Code rollback**: Git revert + redeploy
2. **Database migrations**: Keep backward-compatible or prepare rollback scripts
3. **Feature flags**: Consider adding for email queue and job scheduler
4. **Monitoring**: Set up alerts before deployment to catch issues early

---

## Success Metrics

Track these metrics before and after implementation:

- **Reservation success rate**: Should remain >99%
- **Payment success rate**: Track separately from reservation failures
- **Email delivery rate**: Should improve from current ~95% to >99%
- **Average capacity lock time**: Should decrease
- **Orphaned PaymentIntents**: Should be 0
- **Job completion rate**: Should be >99.9%
- **P95 response time**: Should remain under 500ms for reservation API

---

## Questions to Answer Before Implementation

1. What's the expected peak concurrent users?
2. What's the acceptable downtime for maintenance?
3. Is there a monitoring/alerting system in place?
4. What's the process for database migrations in production?
5. Is there a staging environment for testing?
6. What's the disaster recovery plan?
7. Are there any compliance requirements (GDPR, PCI)?

---

## Next Steps

1. **Review this plan** with team and stakeholders
2. **Set priorities** based on launch timeline
3. **Create tickets** for each task in project management system
4. **Assign owners** for each phase
5. **Schedule testing** windows
6. **Prepare rollback** procedures
7. **Document** deployment process

---

**Document Status:** Ready for Review
**Last Updated:** 2026-01-11
**Owner:** Development Team
