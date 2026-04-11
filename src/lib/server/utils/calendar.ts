import type { Event, EventSession } from '$lib/server/db/schema';

/**
 * Generate Google Calendar URL for an event session
 */
export function generateGoogleCalendarUrl(event: Event, session: EventSession): string {
	const startDate = new Date(session.startTime);
	const endDate = new Date(session.endTime);

	// Format dates for Google Calendar (YYYYMMDDTHHmmssZ)
	const formatDate = (d: Date) => {
		return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
	};

	// Build the URL parameters
	const params = new URLSearchParams({
		action: 'TEMPLATE',
		text: `${event.titleEn} - ${session.titleEn}`,
		dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
		details: `Event: ${event.titleEn}\nSession: ${session.titleEn}\n\n${event.descriptionEn?.substring(0, 500) || ''}`,
		location: event.locationEn || '',
	});

	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate ICS file content for an event session
 */
export function generateICS(event: Event, session: EventSession): string {
	const startDate = new Date(session.startTime);
	const endDate = new Date(session.endTime);

	// Format dates for ICS file (YYYYMMDDTHHmmssZ)
	const formatICSDate = (d: Date) => {
		return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
	};

	// Escape ICS content
	const escapeICS = (text: string): string => {
		return text
			.replace(/\\/g, '\\\\')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,')
			.replace(/\n/g, '\\n');
	};

	// Generate UID for the event
	const uid = `${session.id}@germinal.com`;

	// Build ICS content
	const icsContent = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Germinal//Event Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${formatICSDate(new Date())}`,
		`DTSTART:${formatICSDate(startDate)}`,
		`DTEND:${formatICSDate(endDate)}`,
		`SUMMARY:${escapeICS(`${event.titleEn} - ${session.titleEn}`)}`,
		`DESCRIPTION:${escapeICS(event.descriptionEn?.substring(0, 500) || 'Event')}`,
		`LOCATION:${escapeICS(event.locationEn || '')}`,
		'STATUS:CONFIRMED',
		'TRANSP:OPAQUE',
		'END:VEVENT',
		'END:VCALENDAR',
	].join('\r\n');

	return icsContent;
}
