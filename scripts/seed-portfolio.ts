/**
 * Local dev data for designing "Projets" and the Event page: seven past
 * Events (six in the Portfolio, one not) and three upcoming ones (rich,
 * sparse and free, booking not open yet), with Days, Services, Seatings,
 * Menus, Collaborators, Visuals, Event Photos, Recaps and alt text, and the
 * six Talents they credit, each with a photograph of their work.
 *
 * Additive and re-runnable: it only removes what it created before (Events
 * whose Internal Notes carry SEED_MARK, their media, and the seeded
 * Talents), never your own data. Local databases only (scripts/seed-guard).
 *
 * Photos come from Wikimedia Commons (CC BY / CC BY-SA / CC0 / public
 * domain; credits below and in each Event's Internal Notes). They are
 * downloaded once into a cache folder, then uploaded to the local MinIO
 * bucket like any admin upload.
 *
 *   pnpm tsx --env-file=.env scripts/seed-portfolio.ts
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, like, and } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as schema from '../src/lib/server/db/schema.js';
import { events, eventDays, eventMenus, eventServices, eventSessions, media, talents, talentCategories } from '../src/lib/server/db/schema.js';
import { wallClockToInstant, dayStart, dayEnd } from '../src/lib/utils/event-time.js';
import { checkSeedGuard } from './seed-guard.js';

const SEED_MARK = '[seed:portfolio-dev]';
const ZONE = 'Europe/Paris';
const CACHE = process.env.SEED_MEDIA_CACHE ?? join(tmpdir(), 'germinal-seed-media');

const guard = checkSeedGuard({ nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL });
if (!guard.allowed) {
	console.error(`Refused: seed-portfolio only runs against a local database (${guard.reason}).`);
	process.exit(1);
}
for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME', 'S3_PUBLIC_URL']) {
	if (!process.env[key]) {
		console.error(`Missing ${key}: copy the local MinIO lines from .env.example into .env.`);
		process.exit(1);
	}
}

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema });
const s3 = new S3Client({
	region: process.env.AWS_REGION ?? 'us-east-1',
	endpoint: process.env.S3_ENDPOINT,
	forcePathStyle: true,
	credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});

// ---------------------------------------------------------------------------
// Photos (Wikimedia Commons file names, author, licence)
// ---------------------------------------------------------------------------

type Photo = { file: string; author: string; license: string; altFr: string; altEn: string };

const P = {
	vineSunset: { file: 'Östringen - Tiefenbach - Kreuzbergkapelle - Situationsansicht von Osten bei Sonnenuntergang.jpg', author: 'Roman Eisele', license: 'CC BY-SA 4.0', altFr: 'Coucher de soleil sur les vignes et une petite chapelle', altEn: 'Sunset over the vines and a small chapel' },
	vineMazet: { file: 'Mazet in vineyards, Mèze cf02.jpg', author: 'Christian Ferrer', license: 'CC BY 4.0', altFr: 'Un mazet de pierre au milieu des vignes en hiver', altEn: 'A stone hut among the vines in winter' },
	wineGlassVines: { file: 'Wine glass5275.jpg', author: 'Itu', license: 'CC BY-SA 4.0', altFr: 'Un verre de vin posé sur un piquet, devant les rangs de vigne', altEn: 'A wine glass on a post in front of the vine rows' },
	vineWindmill: { file: 'Former windmill, Salasc 01.jpg', author: 'Christian Ferrer', license: 'CC BY 4.0', altFr: 'Les rangs de vigne autour d’un ancien moulin', altEn: 'Vine rows around a former windmill' },
	vineHills: { file: 'Vineyard in Cabrerolles.jpg', author: 'Christian Ferrer', license: 'CC BY 4.0', altFr: 'Vignes dorées sur les collines à l’automne', altEn: 'Golden vines on the hills in autumn' },
	vineFields: { file: 'Campos de Cariñena, España, 2015-01-08, DD 32.JPG', author: 'Diego Delso', license: 'CC BY-SA 4.0', altFr: 'Champs de vigne à perte de vue', altEn: 'Vineyards as far as the eye can see' },
	glassesTable: { file: 'Jubilee Campus MMB «62 Melton Hall Christmas Dinner.jpg', author: 'mattbuck', license: 'CC BY-SA 3.0', altFr: 'Verres alignés sur la longue table du dîner', altEn: 'Glasses lined up on the long dinner table' },
	cheeseSlate: { file: 'Belper Mürggel B, WikiCheese Lausanne.jpg', author: 'Yann Forget', license: 'CC BY-SA 4.0', altFr: 'Un fromage affiné sur une ardoise', altEn: 'An aged cheese on a slate' },
	pumpkins: { file: 'Cucurbita 2011 G1.jpg', author: 'George Chernilevsky', license: 'Public domain', altFr: 'Courges et potirons de toutes formes sur l’herbe', altEn: 'Squashes and pumpkins of every shape on the grass' },
	tomatoes: { file: 'Tomatoes in basket 2026 G3.jpg', author: 'George Chernilevsky', license: 'CC BY 4.0', altFr: 'Un panier de tomates mûres au potager', altEn: 'A basket of ripe tomatoes in the vegetable garden' },
	terrace: { file: 'Santorin (GR), Fira -- 2017 -- 2598.jpg', author: 'Dietmar Rabich', license: 'CC BY-SA 4.0', altFr: 'Une table et deux chaises sur une terrasse blanche', altEn: 'A table and two chairs on a white terrace' },
	cucumbers: { file: 'Cucurbita 2018 G1.jpg', author: 'George Chernilevsky', license: 'Public domain', altFr: 'Un panier de concombres et de courgettes', altEn: 'A basket of cucumbers and courgettes' },
	squashSand: { file: 'Cucurbita 2018 G3.jpg', author: 'George Chernilevsky', license: 'Public domain', altFr: 'Potimarrons rouges posés sur la terre', altEn: 'Red kuri squashes on the soil' },
	butternut: { file: 'Cucurbita moschata Butternut 2012 G2.jpg', author: 'George Chernilevsky', license: 'Public domain', altFr: 'Courges butternut, l’une ouverte en deux', altEn: 'Butternut squashes, one cut in half' },
	peas: { file: 'Peas in pods 2016 G1.jpg', author: 'George Chernilevsky', license: 'Public domain', altFr: 'Un panier de petits pois en cosses', altEn: 'A basket of peas in their pods' },
	oilJar: { file: "Pot en terre cuite pour huile d'olive, Lamta Tunisie mai 2013.jpg", author: "Habib M'henni", license: 'CC BY-SA 3.0', altFr: 'Une jarre en terre cuite à glaçure jaune', altEn: 'A terracotta jar with a yellow glaze' },
	teapots: { file: 'Dörfleins Töpferei Döppmann-20190714-RM-194552.jpg', author: 'Ermell', license: 'CC BY-SA 4.0', altFr: 'Des théières en grès rangées dans une étagère', altEn: 'Stoneware teapots arranged on a shelf' },
	wheel: { file: 'Pottery at the Chokhi Dhani Resort Panchkula 32.jpg', author: 'Kritzolina', license: 'CC BY-SA 4.0', altFr: 'Des mains façonnent un pot sur le tour', altEn: 'Hands shaping a pot on the wheel' },
	tagines: { file: 'Pottery wares at Sidi Bousaid 3.jpg', author: 'Emna Mizouni', license: 'CC BY-SA 4.0', altFr: 'Plats à tajine peints, empilés', altEn: 'Painted tagine dishes, stacked' },
	castella: { file: 'Castella 002.jpg', author: 'Ocdp', license: 'CC0', altFr: 'Deux parts de gâteau et un verre de thé', altEn: 'Two slices of cake and a glass of tea' },
	whiteTable: { file: 'Christmas table (Serbian cuisine).jpg', author: 'Petar Milošević', license: 'CC BY-SA 4.0', altFr: 'Une table nappée de blanc, bougie et plats partagés', altEn: 'A white-clothed table with a candle and shared dishes' },
	candles: { file: 'Манастир Моштаница-капела за паљење свећа (Moštanica Monastery, chapel for lighting candles).jpg', author: 'Petar Milošević', license: 'CC BY-SA 4.0', altFr: 'Trois bougies allumées dans l’obscurité', altEn: 'Three lit candles in the dark' },
	candleOrb: { file: 'Candle light projected through a glass orb.jpg', author: 'W.carter', license: 'CC BY-SA 4.0', altFr: 'La flamme d’une bougie à travers un globe de verre', altEn: 'A candle flame seen through a glass orb' },
	diningRoom: { file: "Restaurant in Place D'Youville, Quebec City.jpg", author: 'Wilfredor', license: 'CC0', altFr: 'La salle à manger sous les suspensions de papier', altEn: 'The dining room under paper pendant lamps' },
	breadWine: { file: 'Serbian Christmas meal.jpg', author: 'Petar Milošević', license: 'CC BY-SA 3.0', altFr: 'Pain, vin rouge et plats d’hiver sur la nappe', altEn: 'Bread, red wine and winter dishes on the tablecloth' },
	pastries: { file: 'Pincho Vitoria 16.jpg', author: 'Basotxerri', license: 'CC BY-SA 4.0', altFr: 'Bouchées sucrées alignées sur une planche', altEn: 'Sweet bites lined up on a board' },
	dessertWine: { file: 'Desserts and Wine.jpg', author: 'FranHogan', license: 'CC BY-SA 4.0', altFr: 'Un dessert aux fruits rouges et deux verres de vin', altEn: 'A red-fruit dessert and two glasses of wine' },
	cheeseAsh: { file: 'Soubois, WikiCheese Lausanne, 10-2016.jpg', author: 'Yann Forget', license: 'CC BY-SA 4.0', altFr: 'Un fromage cendré sur une ardoise', altEn: 'An ash-coated cheese on a slate' },
	oystersLemon: { file: 'Oysters lemons basket.jpg', author: 'Nikodem Nijaki', license: 'CC BY-SA 3.0', altFr: 'Huîtres et citrons dans une corbeille, fond noir', altEn: 'Oysters and lemons in a basket, black background' },
	oysterShells: { file: 'Crassostrea gigas 01.jpg', author: 'Llez', license: 'CC BY-SA 3.0', altFr: 'Coquilles d’huîtres creuses sur fond noir', altEn: 'Pacific oyster shells on a black background' },
	oysterPlate: { file: 'Plate of oysters with lemon.jpg', author: 'Wilfredor', license: 'CC0', altFr: 'Une assiette d’huîtres ouvertes et du citron', altEn: 'A plate of opened oysters with lemon' },
	oysterSingle: { file: 'Crassostrea gigas p1040848.jpg', author: 'David Monniaux', license: 'CC BY-SA 3.0', altFr: 'Une huître seule, en gros plan', altEn: 'A single oyster, close up' },
	oysterMarket: { file: 'Oysters for sale at Mercat de la Boqueria.jpg', author: 'Kritzolina', license: 'CC BY-SA 4.0', altFr: 'Des huîtres sur la glace', altEn: 'Oysters on ice' },
	knife: { file: 'Steelport 6-Inch Chef Knife (2026)-104A7331.jpg', author: 'Frank Schulenburg', license: 'CC BY-SA 4.0', altFr: 'Un couteau de chef posé sur la pierre', altEn: 'A chef’s knife resting on stone' },
	tableSet: { file: 'Restaurant table at Amantaka luxury Resort & Hotel in Luang Prabang Laos.jpg', author: 'Basile Morin', license: 'CC BY-SA 4.0', altFr: 'Une table dressée dans une salle blanche', altEn: 'A set table in a white room' },
	bakeryShelf: { file: 'Wikimania Photowalk 2025, Nairobi (20250808-P1048963).jpg', author: 'Matti Blume', license: 'CC BY-SA 4.0', altFr: 'Des miches de pain sur les étagères de la boulangerie', altEn: 'Loaves on the bakery shelves' },
	breadCrumb: { file: 'Brown bread made with dinkel wheat and millet 03.jpg', author: 'Kritzolina', license: 'CC BY-SA 4.0', altFr: 'La mie d’un pain d’épeautre et de millet', altEn: 'The crumb of a spelt and millet loaf' },
	whiteLoaves: { file: 'White Wheat Bread National Bakery Ooty Aug25 A7CR 07142.jpg', author: 'Timothy A. Gonsalves', license: 'CC BY-SA 4.0', altFr: 'Deux pains de mie sur leur sac en papier', altEn: 'Two sandwich loaves on their paper bag' },
	loaf: { file: 'Side Wheat Bread National Bakery Ooty Aug25 A7CR 07150.jpg', author: 'Timothy A. Gonsalves', license: 'CC BY-SA 4.0', altFr: 'Un pain doré sorti du four', altEn: 'A golden loaf fresh from the oven' },
	breadPlate: { file: 'Brown bread made with dinkel wheat and millet 02.jpg', author: 'Kritzolina', license: 'CC BY-SA 4.0', altFr: 'Deux tranches de pain sur une assiette bleue', altEn: 'Two slices of bread on a blue plate' },
	crumbDetail: { file: 'Dinkel-Vollkornbrot - Detail der Brotkrume.jpg', author: 'August Geyler', license: 'CC BY-SA 4.0', altFr: 'La mie alvéolée en très gros plan', altEn: 'The open crumb, very close up' },
	kifli: { file: 'Kifli made with spelt flour (Serbian cuisine).jpg', author: 'Petar Milošević', license: 'CC BY-SA 4.0', altFr: 'Petits pains roulés au sésame', altEn: 'Rolled buns with sesame' },
	percussion: { file: 'Salah Ammo Peter Gabis - Austrian World Music Awards 2014 10.jpg', author: 'Manfred Werner - Tsui', license: 'CC BY-SA 3.0', altFr: 'Un percussionniste sur scène, lumière violette', altEn: 'A percussionist on stage in purple light' },
	trombone: { file: '2022-05-22 50. Internationales Dixieland Festival Dresden 1DX 2056 by Stepro-2.jpg', author: 'Steffen Prößdorf', license: 'CC BY-SA 4.0', altFr: 'Un tromboniste joue, en gros plan', altEn: 'A trombonist playing, close up' },
	singer: { file: 'Simphiwe Dana Wien2007a.jpg', author: 'Tsui', license: 'CC BY-SA 3.0', altFr: 'Une chanteuse au micro, tête baissée', altEn: 'A singer at the microphone, head bowed' },
} satisfies Record<string, Photo>;

/** Commons rate-limits bursts (429, or a plain-text refusal): wait and retry. */
async function politeFetch(url: URL | string): Promise<Buffer> {
	const headers = { 'User-Agent': 'germinal-dev-seed/1.0 (local development data)' };
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(url, { headers });
		const body = Buffer.from(await response.arrayBuffer());
		const refused = !response.ok || body.subarray(0, 40).toString().includes('too many requests');
		if (!refused) return body;
		if (attempt === 8) throw new Error(`Commons kept refusing ${url} (${response.status})`);
		await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
	}
}

async function photoBytes(photo: Photo): Promise<Buffer> {
	await mkdir(CACHE, { recursive: true });
	const path = join(CACHE, photo.file.replace(/[^\w.-]+/g, '_'));
	try {
		await access(path);
		return readFile(path);
	} catch {
		// Not cached yet.
	}
	const api = new URL('https://commons.wikimedia.org/w/api.php');
	api.search = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${photo.file}`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '2000' }).toString();
	const info = JSON.parse((await politeFetch(api)).toString()) as { query: { pages: Record<string, { imageinfo?: { thumburl: string }[] }> } };
	const url = Object.values(info.query.pages)[0]?.imageinfo?.[0]?.thumburl;
	if (!url) throw new Error(`Commons has no file "${photo.file}"`);
	const bytes = await politeFetch(url);
	await writeFile(path, bytes);
	return bytes;
}

async function upload(photo: Photo, folder: 'events' | 'talents' = 'events'): Promise<{ url: string; key: string; size: number }> {
	const bytes = await photoBytes(photo);
	const key = `${folder}/${randomUUID()}.jpg`;
	await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key, Body: bytes, ContentType: 'image/jpeg' }));
	return { url: `${process.env.MEDIA_URL || process.env.S3_PUBLIC_URL}/${key}`, key, size: bytes.length };
}

// ---------------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------------

const TALENTS = [
	{ key: 'chef', portrait: P.knife, category: 'chefs', firstName: 'Margaux', lastName: 'Ferrand', roleFr: 'Cheffe', roleEn: 'Chef', city: 'Paris',
		bioFr: 'Margaux Ferrand cuisine au rythme des saisons et des producteurs qu’elle connaît par leur prénom. Formée chez des maisons classiques, elle a choisi les tables éphémères pour leur liberté : un lieu, un soir, un menu qui ne se refera pas.',
		bioEn: 'Margaux Ferrand cooks to the rhythm of the seasons and of growers she knows by name. Trained in classic kitchens, she chose pop-up tables for their freedom: one place, one night, a menu that will not be made again.',
		quoteFr: 'Un plat, c’est d’abord un endroit et un moment.', quoteEn: 'A dish is first of all a place and a moment.' },
	{ key: 'ceramist', portrait: P.wheel, category: 'ceramistes', firstName: 'Inès', lastName: 'Morel', roleFr: 'Céramiste', roleEn: 'Ceramicist', city: 'Montreuil',
		bioFr: 'Inès Morel tourne le grès et la faïence dans son atelier de Montreuil. Ses pièces, pensées pour la table, portent les traces du geste : un bord irrégulier, une glaçure qui coule, une empreinte de doigt laissée exprès.',
		bioEn: 'Inès Morel throws stoneware and earthenware in her Montreuil studio. Her pieces, made for the table, keep the marks of the hand: an uneven rim, a running glaze, a fingerprint left on purpose.',
		quoteFr: 'Un bol n’est fini que quand on mange dedans.', quoteEn: 'A bowl is only finished once someone eats from it.' },
	{ key: 'sommelier', portrait: P.wineGlassVines, category: 'chefs', firstName: 'Antoine', lastName: 'Lacaze', roleFr: 'Sommelier', roleEn: 'Sommelier', city: 'Montpellier',
		bioFr: 'Antoine Lacaze défend les vins vivants du Languedoc et les vignerons qui travaillent à la main. Il accorde les verres comme on écrit une partition, en laissant de la place au silence.',
		bioEn: 'Antoine Lacaze champions the living wines of the Languedoc and the growers who work by hand. He pairs glasses the way one writes a score, leaving room for silence.',
		quoteFr: null, quoteEn: null },
	{ key: 'baker', portrait: P.bakeryShelf, category: 'chefs', firstName: 'Lucas', lastName: 'Besson', roleFr: 'Boulanger', roleEn: 'Baker', city: 'Paris',
		bioFr: 'Lucas Besson travaille le levain et les farines anciennes de petits moulins. Son fournil est ouvert : on y apprend autant la patience que le pétrissage.',
		bioEn: 'Lucas Besson works with sourdough and heritage flours from small mills. His bakehouse is open: you learn patience there as much as kneading.',
		quoteFr: 'Le pain, c’est du temps qu’on partage.', quoteEn: 'Bread is time you share.' },
	{ key: 'musician', portrait: P.trombone, category: 'musiciens', firstName: 'Nora', lastName: 'Saïdi', roleFr: 'Musicienne', roleEn: 'Musician', city: 'Marseille',
		bioFr: 'Nora Saïdi est percussionniste et compositrice. Elle crée des pièces pour des lieux précis, écrites pour la résonance d’une salle et l’écoute d’un public assis à table.',
		bioEn: 'Nora Saïdi is a percussionist and composer. She creates pieces for specific places, written for the resonance of a room and a seated audience listening at the table.',
		quoteFr: null, quoteEn: null },
	{ key: 'scenographer', portrait: P.tableSet, category: 'scenographes', firstName: 'Paul', lastName: 'Arnaud', roleFr: 'Scénographe', roleEn: 'Set designer', city: 'Lyon',
		bioFr: 'Paul Arnaud conçoit des espaces pour une soirée : lumière, matières, circulation. Il travaille avec ce qui est déjà là et retire plus qu’il n’ajoute.',
		bioEn: 'Paul Arnaud designs spaces for a single evening: light, materials, movement. He works with what is already there and takes away more than he adds.',
		quoteFr: null, quoteEn: null },
] as const;

const CATEGORIES = [
	{ name: 'chefs', slug: 'chefs', displayNameFr: 'Cuisine', displayNameEn: 'Food', sortOrder: 1 },
	{ name: 'ceramistes', slug: 'ceramistes', displayNameFr: 'Céramique', displayNameEn: 'Ceramics', sortOrder: 2 },
	{ name: 'musiciens', slug: 'musiciens', displayNameFr: 'Musique', displayNameEn: 'Music', sortOrder: 3 },
	{ name: 'scenographes', slug: 'scenographes', displayNameFr: 'Scénographie', displayNameEn: 'Set design', sortOrder: 4 },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type TalentKey = (typeof TALENTS)[number]['key'];
type MenuSpec = { nameFr: string; nameEn: string; descriptionFr: string; descriptionEn: string };
type SeatingSpec = {
	time: string; badge?: 'vip' | 'limited' | 'featured' | 'popular' | 'best_value';
	/** Places left; 10% of capacity by default. */
	available?: number; waitlist?: boolean;
	titleFr?: string; titleEn?: string; descriptionFr?: string; descriptionEn?: string;
};
/** `price: null` is « prix communiqué prochainement »; `menu` overrides the Event's. */
type ServiceSpec = { kind: 'lunch' | 'dinner'; seatings: (string | SeatingSpec)[]; durationMinutes: number; price: number | null; menu?: MenuSpec };
type EventSpec = {
	titleFr: string; titleEn: string; subtitleFr?: string; subtitleEn?: string;
	descriptionFr: string; descriptionEn: string;
	venueNameFr: string; venueNameEn?: string; streetAddress: string; district?: string; city: string; postalCode: string;
	capacity: number; deposit: { type: 'none' | 'fixed' | 'percent'; value: number };
	menu: MenuSpec;
	days: { date: string; services: ServiceSpec[] }[];
	collaborators: { talent: TalentKey; roleFr: string }[];
	timings: { label: string; time: string }[];
	curator?: string; admissionFr?: string; admissionEn?: string;
	visuals: Photo[]; photos: Photo[];
	recapFr?: string; recapEn?: string;
	portfolio: boolean;
	/** The home page's Spotlight, unless the database already has one. */
	spotlight?: boolean;
	/** Booking Window opening, ISO with offset; null: open once published. */
	bookingOpensAt?: string;
	refundTiers?: { hoursBefore: number; percent: number }[];
	askDietary?: boolean;
};

const EVENTS: EventSpec[] = [
	{
		titleFr: 'Nuit des bougies', titleEn: 'Night of Candles',
		subtitleFr: 'Un dîner d’hiver éclairé à la seule flamme', subtitleEn: 'A winter dinner lit by flame alone',
		descriptionFr: 'Pour les deux nuits les plus longues de décembre, la salle s’éteint et deux cents bougies prennent le relais. Margaux Ferrand compose un menu d’hiver à partager, pensé pour se goûter à la lumière vacillante : bouillons, racines rôties, gibier, et un dessert qui se termine à la cuillère, dans le noir.\n\nPaul Arnaud a retiré tout le reste. Pas de musique, pas d’écran, des tables longues où l’on se passe les plats.',
		descriptionEn: 'For the two longest nights of December, the room goes dark and two hundred candles take over. Margaux Ferrand composes a winter menu to share, made to be tasted in flickering light: broths, roasted roots, game, and a dessert finished by spoon, in the dark.\n\nPaul Arnaud took everything else away. No music, no screens, long tables where dishes are passed hand to hand.',
		venueNameFr: 'Ancienne imprimerie', venueNameEn: 'The former printworks', streetAddress: '12 rue des Vinaigriers', district: 'Canal Saint-Martin', city: 'Paris', postalCode: '75010',
		capacity: 36, deposit: { type: 'fixed', value: 3000 },
		menu: { nameFr: 'Menu d’hiver', nameEn: 'Winter menu',
			descriptionFr: 'Bouillon de cèpes, huile de noisette\nBetteraves rôties au foin, crème crue\nChevreuil, céleri en croûte de sel, jus réduit\nFromages affinés\nPoire pochée au vin, à la cuillère',
			descriptionEn: 'Porcini broth, hazelnut oil\nHay-roasted beetroot, raw cream\nVenison, salt-baked celeriac, reduced jus\nAged cheeses\nWine-poached pear, eaten by spoon' },
		days: [
			{ date: '2024-12-20', services: [{ kind: 'dinner', seatings: ['20:00'], durationMinutes: 180, price: 9500 }] },
			{ date: '2024-12-21', services: [{ kind: 'dinner', seatings: ['20:00'], durationMinutes: 180, price: 9500 }] },
		],
		collaborators: [{ talent: 'chef', roleFr: 'Cuisine' }, { talent: 'scenographer', roleFr: 'Scénographie et lumière' }],
		timings: [{ label: 'Accueil', time: '19:45' }, { label: 'Dîner', time: '20:00' }],
		admissionFr: 'Table partagée. Le dîner se déroule à la seule lumière des bougies.', admissionEn: 'Shared table. Dinner is served by candlelight only.',
		visuals: [P.candles, P.candleOrb],
		// A full series (20 photos), to design the project page for 10–30 photos.
		photos: [P.diningRoom, P.breadWine, P.pastries, P.dessertWine, P.cheeseAsh, P.candles, P.candleOrb, P.whiteTable, P.glassesTable, P.tableSet,
			P.castella, P.cheeseSlate, P.knife, P.wineGlassVines, P.vineHills, P.crumbDetail, P.breadPlate, P.kifli, P.loaf, P.teapots],
		recapFr: 'Deux nuits, soixante-douze convives, et pas une ampoule allumée. On est arrivés en parlant fort, on est repartis en chuchotant.\n\nLe bouillon de cèpes a ouvert la soirée dans des bols tenus à deux mains. Le chevreuil est arrivé sur de grands plats que chacun faisait passer à son voisin. Au dessert, plusieurs tables ont soufflé leurs bougies d’elles-mêmes pour finir la poire dans le noir complet.\n\nCe qu’on retient : la lumière basse change la façon de manger. On goûte plus lentement, on écoute davantage.',
		recapEn: 'Two nights, seventy-two guests, and not a single bulb switched on. People arrived talking loudly and left whispering.\n\nThe porcini broth opened the evening in bowls held with both hands. The venison came on large platters that everyone passed to their neighbour. At dessert, several tables blew out their candles on their own to finish the pear in complete darkness.\n\nWhat stays with us: low light changes how people eat. They taste more slowly and listen more.',
		portfolio: true,
	},
	{
		titleFr: 'Iode', titleEn: 'Iode',
		subtitleFr: 'Huîtres, beurre noisette et vins de l’Atlantique', subtitleEn: 'Oysters, brown butter and Atlantic wines',
		descriptionFr: 'Un dîner autour de l’huître, crue, pochée, fumée, rôtie, avec trois ostréiculteurs de Marennes venus raconter leurs parcs. Antoine Lacaze accorde chaque service à un blanc de l’Atlantique.\n\nDeux services dans la soirée, à 19 h 30 et à 21 h 45, au comptoir et à la grande table.',
		descriptionEn: 'A dinner around the oyster, raw, poached, smoked and roasted, with three oyster farmers from Marennes who come to talk about their beds. Antoine Lacaze pairs each course with an Atlantic white.\n\nTwo sittings in the evening, at 7:30 and 9:45 pm, at the counter and the large table.',
		venueNameFr: 'Le comptoir du quai', venueNameEn: 'The quay counter', streetAddress: '4 quai de la Tournelle', city: 'Paris', postalCode: '75005',
		capacity: 24, deposit: { type: 'percent', value: 30 },
		menu: { nameFr: 'Menu Iode', nameEn: 'Iode menu',
			descriptionFr: 'Huîtres n°3 en trois affinages\nHuître pochée, beurre blanc au poivre de Timut\nHuître fumée au foin, pomme verte\nHuître rôtie, beurre noisette, sarrasin\nSablé breton, caramel au sel de Ré',
			descriptionEn: 'No. 3 oysters, three ages\nPoached oyster, Timut pepper beurre blanc\nHay-smoked oyster, green apple\nRoasted oyster, brown butter, buckwheat\nBreton shortbread, Ré salt caramel' },
		days: [{ date: '2025-02-21', services: [{ kind: 'dinner', seatings: ['19:30', '21:45'], durationMinutes: 120, price: 7800 }] }],
		collaborators: [{ talent: 'chef', roleFr: 'Cuisine' }, { talent: 'sommelier', roleFr: 'Accords' }],
		timings: [{ label: 'Premier service', time: '19:30' }, { label: 'Second service', time: '21:45' }],
		visuals: [P.oystersLemon, P.oysterShells], photos: [P.oysterPlate, P.oysterSingle, P.oysterMarket, P.knife, P.tableSet],
		recapFr: 'Quatre cents huîtres ouvertes en une soirée, et trois ostréiculteurs qui n’avaient jamais vu leurs huîtres rôties.\n\nLe second service s’est prolongé tard : les producteurs sont restés au comptoir pour répondre aux questions, carte des parcs à la main. L’huître fumée au foin a fait l’unanimité, le sablé aussi.',
		recapEn: 'Four hundred oysters opened in one evening, and three oyster farmers who had never seen their oysters roasted.\n\nThe second sitting ran late: the growers stayed at the counter to answer questions, map of the beds in hand. The hay-smoked oyster won everyone over, and so did the shortbread.',
		portfolio: true,
	},
	{
		titleFr: 'Terre & Table', titleEn: 'Earth & Table',
		subtitleFr: 'Une exposition de céramique où l’on dîne dans les pièces', subtitleEn: 'A ceramics exhibition where dinner is served in the pieces',
		descriptionFr: 'Inès Morel expose quarante pièces façonnées pour l’occasion : bols, plats, pichets, cruches. Pendant quatre jours, l’exposition est ouverte au public. Les deux soirs du week-end, les pièces quittent les socles et passent à table.\n\nMargaux Ferrand a écrit un menu pour ces formes précises : chaque plat a été pensé pour la pièce qui le porte.',
		descriptionEn: 'Inès Morel shows forty pieces made for the occasion: bowls, platters, jugs and pitchers. For four days the exhibition is open to the public. On the two weekend evenings, the pieces leave their plinths and go to the table.\n\nMargaux Ferrand wrote a menu for these exact shapes: every dish was designed for the piece that carries it.',
		venueNameFr: 'Galerie Rivoli', streetAddress: '28 rue de Rivoli', district: 'Le Marais', city: 'Paris', postalCode: '75004',
		capacity: 20, deposit: { type: 'percent', value: 100 },
		menu: { nameFr: 'Menu de l’exposition', nameEn: 'Exhibition menu',
			descriptionFr: 'Dans le bol à bord irrégulier : velouté de topinambour\nSur le grand plat : agneau de lait, pois chiches, citron confit\nDans la cruche : jus de carotte fermenté\nDans la coupelle : riz au lait, fleur d’oranger',
			descriptionEn: 'In the uneven bowl: Jerusalem artichoke velouté\nOn the large platter: milk-fed lamb, chickpeas, preserved lemon\nIn the jug: fermented carrot juice\nIn the small dish: rice pudding, orange blossom' },
		days: [
			{ date: '2025-03-21', services: [{ kind: 'dinner', seatings: ['20:00'], durationMinutes: 150, price: 12000 }] },
			{ date: '2025-03-22', services: [{ kind: 'dinner', seatings: ['20:00'], durationMinutes: 150, price: 12000 }] },
		],
		collaborators: [{ talent: 'ceramist', roleFr: 'Céramique' }, { talent: 'chef', roleFr: 'Cuisine' }, { talent: 'scenographer', roleFr: 'Scénographie' }],
		timings: [{ label: 'Exposition', time: '11:00–19:00' }, { label: 'Dîner', time: '20:00' }],
		curator: 'Inès Morel',
		visuals: [P.oilJar, P.teapots], photos: [P.wheel, P.tagines, P.castella, P.whiteTable],
		recapFr: 'Quarante pièces exposées, puis utilisées. Le moment le plus fort a été le passage des socles à la table : les invités ont vu les bols qu’ils avaient admirés l’après-midi arriver devant eux, remplis.\n\nTrente-deux pièces ont été vendues à la fin du week-end, la plupart à des convives qui avaient mangé dedans.',
		recapEn: 'Forty pieces shown, then used. The strongest moment was the move from plinth to table: guests saw the bowls they had admired in the afternoon arrive in front of them, filled.\n\nThirty-two pieces were sold by the end of the weekend, most of them to guests who had eaten from them.',
		portfolio: true,
	},
	{
		titleFr: 'Le Potager', titleEn: 'The Kitchen Garden',
		subtitleFr: 'Un déjeuner cueilli le matin même', subtitleEn: 'A lunch picked that same morning',
		descriptionFr: 'Un déjeuner servi au bout des rangs, dans un potager de la vallée de Chevreuse. On cueille avec le maraîcher à 11 h, Margaux Ferrand cuisine à côté, on passe à table à 12 h 30.\n\nPrévoir des chaussures qui ne craignent pas la terre.',
		descriptionEn: 'A lunch served at the end of the rows, in a kitchen garden in the Chevreuse valley. You pick with the grower at 11 am, Margaux Ferrand cooks alongside, and lunch starts at 12:30.\n\nBring shoes that don’t mind the soil.',
		venueNameFr: 'Potager de la Ferme des Molières', venueNameEn: 'Ferme des Molières kitchen garden', streetAddress: 'Chemin des Molières', city: 'Chevreuse', postalCode: '78460',
		capacity: 30, deposit: { type: 'none', value: 0 },
		menu: { nameFr: 'Menu du jour', nameEn: 'Menu of the day',
			descriptionFr: 'Selon la cueillette du matin. Exemple du 14 juin : petits pois crus et fromage frais, tomates anciennes, courgettes grillées au feu de bois, tarte aux fraises du potager.',
			descriptionEn: 'Depends on the morning’s picking. On 14 June: raw peas and fresh cheese, heirloom tomatoes, wood-grilled courgettes, garden strawberry tart.' },
		days: [
			{ date: '2025-06-14', services: [{ kind: 'lunch', seatings: ['12:30'], durationMinutes: 150, price: 6500 }] },
			{ date: '2025-06-15', services: [{ kind: 'lunch', seatings: ['12:30'], durationMinutes: 150, price: 6500 }] },
		],
		collaborators: [{ talent: 'chef', roleFr: 'Cuisine' }],
		timings: [{ label: 'Cueillette', time: '11:00' }, { label: 'Déjeuner', time: '12:30' }],
		admissionFr: 'En plein air. Navette depuis la gare de Saint-Rémy.', admissionEn: 'Outdoors. Shuttle from Saint-Rémy station.',
		visuals: [P.pumpkins, P.tomatoes], photos: [P.terrace, P.cucumbers, P.squashSand, P.butternut, P.peas],
		recapFr: 'Deux déjeuners sous un ciel de juin hésitant. Le samedi, l’averse est arrivée au dessert : tout le monde a fini la tarte sous la serre, serré contre les plants de tomates.\n\nLa cueillette a pris plus de temps que prévu, parce que personne ne voulait s’arrêter.',
		recapEn: 'Two lunches under an undecided June sky. On Saturday the shower arrived at dessert: everyone finished the tart in the greenhouse, squeezed between the tomato plants.\n\nThe picking took longer than planned, because nobody wanted to stop.',
		portfolio: true,
	},
	{
		titleFr: 'Vendanges', titleEn: 'Harvest',
		subtitleFr: 'Une table dans les vignes, le jour de la récolte', subtitleEn: 'A table in the vines on harvest day',
		descriptionFr: 'Le domaine termine ses vendanges et nous invite au milieu des rangs. Déjeuner avec l’équipe de récolte, dîner au coucher du soleil sur la colline, avec les vins du domaine choisis par Antoine Lacaze.\n\nDeux services, à 13 h et à 19 h 30. Le dîner se termine à la lampe tempête.',
		descriptionEn: 'The estate is finishing its harvest and invites us into the rows. Lunch with the picking team, dinner at sunset on the hill, with the estate’s wines chosen by Antoine Lacaze.\n\nTwo services, at 1 pm and 7:30 pm. Dinner ends by storm lantern.',
		venueNameFr: 'Domaine de la Garrigue', streetAddress: 'Route de Cabrerolles', city: 'Cabrerolles', postalCode: '34480',
		capacity: 40, deposit: { type: 'percent', value: 50 },
		menu: { nameFr: 'Menu des vendanges', nameEn: 'Harvest menu',
			descriptionFr: 'Raisin, chèvre frais et noix\nSoupe au pistou froide\nÉpaule d’agneau confite, sarments\nFromages de la vallée\nFigues rôties au moût',
			descriptionEn: 'Grapes, fresh goat cheese and walnuts\nCold pistou soup\nConfit lamb shoulder, vine cuttings\nCheeses from the valley\nFigs roasted in grape must' },
		days: [{ date: '2025-09-20', services: [
			{ kind: 'lunch', seatings: ['13:00'], durationMinutes: 150, price: 7000 },
			{ kind: 'dinner', seatings: ['19:30'], durationMinutes: 210, price: 11000 },
		] }],
		collaborators: [{ talent: 'sommelier', roleFr: 'Vins' }, { talent: 'chef', roleFr: 'Cuisine' }],
		timings: [{ label: 'Déjeuner', time: '13:00' }, { label: 'Dîner', time: '19:30' }],
		visuals: [P.vineSunset, P.vineMazet, P.wineGlassVines], photos: [P.vineWindmill, P.vineHills, P.vineFields, P.glassesTable, P.cheeseSlate],
		recapFr: 'Le dernier rang a été coupé à midi, juste avant le déjeuner. Les vendangeurs se sont assis avec les invités, encore en bottes.\n\nLe soir, la longue table a été dressée face au couchant. Les sarments de la matinée ont servi à cuire l’agneau.',
		recapEn: 'The last row was cut at noon, just before lunch. The pickers sat down with the guests, still in their boots.\n\nIn the evening, the long table was laid facing the sunset. The morning’s vine cuttings were used to cook the lamb.',
		portfolio: true,
	},
	{
		titleFr: 'Pain & Feu', titleEn: 'Bread & Fire',
		subtitleFr: 'Un atelier de levain et un déjeuner autour du four', subtitleEn: 'A sourdough workshop and lunch around the oven',
		descriptionFr: 'Lucas Besson ouvre son fournil pour un atelier d’une matinée : rafraîchir un levain, pétrir, façonner, enfourner. On déjeune ensuite autour du four à bois, avec le pain que l’on a fait.\n\nChaque participant repart avec son levain.',
		descriptionEn: 'Lucas Besson opens his bakehouse for a morning workshop: refreshing a starter, kneading, shaping, baking. Then lunch around the wood-fired oven, with the bread you made.\n\nEveryone leaves with their own starter.',
		venueNameFr: 'Le fournil de la rue Oberkampf', venueNameEn: 'The rue Oberkampf bakehouse', streetAddress: '91 rue Oberkampf', city: 'Paris', postalCode: '75011',
		capacity: 12, deposit: { type: 'percent', value: 100 },
		menu: { nameFr: 'Déjeuner du fournil', nameEn: 'Bakehouse lunch',
			descriptionFr: 'Votre pain, beurre cru et sel fumé\nSoupe de légumes au four\nTartine de légumes rôtis et fromage de chèvre\nBrioche du matin',
			descriptionEn: 'Your bread, raw butter and smoked salt\nOven-baked vegetable soup\nRoast vegetable and goat cheese tartine\nMorning brioche' },
		days: [
			{ date: '2026-04-11', services: [{ kind: 'lunch', seatings: ['12:30'], durationMinutes: 120, price: 9000 }] },
			{ date: '2026-04-12', services: [{ kind: 'lunch', seatings: ['12:30'], durationMinutes: 120, price: 9000 }] },
		],
		collaborators: [{ talent: 'baker', roleFr: 'Atelier et pain' }],
		timings: [{ label: 'Atelier', time: '09:00' }, { label: 'Déjeuner', time: '12:30' }],
		admissionFr: 'Atelier pour 12 personnes. Tablier fourni.', admissionEn: 'Workshop for 12. Apron provided.',
		visuals: [P.bakeryShelf, P.breadCrumb], photos: [P.whiteLoaves, P.loaf, P.breadPlate, P.crumbDetail, P.kifli],
		recapFr: 'Vingt-quatre pains façonnés, vingt-quatre formes différentes. Le four a été allumé à six heures, il était encore chaud à la fin du déjeuner.\n\nPlusieurs participants nous ont envoyé, quelques semaines plus tard, une photo de leur premier pain fait maison avec le levain de l’atelier.',
		recapEn: 'Twenty-four loaves shaped, twenty-four different shapes. The oven was lit at six, and it was still warm at the end of lunch.\n\nA few weeks later, several participants sent us a photo of their first home loaf made with the workshop starter.',
		portfolio: true,
	},
	{
		titleFr: 'Écoute', titleEn: 'Listening',
		subtitleFr: 'Un dîner en musique, pièce écrite pour la salle', subtitleEn: 'A dinner with music written for the room',
		descriptionFr: 'Nora Saïdi a composé une pièce pour percussions et voix, jouée entre les plats. Le dîner suit la partition : chaque mouvement annonce un service.',
		descriptionEn: 'Nora Saïdi composed a piece for percussion and voice, played between courses. Dinner follows the score: each movement announces a course.',
		venueNameFr: 'Salle des fêtes de Belleville', venueNameEn: 'Belleville hall', streetAddress: '7 rue de Belleville', city: 'Paris', postalCode: '75020',
		capacity: 50, deposit: { type: 'fixed', value: 2000 },
		menu: { nameFr: 'Menu en quatre mouvements', nameEn: 'Menu in four movements',
			descriptionFr: 'Ouverture : gaspacho de tomates vertes\nAndante : maquereau grillé, fenouil\nScherzo : poulet fermier, épices douces\nFinal : abricots rôtis, glace au lait',
			descriptionEn: 'Overture: green tomato gazpacho\nAndante: grilled mackerel, fennel\nScherzo: free-range chicken, mild spices\nFinale: roast apricots, milk ice cream' },
		days: [{ date: '2026-05-29', services: [{ kind: 'dinner', seatings: ['20:30'], durationMinutes: 180, price: 8500 }] }],
		collaborators: [{ talent: 'musician', roleFr: 'Composition et percussions' }, { talent: 'chef', roleFr: 'Cuisine' }],
		timings: [{ label: 'Portes', time: '20:00' }, { label: 'Dîner et concert', time: '20:30' }],
		visuals: [P.percussion, P.trombone, P.singer], photos: [],
		portfolio: false,
	},
	// Upcoming Events, for the bookable states of the Event page.
	{
		titleFr: 'Braises', titleEn: 'Embers', spotlight: true,
		subtitleFr: 'Deux jours de cuisine au feu de bois, du déjeuner au dernier service', subtitleEn: 'Two days of wood-fire cooking, from lunch to the last sitting',
		descriptionFr: 'Margaux Ferrand installe sa cuisine autour d’un foyer ouvert, au milieu de la salle. Tout ce qui est servi passe par le feu : les légumes enfouis sous la cendre, le poisson à la flamme, le pain cuit sur la pierre, le dessert fumé au dernier moment.\n\nInès Morel a tourné la vaisselle dans une terre qui supporte la braise. Paul Arnaud a réduit la lumière à celle du foyer et de quelques lampes basses. Antoine Lacaze accorde des vins de la vallée du Rhône, servis à la température de la pièce.\n\nLe vendredi soir, deux services. Le samedi, un déjeuner plus court et un dîner long, qui se termine quand le feu s’éteint.',
		descriptionEn: 'Margaux Ferrand sets up her kitchen around an open hearth in the middle of the room. Everything served goes through the fire: vegetables buried in the ashes, fish cooked over the flame, bread baked on the stone, dessert smoked at the last moment.\n\nInès Morel threw the tableware in a clay that can take the embers. Paul Arnaud reduced the light to the hearth and a few low lamps. Antoine Lacaze pairs wines from the Rhône valley, served at room temperature.\n\nOn Friday evening, two sittings. On Saturday, a shorter lunch and a long dinner that ends when the fire goes out.',
		venueNameFr: 'Ancienne imprimerie', venueNameEn: 'The former printworks', streetAddress: '12 rue des Vinaigriers', district: 'Canal Saint-Martin', city: 'Paris', postalCode: '75010',
		capacity: 28, deposit: { type: 'percent', value: 30 },
		refundTiers: [{ hoursBefore: 168, percent: 100 }, { hoursBefore: 48, percent: 50 }],
		askDietary: true,
		menu: { nameFr: 'Menu du foyer', nameEn: 'Hearth menu',
			descriptionFr: 'Pain cuit sur la pierre, beurre fumé\nPoireaux sous la cendre, vinaigrette aux noisettes\nTruite à la flamme, oseille\nCôte de cochon fermier, pommes de terre en croûte de braise\nFromage de chèvre passé au feu, miel\nPoire fumée, crème crue',
			descriptionEn: 'Stone-baked bread, smoked butter\nLeeks in the ashes, hazelnut vinaigrette\nFlame-cooked trout, sorrel\nFarm pork chop, ember-crusted potatoes\nFire-kissed goat cheese, honey\nSmoked pear, raw cream' },
		days: [
			{ date: '2026-11-27', services: [{ kind: 'dinner', durationMinutes: 150, price: 9500, seatings: [
				{ time: '19:30', available: 9 },
				{ time: '21:30', badge: 'vip', available: 4, titleFr: 'La table du chef', titleEn: 'The chef’s table',
					descriptionFr: 'Six places au comptoir, face au foyer. Un plat de plus, servi par Margaux Ferrand.', descriptionEn: 'Six seats at the counter, facing the hearth. One extra course, served by Margaux Ferrand.' },
			] }] },
			{ date: '2026-11-28', services: [
				{ kind: 'lunch', durationMinutes: 120, price: 6500, seatings: [{ time: '12:30', badge: 'limited', available: 3 }],
					menu: { nameFr: 'Déjeuner du foyer', nameEn: 'Hearth lunch',
						descriptionFr: 'Pain cuit sur la pierre, beurre fumé\nSoupe de courge cuite sous la cendre\nTruite à la flamme, oseille\nPoire fumée, crème crue',
						descriptionEn: 'Stone-baked bread, smoked butter\nSquash soup cooked under the ashes\nFlame-cooked trout, sorrel\nSmoked pear, raw cream' } },
				{ kind: 'dinner', durationMinutes: 210, price: 9500, seatings: [{ time: '20:00', available: 0, waitlist: true }] },
			] },
		],
		collaborators: [{ talent: 'chef', roleFr: 'Cuisine' }, { talent: 'ceramist', roleFr: 'Vaisselle' }, { talent: 'scenographer', roleFr: 'Scénographie et lumière' }, { talent: 'sommelier', roleFr: 'Vins' }],
		timings: [{ label: 'Accueil', time: '19:15' }, { label: 'Premier service', time: '19:30' }, { label: 'Second service', time: '21:30' }],
		curator: 'Margaux Ferrand',
		admissionFr: 'Table partagée autour du foyer. Tenue chaude conseillée : la salle n’est chauffée que par le feu.', admissionEn: 'Shared table around the hearth. Dress warmly: the room is heated by the fire alone.',
		// Many Visuals (16), to design the announcement for 10–30 photos.
		visuals: [P.knife, P.breadWine, P.cheeseAsh, P.glassesTable, P.dessertWine, P.candles, P.candleOrb, P.diningRoom,
			P.pastries, P.whiteTable, P.tableSet, P.oysterPlate, P.castella, P.cheeseSlate, P.loaf, P.kifli], photos: [],
		portfolio: false,
	},
	{
		titleFr: 'Atelier ouvert', titleEn: 'Open studio',
		descriptionFr: 'Inès Morel ouvre son atelier de Montreuil pour un déjeuner simple, servi dans les pièces de la dernière cuisson.',
		descriptionEn: 'Inès Morel opens her Montreuil studio for a simple lunch, served in the pieces from the latest firing.',
		venueNameFr: 'Atelier Inès Morel', venueNameEn: 'Inès Morel’s studio', streetAddress: '14 rue de l’Église', city: 'Montreuil', postalCode: '93100',
		capacity: 20, deposit: { type: 'none', value: 0 },
		menu: { nameFr: 'Déjeuner d’atelier', nameEn: 'Studio lunch',
			descriptionFr: 'Soupe du jour\nPain et fromages\nFruits de saison',
			descriptionEn: 'Soup of the day\nBread and cheeses\nSeasonal fruit' },
		days: [{ date: '2026-11-14', services: [{ kind: 'lunch', durationMinutes: 120, price: 0, seatings: [{ time: '12:30', available: 14 }] }] }],
		collaborators: [{ talent: 'ceramist', roleFr: 'Céramique' }],
		timings: [],
		visuals: [P.teapots], photos: [],
		portfolio: false,
	},
	{
		titleFr: 'Fournée de décembre', titleEn: 'December bake',
		subtitleFr: 'Le fournil ouvert pour les fêtes', subtitleEn: 'The bakehouse open for the holidays',
		descriptionFr: 'Lucas Besson rallume le four à bois pour deux journées de fête : un atelier le matin pour façonner sa brioche, un dîner le soir autour des pains de Noël.\n\nLe prix du déjeuner sera annoncé avec l’ouverture des réservations.',
		descriptionEn: 'Lucas Besson relights the wood-fired oven for two festive days: a morning workshop to shape your brioche, a dinner in the evening around the Christmas breads.\n\nThe lunch price will be announced when booking opens.',
		venueNameFr: 'Le fournil de la rue Oberkampf', venueNameEn: 'The rue Oberkampf bakehouse', streetAddress: '91 rue Oberkampf', city: 'Paris', postalCode: '75011',
		capacity: 16, deposit: { type: 'fixed', value: 2000 },
		bookingOpensAt: '2026-11-02T10:00:00+01:00',
		menu: { nameFr: 'Dîner du fournil', nameEn: 'Bakehouse dinner',
			descriptionFr: 'Pain d’épices et foie gras\nVelouté de châtaigne\nVolaille rôtie au four à pain\nBrioche des rois, crème d’agrumes',
			descriptionEn: 'Gingerbread and foie gras\nChestnut velouté\nBread-oven roast poultry\nKings’ brioche, citrus cream' },
		days: [
			{ date: '2026-12-19', services: [
				{ kind: 'lunch', durationMinutes: 150, price: null, seatings: [{ time: '12:00', available: 16 }] },
				{ kind: 'dinner', durationMinutes: 180, price: 8000, seatings: [{ time: '20:00', available: 16 }] },
			] },
			{ date: '2026-12-20', services: [{ kind: 'dinner', durationMinutes: 180, price: 8000, seatings: [{ time: '20:00', available: 16 }] }] },
		],
		collaborators: [{ talent: 'baker', roleFr: 'Atelier et pain' }],
		timings: [{ label: 'Atelier', time: '09:30' }, { label: 'Dîner', time: '20:00' }],
		visuals: [P.kifli, P.loaf], photos: [],
		portfolio: false,
	},
];

// ---------------------------------------------------------------------------

function minutes(clock: string): number {
	const [h, m] = clock.split(':').map(Number);
	return h * 60 + m;
}

function credits(spec: EventSpec): string {
	const all = [...spec.visuals, ...spec.photos];
	return `${SEED_MARK} Données de démonstration locales.\nPhotos Wikimedia Commons :\n${all.map((p) => `- ${p.file} — ${p.author} (${p.license})`).join('\n')}`;
}

async function clean() {
	const seeded = await db.select({ id: events.id }).from(events).where(like(events.internalNotes, `${SEED_MARK}%`));
	const ids = seeded.map((e) => e.id);
	if (ids.length > 0) {
		await db.delete(media).where(inArray(media.eventId, ids));
		await db.delete(events).where(inArray(events.id, ids));
	}
	for (const t of TALENTS) {
		const where = and(eq(talents.firstName, t.firstName), eq(talents.lastName, t.lastName));
		const rows = await db.select({ id: talents.id }).from(talents).where(where);
		if (rows.length > 0) await db.delete(media).where(inArray(media.talentId, rows.map((r) => r.id)));
		await db.delete(talents).where(where);
	}
	return ids.length;
}

async function seedTalents(): Promise<Record<TalentKey, { id: string; name: string; role: string }>> {
	const categoryIds: Record<string, string> = {};
	for (const c of CATEGORIES) {
		const existing = await db.query.talentCategories.findFirst({ where: eq(talentCategories.slug, c.slug) });
		categoryIds[c.name] = existing?.id ?? (await db.insert(talentCategories).values(c).returning())[0].id;
	}
	const out = {} as Record<TalentKey, { id: string; name: string; role: string }>;
	for (const t of TALENTS) {
		const [row] = await db.insert(talents).values({
			firstName: t.firstName, lastName: t.lastName, roleFr: t.roleFr, roleEn: t.roleEn,
			bioFr: t.bioFr, bioEn: t.bioEn, quoteFr: t.quoteFr, quoteEn: t.quoteEn,
			city: t.city, country: 'France', categoryId: categoryIds[t.category], published: true,
		}).returning();
		// Their work stands in for a portrait.
		const up = await upload(t.portrait, 'talents');
		const [photo] = await db.insert(media).values({
			type: 'image', url: up.url, s3Key: up.key, mimeType: 'image/jpeg', size: up.size,
			talentId: row.id, altFr: t.portrait.altFr, altEn: t.portrait.altEn,
		}).returning();
		await db.update(talents).set({ profileMediaId: photo.id }).where(eq(talents.id, row.id));
		out[t.key] = { id: row.id, name: `${t.firstName} ${t.lastName}`, role: t.roleFr };
	}
	return out;
}

async function seedEvent(spec: EventSpec, people: Awaited<ReturnType<typeof seedTalents>>) {
	const allDays = spec.days.map((d) => d.date).sort();
	// Only one Spotlight at a time, and never in place of one of your own.
	const spotlight = spec.spotlight ? !(await db.query.events.findFirst({ where: eq(events.isSpotlight, true), columns: { id: true } })) : false;
	const [event] = await db.insert(events).values({
		titleFr: spec.titleFr, titleEn: spec.titleEn, subtitleFr: spec.subtitleFr, subtitleEn: spec.subtitleEn,
		descriptionFr: spec.descriptionFr, descriptionEn: spec.descriptionEn,
		locationFr: `${spec.venueNameFr}, ${spec.city}`, locationEn: `${spec.venueNameEn ?? spec.venueNameFr}, ${spec.city}`,
		venueNameFr: spec.venueNameFr, venueNameEn: spec.venueNameEn ?? spec.venueNameFr,
		streetAddressFr: spec.streetAddress, streetAddressEn: spec.streetAddress,
		districtFr: spec.district ?? null, districtEn: spec.district ?? null,
		cityFr: spec.city, cityEn: spec.city, postalCode: spec.postalCode, countryFr: 'France', countryEn: 'France',
		timeZone: ZONE, startDate: dayStart(allDays[0], ZONE), endDate: dayEnd(allDays[allDays.length - 1], ZONE),
		collaborators: JSON.stringify(spec.collaborators.map((c) => ({ talentId: people[c.talent].id, name: people[c.talent].name, role: c.roleFr }))),
		timings: JSON.stringify(spec.timings),
		curatorFr: spec.curator ?? null, curatorEn: spec.curator ?? null,
		admissionInfoFr: spec.admissionFr ?? null, admissionInfoEn: spec.admissionEn ?? null,
		venueCapacity: spec.capacity, depositType: spec.deposit.type, depositValue: spec.deposit.value,
		currency: 'EUR', visibility: 'public', isPortfolio: spec.portfolio, isSpotlight: spotlight,
		recapFr: spec.recapFr ?? null, recapEn: spec.recapEn ?? null,
		internalNotes: credits(spec),
		bookingOpensAt: spec.bookingOpensAt ? new Date(spec.bookingOpensAt) : null,
		...(spec.refundTiers ? { refundPolicyTiers: spec.refundTiers } : {}),
		askDietaryRequirements: spec.askDietary ?? false,
	}).returning();

	const [menu] = await db.insert(eventMenus).values({ eventId: event.id, ...spec.menu }).returning();
	for (const day of spec.days) {
		const [dayRow] = await db.insert(eventDays).values({ eventId: event.id, date: day.date }).returning();
		for (const svc of day.services) {
			const menuId = svc.menu ? (await db.insert(eventMenus).values({ eventId: event.id, ...svc.menu }).returning())[0].id : menu.id;
			const [service] = await db.insert(eventServices).values({
				dayId: dayRow.id, kind: svc.kind, defaultSeatingDurationMinutes: svc.durationMinutes, menuId, priceAmount: svc.price,
			}).returning();
			for (const entry of svc.seatings) {
				const seating: SeatingSpec = typeof entry === 'string' ? { time: entry } : entry;
				const start = wallClockToInstant(day.date, minutes(seating.time), ZONE);
				await db.insert(eventSessions).values({
					eventId: event.id, serviceId: service.id,
					startTime: start, endTime: new Date(start.getTime() + svc.durationMinutes * 60_000),
					totalCapacity: spec.capacity, availableCapacity: seating.available ?? spec.capacity - Math.round(spec.capacity * 0.9),
					published: true, allowWaitlist: seating.waitlist ?? false, badgeType: seating.badge ?? 'none',
					titleFr: seating.titleFr ?? null, titleEn: seating.titleEn ?? null,
					descriptionFr: seating.descriptionFr ?? null, descriptionEn: seating.descriptionEn ?? null,
				});
			}
		}
	}

	let coverId: string | null = null;
	for (const [role, list] of [['visual', spec.visuals], ['event_photo', spec.photos]] as const) {
		for (const [i, photo] of list.entries()) {
			const up = await upload(photo);
			const [row] = await db.insert(media).values({
				type: 'image', url: up.url, s3Key: up.key, mimeType: 'image/jpeg', size: up.size,
				eventId: event.id, role, isCover: i === 0, altFr: photo.altFr, altEn: photo.altEn,
			}).returning();
			if (role === 'visual' && i === 0) coverId = row.id;
		}
	}
	if (coverId) await db.update(events).set({ coverMediaId: coverId }).where(eq(events.id, event.id));
	return event.id;
}

const removed = await clean();
if (removed) console.log(`Removed ${removed} previously seeded Events.`);
const people = await seedTalents();
for (const spec of EVENTS) {
	const id = await seedEvent(spec, people);
	const label = spec.portfolio ? 'Portfolio' : spec.days[0].date > new Date().toISOString().slice(0, 10) ? 'Upcoming ' : 'Past     ';
	console.log(`${label}  ${spec.days[0].date}  ${spec.titleFr}  /events/${id}`);
}
console.log(`Seeded ${EVENTS.length} Events and ${TALENTS.length} Talents.`);
await client.end();
