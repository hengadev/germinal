import { describe, it, expect } from 'vitest';
import {
	getMetricsText,
	incrementCheckoutCounter,
	incrementReservationCounter,
	incrementWaitlistSignup,
	recordDbQuery,
	recordHttpRequest,
} from '../../../src/lib/server/metrics';

function extractMetricValue(text: string, line: string): number | undefined {
	const match = text
		.split('\n')
		.find((candidate) => candidate.startsWith(line));
	if (!match) return undefined;
	return Number(match.split(' ').pop());
}

describe('metrics registry', () => {
	it('exposes default Node process metrics', async () => {
		const text = await getMetricsText();
		expect(text).toContain('process_cpu_user_seconds_total');
	});

	it('renders parseable Prometheus exposition text', async () => {
		const text = await getMetricsText();
		// Every metric line is either a comment (# HELP / # TYPE) or "name{labels} value"
		const lines = text.split('\n').filter((line) => line.length > 0);
		for (const line of lines) {
			expect(
				line.startsWith('#') ||
					/^[a-zA-Z_:][a-zA-Z0-9_:]*(\{.*\})?\s+(-?[\d.eE+-]+|nan|[+-]?inf)$/i.test(line)
			).toBe(true);
		}
	});

	it('increments checkout_total by result label', async () => {
		incrementCheckoutCounter('failure');
		incrementCheckoutCounter('failure');
		const text = await getMetricsText();
		expect(extractMetricValue(text, 'checkout_total{result="failure"}')).toBeGreaterThanOrEqual(2);
	});

	it('increments reservations_total by state label', async () => {
		incrementReservationCounter('created');
		const text = await getMetricsText();
		expect(extractMetricValue(text, 'reservations_total{state="created"}')).toBeGreaterThanOrEqual(1);
	});

	it('increments waitlist_signups_total', async () => {
		incrementWaitlistSignup();
		const text = await getMetricsText();
		expect(extractMetricValue(text, 'waitlist_signups_total')).toBeGreaterThanOrEqual(1);
	});

	it('records HTTP request counters and duration', async () => {
		recordHttpRequest('GET', '/api/events', 200, 42);
		const text = await getMetricsText();
		expect(
			extractMetricValue(text, 'http_requests_total{method="GET",route="/api/events",status_code="200"}')
		).toBeGreaterThanOrEqual(1);
		expect(text).toContain('http_request_duration_seconds_bucket');
	});

	it('records DB query counters, marking slow queries separately', async () => {
		recordDbQuery(150, { slow: true });
		const text = await getMetricsText();
		expect(extractMetricValue(text, 'db_queries_total')).toBeGreaterThanOrEqual(1);
		expect(extractMetricValue(text, 'db_slow_queries_total')).toBeGreaterThanOrEqual(1);
	});
});
