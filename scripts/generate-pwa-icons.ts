import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function generateIcon(size: number, outputPath: string) {
	// Create a simple, clean PWA icon with a dark "G" on white background
	const svg = `
	<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
		<rect width="${size}" height="${size}" fill="#ffffff" rx="${size * 0.15}" />
		<!-- Letter G -->
		<path d="M ${size * 0.58} ${size * 0.22}
		         L ${size * 0.38} ${size * 0.22}
		         Q ${size * 0.25} ${size * 0.22} ${size * 0.25} ${size * 0.35}
		         L ${size * 0.25} ${size * 0.65}
		         Q ${size * 0.25} ${size * 0.78} ${size * 0.38} ${size * 0.78}
		         L ${size * 0.62} ${size * 0.78}
		         Q ${size * 0.75} ${size * 0.78} ${size * 0.75} ${size * 0.65}
		         L ${size * 0.75} ${size * 0.56}
		         L ${size * 0.5} ${size * 0.56}"
			  fill="none"
			  stroke="#1a1a1a"
			  stroke-width="${size * 0.08}"
			  stroke-linecap="round"
			  stroke-linejoin="round" />
	</svg>
	`;

	await sharp(Buffer.from(svg))
		.png()
		.toFile(outputPath);

	console.log(`Generated ${outputPath}`);
}

async function generateAdminIcon(size: number, outputPath: string) {
	// Create admin PWA icon with a white "G" on dark background (inverted)
	const svg = `
	<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
		<rect width="${size}" height="${size}" fill="#1a1a1a" rx="${size * 0.15}" />
		<!-- Letter G -->
		<path d="M ${size * 0.58} ${size * 0.22}
		         L ${size * 0.38} ${size * 0.22}
		         Q ${size * 0.25} ${size * 0.22} ${size * 0.25} ${size * 0.35}
		         L ${size * 0.25} ${size * 0.65}
		         Q ${size * 0.25} ${size * 0.78} ${size * 0.38} ${size * 0.78}
		         L ${size * 0.62} ${size * 0.78}
		         Q ${size * 0.75} ${size * 0.78} ${size * 0.75} ${size * 0.65}
		         L ${size * 0.75} ${size * 0.56}
		         L ${size * 0.5} ${size * 0.56}"
			  fill="none"
			  stroke="#ffffff"
			  stroke-width="${size * 0.08}"
			  stroke-linecap="round"
			  stroke-linejoin="round" />
	</svg>
	`;

	await sharp(Buffer.from(svg))
		.png()
		.toFile(outputPath);

	console.log(`Generated ${outputPath}`);
}

async function main() {
	const staticDir = join(process.cwd(), 'static');

	// Generate standard PWA icons (dark G on white)
	await generateIcon(192, join(staticDir, 'pwa-192x192.png'));
	await generateIcon(512, join(staticDir, 'pwa-512x512.png'));

	// Generate admin PWA icons (white G on dark - inverted)
	await generateAdminIcon(192, join(staticDir, 'pwa-admin-192x192.png'));
	await generateAdminIcon(512, join(staticDir, 'pwa-admin-512x512.png'));

	// Generate favicon
	await generateIcon(32, join(staticDir, 'favicon-32x32.png'));
	await generateIcon(16, join(staticDir, 'favicon-16x16.png'));

	console.log('PWA icons generated successfully!');
}

main().catch(console.error);
