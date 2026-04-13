import { json, type RequestHandler } from '@sveltejs/kit';
import { isAdminDomain } from '$lib/server/hostname';

export const GET: RequestHandler = async ({ url }) => {
	const hostname = url.hostname;
	const isAdmin = isAdminDomain(hostname);

	// Main app manifest
	if (!isAdmin) {
		return json({
			name: 'Germinal Event Ticketing',
			short_name: 'Germinal',
			description: 'Event ticketing and reservation management platform',
			start_url: '/',
			display: 'standalone',
			background_color: '#ffffff',
			theme_color: '#ffffff',
			lang: 'en',
			scope: '/',
			icons: [
				{
					src: '/pwa-192x192.png',
					sizes: '192x192',
					type: 'image/png'
				},
				{
					src: '/pwa-512x512.png',
					sizes: '512x512',
					type: 'image/png'
				},
				{
					src: '/pwa-512x512.png',
					sizes: '512x512',
					type: 'image/png',
					purpose: 'any maskable'
				}
			]
		});
	}

	// Admin app manifest
	return json({
		name: 'Germinal Admin',
		short_name: 'Admin',
		description: 'Germinal admin dashboard for event and reservation management',
		start_url: '/',
		display: 'standalone',
		background_color: '#1a1a1a',
		theme_color: '#1a1a1a',
		lang: 'en',
		scope: '/',
		icons: [
			{
				src: '/pwa-admin-192x192.png',
				sizes: '192x192',
				type: 'image/png'
			},
			{
				src: '/pwa-admin-512x512.png',
				sizes: '512x512',
				type: 'image/png'
			},
			{
				src: '/pwa-admin-512x512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any maskable'
			}
		]
	});
};
