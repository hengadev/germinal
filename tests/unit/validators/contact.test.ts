import { describe, it, expect } from 'vitest';
import { contactSubmissionSchema } from '../../../src/lib/server/validators/contact';

const base = {
	name: 'Camille',
	email: 'camille@example.com',
	inquiryType: 'private_event',
	message: 'Un dîner pour nos trente ans.'
};

describe('contactSubmissionSchema guest count', () => {
	it('treats an empty guest count as not given', () => {
		const result = contactSubmissionSchema.safeParse({ ...base, guestCount: '' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.guestCount).toBeNull();
	});

	it('treats a missing guest count as not given', () => {
		const result = contactSubmissionSchema.safeParse({ ...base, guestCount: null });
		expect(result.success && result.data.guestCount).toBeNull();
	});

	it('parses a typed guest count', () => {
		const result = contactSubmissionSchema.safeParse({ ...base, guestCount: '40' });
		expect(result.success && result.data.guestCount).toBe(40);
	});

	it('refuses zero guests', () => {
		expect(contactSubmissionSchema.safeParse({ ...base, guestCount: '0' }).success).toBe(false);
	});
});
