#!/usr/bin/env node
/**
 * Twilio SMS end-to-end test: sends exactly ONE SMS to the number given as the
 * first argument, with the Twilio settings of the container it runs in
 * (TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID/SECRET, TWILIO_PHONE_NUMBER,
 * TWILIO_REGION/EDGE), the same way src/lib/server/services/sms.ts does.
 *
 * Not shipped in the image: piped into the running app container from an
 * operator computer, staging first (prints no secret values and no phone
 * numbers):
 *
 *   ssh germinal 'docker exec -i germinal_staging_app node --input-type=module - +33XXXXXXXXX' < scripts/twilio-send-test.js
 *
 * Use germinal_app for prod. A trial account can only text verified numbers.
 * Common failures: 401 70051/70004 = the API key wasn't created in this region
 * (or TWILIO_ACCOUNT_SID is another account's); 400 21660 = the sender belongs
 * to another account; 400 21662 = a +1 number used in IE1; 400 21408 = the
 * destination country is off in Messaging → Settings → Geo permissions.
 */
import twilio from 'twilio';

const e = process.env;
const to = process.argv[2] || '';

if (!/^\+\d{8,15}$/.test(to)) {
  console.log('usage: pass your verified phone in E.164 format, e.g. +33612345678');
  process.exit(1);
}

console.log('region:', e.TWILIO_REGION || '(empty = US1)', '| edge:', e.TWILIO_EDGE || '(empty)');
console.log('sender starts with:', (e.TWILIO_PHONE_NUMBER || '').slice(0, 3));

const client = twilio(e.TWILIO_API_KEY_SID, e.TWILIO_API_KEY_SECRET, {
  accountSid: e.TWILIO_ACCOUNT_SID,
  region: e.TWILIO_REGION || undefined,
  edge: e.TWILIO_EDGE || undefined,
});

try {
  const msg = await client.messages.create({
    body: 'Germinal: test SMS from the server.',
    from: e.TWILIO_PHONE_NUMBER,
    to,
  });
  console.log('send: OK | status:', msg.status, '| message sid prefix:', msg.sid.slice(0, 2));
} catch (err) {
  console.log('send: FAIL', err.status, err.code);
  process.exitCode = 1;
}
