import { json, type RequestHandler } from '@sveltejs/kit';
import { isAdminDomain, isStaffDomain } from '$lib/server/hostname';

export const GET: RequestHandler = async ({ url }) => {
	const hostname = url.hostname;
	const isAdmin = isAdminDomain(hostname);
	const isStaff = isStaffDomain(hostname);

	// Admin/Staff app manifest (dark theme, same icons)
	if (isAdmin || isStaff) {
		return json({
			name: isAdmin ? 'Germinal Admin' : 'Germinal Staff',
			short_name: isAdmin ? 'Admin' : 'Staff',
			description: isAdmin
				? 'Germinal admin dashboard for event and reservation management'
				: 'Germinal staff portal for event and reservation management',
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
	}

	// Main app manifest (light theme)
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
};
