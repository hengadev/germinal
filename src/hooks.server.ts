import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = (({ error }) => {
  console.error('Server error:', error);

  return {
    message: 'An unexpected error occurred',
    code: error instanceof Error ? error.name : 'UNKNOWN',
  };
}) satisfies HandleServerError;
