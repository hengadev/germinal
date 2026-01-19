import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/svelte';
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
	cleanup();
});

afterEach(() => {
	vi.clearAllMocks();
});
