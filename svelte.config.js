import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Only a production build (`vite build`) drops the dev allowances below.
// Keying them on NODE_ENV broke local dev: the running dev server came to
// evaluate this file with NODE_ENV=production, and the CSP it served then
// blocked every local MinIO image.
const __productionBuild = process.argv.includes("build");

// Dev-only allowance so impeccable live mode can load.
const __impeccableLiveDev = __productionBuild ? [] : ["http://localhost:8400"];

// Local MinIO (docker-compose.yml) serves uploaded media over plain http.
// Outside production builds only; production media stays https-only.
const __localMediaDev = __productionBuild ? [] : ["http://localhost:9000"];

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
                // wasm-unsafe-eval: the Staff Scanner's QR decoder (WebAssembly) on
                // phones without a native BarcodeDetector. It allows compiling
                // WebAssembly only, not eval of JavaScript.
                'script-src': ['self', 'wasm-unsafe-eval', ...__impeccableLiveDev],
                'style-src': ['self', 'unsafe-inline'],
                'font-src': ['self'],
                'img-src': ['self', 'data:', 'blob:', 'https:', ...__localMediaDev],
                'media-src': ['self', ...__localMediaDev],
                'connect-src': ['self', 'https://api.stripe.com', 'https://js.stripe.com', ...__impeccableLiveDev],
                'frame-src': ['https://js.stripe.com'],
            }
        }
    }
};

export default config;
