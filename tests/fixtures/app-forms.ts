/**
 * A no-op stand-in for SvelteKit's `$app/forms` `enhance` action, aliased
 * in vitest.config.ts so components that use it can render headless: the
 * dialog tests exercise the live quote, not form submission.
 */
export const enhance = () => {};
