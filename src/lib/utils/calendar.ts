import ics from 'ics';

export type CalendarEvent = {
	title: string;
	description: string;
	location: string;
	start: Date;
	end: Date;
	url?: string;
};

/**
 * Generate .ics calendar file for adding to calendar
 */
export function generateICSFile(event: CalendarEvent): string | null {
	try {
		const { error, value } = ics.createEvent({
			start: [
				event.start.getFullYear(),
				event.start.getMonth() + 1,
				event.start.getDate(),
				event.start.getHours(),
				event.start.getMinutes(),
			],
			end: [
				event.end.getFullYear(),
				event.end.getMonth() + 1,
				event.end.getDate(),
				event.end.getHours(),
				event.end.getMinutes(),
			],
			title: event.title,
			description: event.description,
			location: event.location,
			url: event.url,
			status: 'CONFIRMED',
		});

		if (error) {
			console.error('Error generating calendar file:', error);
			return null;
		}

		return value;
	} catch (error) {
		console.error('Error generating calendar file:', error);
		return null;
	}
}
