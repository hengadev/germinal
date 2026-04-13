import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: vitePreprocess(),

    kit: {
        // adapter-node for Docker and Node.js environments
        adapter: adapter({
            out: 'build',
            precompress: false,
            envPrefix: ''
        }),
        alias: {
            "@/*": "./path/to/lib/*",
        },
        csp: {
            mode: 'nonce',
            directives: {
                'default-src': ['self'],
                'script-src': ['self'],
                'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
                'font-src': ['self', 'https://fonts.gstatic.com'],
                'img-src': ['self', 'data:', 'blob:', 'https:'],
                'connect-src': ['self', 'https://api.stripe.com', 'https://js.stripe.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
                'frame-src': ['https://js.stripe.com'],
            }
        }
    }
};

export default config;
