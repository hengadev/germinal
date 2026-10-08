#!/usr/bin/env node
/**
 * GDPR erasure request: removes one person's data, found by email address.
 *
 * - reservations: anonymised the same way as the retention job
 *   (src/lib/server/jobs/purge-personal-data.ts): name, email, phone, IP and
 *   user agent go; amounts, dates, status and Stripe IDs stay.
 * - waitlist entries, contact messages and queued emails: deleted.
 *
 * Dry run by default: prints the counts only. Add --apply to erase. Refuses
 * while the person holds a confirmed reservation for a session that hasn't
 * ended: cancel or refund it in the admin first.
 *
 * Not shipped in the image: piped into the running app container, which has
 * DATABASE_URL. Prints no personal data.
 *
 *   ssh germinal 'docker exec -i germinal_app node --input-type=module - someone@example.com' < scripts/erase-guest-data.js
 *   ssh germinal 'docker exec -i germinal_app node --input-type=module - someone@example.com --apply' < scripts/erase-guest-data.js
 *
 * Keep the request (the email asking for erasure) as the record: after a
 * backup restore, run this again for every request received since the dump.
 */
import postgres from 'postgres';

const ANONYMISED_EMAIL = 'anonymised@invalid';
const ANONYMISED_NAME = 'Anonymised';

const email = (process.argv[2] || '').trim().toLowerCase();
const apply = process.argv.includes('--apply');

if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
	console.log('usage: pass the email address, then --apply to erase (dry run without it)');
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.log('DATABASE_URL is not set: run this inside the app container');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
	const [counts] = await sql`
		SELECT
			(SELECT count(*) FROM reservations WHERE lower(guest_email) = ${email})::int AS reservations,
			(SELECT count(*) FROM reservations r JOIN event_sessions s ON s.id = r.event_session_id
				WHERE lower(r.guest_email) = ${email} AND r.status IN ('confirmed', 'processing')
				AND s.end_time > now())::int AS upcoming,
			(SELECT count(*) FROM waitlist WHERE lower(email) = ${email})::int AS waitlist,
			(SELECT count(*) FROM contact_submissions WHERE lower(email) = ${email})::int AS contact,
			(SELECT count(*) FROM email_queue WHERE lower(recipient) = ${email})::int AS emails
	`;
	console.log(
		`found: ${counts.reservations} reservation(s) (${counts.upcoming} upcoming), ` +
			`${counts.waitlist} waitlist, ${counts.contact} contact message(s), ${counts.emails} email(s)`
	);

	if (!apply) {
		console.log('dry run: nothing changed (add --apply to erase)');
	} else if (counts.upcoming > 0) {
		console.log('refused: cancel or refund the upcoming reservation(s) in the admin first');
		process.exitCode = 1;
	} else {
		await sql.begin(async (tx) => {
			await tx`
				UPDATE reservations SET guest_email = ${ANONYMISED_EMAIL}, guest_name = ${ANONYMISED_NAME},
					guest_phone = NULL, ip_address = NULL, user_agent = NULL, updated_at = now()
				WHERE lower(guest_email) = ${email}`;
			await tx`DELETE FROM waitlist WHERE lower(email) = ${email}`;
			await tx`DELETE FROM contact_submissions WHERE lower(email) = ${email}`;
			await tx`DELETE FROM email_queue WHERE lower(recipient) = ${email}`;
		});
		console.log('erased: OK');
	}
} catch (err) {
	console.log('FAIL', err.code || '', err.message);
	process.exitCode = 1;
} finally {
	await sql.end();
}
