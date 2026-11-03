import { db } from '../db';
import { logger } from '$lib/server/logger';
import { contactSubmissions } from '../db/schema';
import { eq, desc, and, isNull, or, count } from 'drizzle-orm';
import { events } from '../db/schema';
import { z } from 'zod';
import type { CreateContactSubmissionInput, ContactSubmission } from '$lib/types/contact';
import { sendContactEmail } from './email';

export async function createContactSubmission(
  input: CreateContactSubmissionInput
): Promise<ContactSubmission> {
  if (input.honeypot && input.honeypot.trim() !== '') {
    logger.warn({ email: input.email }, '🚨 Honeypot triggered for submission');
    throw new Error('Invalid submission');
  }

  let emailSent = false;
  let emailSentAt: Date | null = null;
  let emailError: string | null = null;

  const [submission] = await db.insert(contactSubmissions).values({
    name: input.name,
    email: input.email,
    company: input.company || null,
    inquiryType: input.inquiryType,
    message: input.message,
    occasion: input.occasion || null,
    preferredDates: input.preferredDates || null,
    guestCount: input.guestCount ?? null,
    budget: input.budget || null,
    honeypot: input.honeypot || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    emailSent: false,
    emailSentAt: null,
    emailError: null,
  }).returning();

  try {
    await sendContactEmail({
      name: submission.name,
      email: submission.email,
      company: submission.company,
      inquiryType: submission.inquiryType,
      message: submission.message,
      occasion: submission.occasion,
      preferredDates: submission.preferredDates,
      guestCount: submission.guestCount,
      budget: submission.budget,
      submittedAt: submission.createdAt,
      ipAddress: submission.ipAddress,
    });

    emailSent = true;
    emailSentAt = new Date();
  } catch (error) {
    logger.error({ err: error }, 'Failed to send contact email');
    emailError = error instanceof Error ? error.message : 'Unknown error';
  }

  const [updated] = await db.update(contactSubmissions)
    .set({
      emailSent,
      emailSentAt,
      emailError,
    })
    .where(eq(contactSubmissions.id, submission.id))
    .returning();

  return updated;
}

export async function getAllContactSubmissions(limit = 100): Promise<ContactSubmission[]> {
  return await db.query.contactSubmissions.findMany({
    orderBy: [desc(contactSubmissions.createdAt)],
    limit,
  });
}

export async function getContactSubmissionById(id: string): Promise<ContactSubmission> {
  const submission = await db.query.contactSubmissions.findFirst({
    where: eq(contactSubmissions.id, id),
  });

  if (!submission) {
    throw new Error('Contact submission not found');
  }

  return submission;
}

// ============================================
// Demandes inbox (issue 069)
// ============================================

export type RequestStatus = 'new' | 'discussing' | 'quote_sent' | 'confirmed' | 'lost';

const REQUEST_STATUSES: RequestStatus[] = ['new', 'discussing', 'quote_sent', 'confirmed', 'lost'];

const INQUIRY_TYPES = ['collaboration', 'new_project', 'join_roster', 'private_event', 'other'] as const;

/** Not honeypot-flagged submissions, newest first, filterable. */
export async function listDemandes(options: {
  inquiryType?: string | null;
  status?: string | null;
}): Promise<ContactSubmission[]> {
  const conditions = [or(isNull(contactSubmissions.honeypot), eq(contactSubmissions.honeypot, ''))];

  if (options.inquiryType && (INQUIRY_TYPES as readonly string[]).includes(options.inquiryType)) {
    conditions.push(eq(contactSubmissions.inquiryType, options.inquiryType as (typeof INQUIRY_TYPES)[number]));
  }
  if (options.status && REQUEST_STATUSES.includes(options.status as RequestStatus)) {
    conditions.push(eq(contactSubmissions.status, options.status as RequestStatus));
  }

  return await db.query.contactSubmissions.findMany({
    where: and(...conditions),
    orderBy: [desc(contactSubmissions.createdAt)],
  });
}

/** Number of « nouvelle » (status new, non-honeypot) demandes, for the badge. */
export async function countNewDemandes(): Promise<number> {
  const [row] = await db.select({ value: count() })
    .from(contactSubmissions)
    .where(and(
      or(isNull(contactSubmissions.honeypot), eq(contactSubmissions.honeypot, '')),
      eq(contactSubmissions.status, 'new')
    ));
  return Number(row?.value ?? 0);
}

const statusSchema = z.enum(['new', 'discussing', 'quote_sent', 'confirmed', 'lost']);

export async function updateDemande(
  id: string,
  input: { status?: unknown; adminNote?: unknown }
): Promise<ContactSubmission> {
  const patch: { status?: RequestStatus; adminNote?: string | null } = {};

  if (input.status !== undefined && input.status !== null && input.status !== '') {
    const parsed = statusSchema.safeParse(input.status);
    if (!parsed.success) {
      throw new Error('Invalid status');
    }
    patch.status = parsed.data;
  }

  if (input.adminNote !== undefined) {
    const note = typeof input.adminNote === 'string' ? input.adminNote.trim() : null;
    if (note && note.length > 5000) {
      throw new Error('Note too long');
    }
    patch.adminNote = note || null;
  }

  if (Object.keys(patch).length === 0) {
    return getContactSubmissionById(id);
  }

  const [updated] = await db.update(contactSubmissions)
    .set(patch)
    .where(eq(contactSubmissions.id, id))
    .returning();

  if (!updated) {
    throw new Error('Contact submission not found');
  }

  return updated;
}

// ============================================
// « Créer l'événement » from a privatisation Demande (issue 070)
// ============================================

export class CreateEventFromDemandeError extends Error {
	constructor(
		message: string,
		public readonly status: number = 400
	) {
		super(message);
		this.name = 'CreateEventFromDemandeError';
	}
}

/**
 * Turns a privatisation Demande into a Draft Event (issue 070): the
 * request's details go into the Event's Internal Notes, and the Demande is
 * linked to it and moved to « en discussion ». Once-only: the contact row is
 * locked, and a Demande that already has an Event just returns it.
 */
export async function createEventFromDemande(id: string): Promise<{
	event: typeof events.$inferSelect;
	created: boolean;
}> {
	return await db.transaction(async (tx: typeof db) => {
		const [demande] = await tx.select()
			.from(contactSubmissions)
			.where(eq(contactSubmissions.id, id))
			.for('update');

		if (!demande) {
			throw new CreateEventFromDemandeError('Demande introuvable', 404);
		}
		if (demande.honeypot && demande.honeypot.trim() !== '') {
			throw new CreateEventFromDemandeError('Demande introuvable', 404);
		}
		if (demande.inquiryType !== 'private_event') {
			throw new CreateEventFromDemandeError(
				'Seules les demandes de privatisation peuvent devenir un événement'
			);
		}

		// Once-only: a Demande already linked returns its Event unchanged.
		if (demande.eventId) {
			const [existing] = await tx.select().from(events).where(eq(events.id, demande.eventId));
			if (existing) return { event: existing, created: false };
		}

		const title = demande.occasion?.trim() || `Privatisation — ${demande.name}`;
		const notes = [
			`Demande de privatisation (issue 069).`,
			`Contact : ${demande.name} <${demande.email}>${demande.company ? ` — ${demande.company}` : ''}`,
			`Occasion : ${demande.occasion ?? '—'}`,
			`Dates souhaitées : ${demande.preferredDates ?? '—'}`,
			`Invités : ${demande.guestCount ?? '—'}`,
			`Budget : ${demande.budget ?? '—'}`,
			`Message :`,
			demande.message,
			`Demande : /admin/demandes/${demande.id}`,
			`Publier l'événement en Privé une fois prêt.`
		].join('\n');

		// Draft until the Admin publishes it as Private (CONTEXT.md « Visibility »).
		const [event] = await tx.insert(events).values({
			titleFr: title.slice(0, 255),
			titleEn: title.slice(0, 255),
			internalNotes: notes,
			visibility: 'draft',
		}).returning();

		await tx.update(contactSubmissions)
			.set({ eventId: event.id, status: 'discussing' })
			.where(eq(contactSubmissions.id, id));

		return { event, created: true };
	});
}

export async function getFailedEmailSubmissions(): Promise<ContactSubmission[]> {
  return await db.query.contactSubmissions.findMany({
    where: eq(contactSubmissions.emailSent, false),
    orderBy: [desc(contactSubmissions.createdAt)],
  });
}

export async function retryContactEmail(id: string): Promise<ContactSubmission> {
  const submission = await getContactSubmissionById(id);

  try {
    await sendContactEmail({
      name: submission.name,
      email: submission.email,
      company: submission.company,
      inquiryType: submission.inquiryType,
      message: submission.message,
      occasion: submission.occasion,
      preferredDates: submission.preferredDates,
      guestCount: submission.guestCount,
      budget: submission.budget,
      submittedAt: submission.createdAt,
      ipAddress: submission.ipAddress,
    });

    const [updated] = await db.update(contactSubmissions)
      .set({
        emailSent: true,
        emailSentAt: new Date(),
        emailError: null,
      })
      .where(eq(contactSubmissions.id, id))
      .returning();

    return updated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const [updated] = await db.update(contactSubmissions)
      .set({
        emailError: errorMessage,
      })
      .where(eq(contactSubmissions.id, id))
      .returning();

    throw error;
  }
}
