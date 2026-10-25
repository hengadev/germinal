import type { Breadcrumb, Event } from '@sentry/node';
import { redactUrl } from '$lib/utils/redaction';

function scrubValues<T extends Record<string, unknown>>(data: T): T {
	return Object.fromEntries(
		Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? redactUrl(value) : value])
	) as T;
}

/**
 * Strip what must not reach the error tracker: request bodies, cookies,
 * headers and query strings, the user's email and IP, and the bearer
 * tokens some URLs carry (tickets, reservations, password resets). Applies
 * to errors and to performance traces alike: a span's description and data
 * hold the same URLs.
 */
export function scrubEvent<T extends Event>(event: T): T {
	if (event.transaction) event.transaction = redactUrl(event.transaction);
	if (event.request) event.request = event.request.url ? { url: redactUrl(event.request.url) } : {};
	if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
	if (event.extra) event.extra = scrubValues(event.extra);
	if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
	if (event.contexts?.trace?.data) event.contexts.trace.data = scrubValues(event.contexts.trace.data);
	for (const span of event.spans ?? []) {
		if (span.description) span.description = redactUrl(span.description);
		if (span.data) span.data = scrubValues(span.data);
	}
	return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	if (breadcrumb.message) breadcrumb.message = redactUrl(breadcrumb.message);
	if (breadcrumb.data) breadcrumb.data = scrubValues(breadcrumb.data);
	return breadcrumb;
}
