/**
 * Pagination Utilities
 * Provides consistent pagination support across API endpoints
 */

export interface PaginationParams {
	page?: number;
	limit?: number;
	cursor?: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
		nextCursor?: string;
		previousCursor?: string;
	};
}

export interface PaginationOptions {
	page?: number;
	limit?: number;
	cursor?: string;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Parse and validate pagination parameters from URL search params
 */
export function parsePagination(params: URLSearchParams): PaginationOptions {
	const page = Math.max(
		DEFAULT_PAGE,
		parseInt(params.get('page') || String(DEFAULT_PAGE), 10)
	);

	const limit = Math.min(
		MAX_LIMIT,
		Math.max(
			1,
			parseInt(params.get('limit') || String(DEFAULT_LIMIT), 10)
		)
	);

	const cursor = params.get('cursor') || undefined;

	return { page, limit, cursor };
}

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
	currentPage: number,
	limit: number,
	total: number
): PaginatedResponse<unknown>['pagination'] {
	const totalPages = Math.ceil(total / limit);
	const hasNextPage = currentPage < totalPages;
	const hasPreviousPage = currentPage > 1;

	return {
		page: currentPage,
		limit,
		total,
		totalPages,
		hasNextPage,
		hasPreviousPage,
	};
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
	data: T[],
	pagination: PaginatedResponse<unknown>['pagination']
): PaginatedResponse<T> {
	return {
		data,
		pagination,
	};
}
