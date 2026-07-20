import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests processed',
	labelNames: ['method', 'route', 'status_code'],
	registers: [registry],
});

const httpRequestDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route'],
	registers: [registry],
});

const httpRequestsInFlight = new Gauge({
	name: 'http_requests_in_flight',
	help: 'Number of HTTP requests currently being processed',
	registers: [registry],
});

const dbQueriesTotal = new Counter({
	name: 'db_queries_total',
	help: 'Total database queries executed',
	registers: [registry],
});

const dbSlowQueriesTotal = new Counter({
	name: 'db_slow_queries_total',
	help: 'Total database queries exceeding the slow-query threshold',
	registers: [registry],
});

const dbQueryDuration = new Histogram({
	name: 'db_query_duration_seconds',
	help: 'Database query duration in seconds',
	registers: [registry],
});

const reservationsTotal = new Counter({
	name: 'reservations_total',
	help: 'Total reservation state transitions',
	labelNames: ['state'],
	registers: [registry],
});

const checkoutTotal = new Counter({
	name: 'checkout_total',
	help: 'Total checkout attempts by result',
	labelNames: ['result'],
	registers: [registry],
});

const waitlistSignupsTotal = new Counter({
	name: 'waitlist_signups_total',
	help: 'Total waitlist signups',
	registers: [registry],
});

/**
 * Track a completed HTTP request. Call once per request, after the response
 * has been resolved, with the SvelteKit parameterized route id (not the raw
 * pathname) to keep label cardinality bounded.
 */
export function recordHttpRequest(
	method: string,
	route: string,
	statusCode: number,
	durationMs: number
) {
	httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
	httpRequestDuration.observe({ method, route }, durationMs / 1000);
}

export function startHttpRequest() {
	httpRequestsInFlight.inc();
	return () => httpRequestsInFlight.dec();
}

export function recordDbQuery(durationMs: number, options: { slow: boolean }) {
	dbQueriesTotal.inc();
	dbQueryDuration.observe(durationMs / 1000);
	if (options.slow) {
		dbSlowQueriesTotal.inc();
	}
}

export function incrementReservationCounter(state: 'created' | 'confirmed') {
	reservationsTotal.inc({ state });
}

export function incrementCheckoutCounter(result: 'success' | 'failure') {
	checkoutTotal.inc({ result });
}

export function incrementWaitlistSignup() {
	waitlistSignupsTotal.inc();
}

export function getMetricsContentType() {
	return registry.contentType;
}

export async function getMetricsText(): Promise<string> {
	return registry.metrics();
}
