import { fail, type Actions } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { contactSubmissionSchema } from '$lib/server/validators/contact';
import { createContactSubmission } from '$lib/server/services/contact';
import { strictRateLimiter } from '$lib/server/rate-limit';
import { validateCsrfTokenFromForm } from '$lib/server/csrf';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  return {
    csrfToken: locals.csrfToken
  };
};

export const actions: Actions = {
  default: async ({ request, getClientAddress, locals }) => {
    const ip = getClientAddress();

    if (!strictRateLimiter.check(ip)) {
      const resetTime = strictRateLimiter.getReset(ip);
      return fail(429, {
        error: `Too many submissions. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
        rateLimited: true,
      });
    }

    const formData = await request.formData();

    // CSRF validation
    if (!validateCsrfTokenFromForm(formData, locals.csrfToken)) {
      return fail(403, {
        error: 'Invalid CSRF token',
      });
    }
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      company: formData.get('company'),
      inquiryType: formData.get('inquiryType'),
      message: formData.get('message'),
      honeypot: formData.get('website'),
    };

    const validated = contactSubmissionSchema.safeParse(data);

    if (!validated.success) {
      const errors = validated.error.flatten();
      return fail(400, {
        error: 'Please check your input and try again.',
        fieldErrors: errors.fieldErrors,
        formData: data,
      });
    }

    const userAgent = request.headers.get('user-agent');

    try {
      await createContactSubmission({
        ...validated.data,
        ipAddress: ip,
        userAgent,
      });

      strictRateLimiter.reset(ip);

      return {
        success: true,
        message: 'Thank you for your message. We will get back to you soon!',
      };
    } catch (error) {
      logger.error('Contact form submission error:', error);

      if (error instanceof Error && error.message === 'Invalid submission') {
        return fail(400, {
          error: 'There was a problem with your submission. Please try again.',
        });
      }

      return fail(500, {
        error: 'An error occurred while processing your submission. Please try again later.',
      });
    }
  },
};
