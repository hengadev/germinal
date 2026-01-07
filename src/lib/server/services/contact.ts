import { db } from '../db';
import { contactSubmissions } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import type { CreateContactSubmissionInput, ContactSubmission } from '$lib/types/contact';
import { sendContactEmail } from './email';

export async function createContactSubmission(
  input: CreateContactSubmissionInput
): Promise<ContactSubmission> {
  if (input.honeypot && input.honeypot.trim() !== '') {
    console.warn('🚨 Honeypot triggered for submission from:', input.email);
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
      submittedAt: submission.createdAt,
      ipAddress: submission.ipAddress,
    });

    emailSent = true;
    emailSentAt = new Date();
  } catch (error) {
    console.error('Failed to send contact email:', error);
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
