import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			includeManifestIcons: false,
			// Disable auto-generated manifest - we use a custom endpoint
			manifest: false,
			workbox: {
				globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff,woff2,html}'],
				// No navigateFallback: Workbox's NavigationRoute would answer every
				// navigation from the precache, and the plugin precaches offline.html as
				// `offline`, so binding it to '/offline.html' made the SW fail to install.
				navigateFallback: null,
				runtimeCaching: [
					{
						// Always fetch HTML pages from the network so server-side redirects
						// (e.g. maintenance mode) are never bypassed by the service worker cache.
						// Only when the network fails, show the precached offline page.
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkOnly',
						options: {
							plugins: [
								{
									handlerDidError: async () =>
										(await caches.match('/offline', { ignoreSearch: true })) ?? Response.error()
								}
							]
						}
					},
					{
						urlPattern: /^https:\/\/api\./i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24 // 24 hours
							},
							networkTimeoutSeconds: 10
						}
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'image-cache',
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
							}
						}
					}
				]
			},
			devOptions: {
				enabled: false
			}
		})
	],
	ssr: {
		noExternal: ['pg-boss']
	}
});
