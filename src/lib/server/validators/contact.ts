import { z } from 'zod';

export const inquiryTypeSchema = z.enum([
  'collaboration',
  'new_project',
  'join_roster',
  'other'
]);

export const contactSubmissionSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),

  email: z.string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase(),

  company: z.string()
    .max(255, 'Company name must be less than 255 characters')
    .optional()
    .transform(v => v ?? null),

  inquiryType: inquiryTypeSchema,

  message: z.string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message must be less than 5000 characters'),

  honeypot: z.string()
    .max(100)
    .optional()
    .transform(v => v ?? null),
}).refine(data => !data.honeypot || data.honeypot.trim() === '', {
  message: 'Invalid submission',
  path: ['honeypot'],
});

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
