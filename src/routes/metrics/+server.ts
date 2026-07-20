import { getMetricsContentType, getMetricsText } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const body = await getMetricsText();

	return new Response(body, {
		headers: {
			'Content-Type': getMetricsContentType(),
		},
	});
};
