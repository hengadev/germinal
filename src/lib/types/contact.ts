import type { contactSubmissions } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import type { ContactSubmissionInput } from '$lib/server/validators/contact';

export type ContactSubmission = InferSelectModel<typeof contactSubmissions>;

export type CreateContactSubmissionInput = ContactSubmissionInput & {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ContactEmailData = {
  name: string;
  email: string;
  company: string | null;
  inquiryType: string;
  message: string;
  submittedAt: Date;
  ipAddress?: string | null;
};
