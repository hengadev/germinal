import { test, expect } from '@playwright/test';

// Mock-data constants (from src/lib/mock-data.ts)
const SPOTLIGHT_SLUG = 'summer-music-festival-2026';
// General Admission session for the spotlight event
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';
const BOOKING_URL = `/events/${SPOTLIGHT_SLUG}/book/${SESSION_ID}`;

// The spotlight event is excluded from the /events listing, so use a different one.
// "Tech Innovation Summit" (id: '2') is non-spotlight and appears in the listing.
const LISTING_SLUG = 'tech-innovation-summit';
const LISTING_TITLE_EN = 'Tech Innovation Summit';

// ---------------------------------------------------------------------------
// Events listing
// ---------------------------------------------------------------------------

test.describe('Events listing page', () => {
	test('renders page heading and event cards', async ({ page }) => {
		await page.goto('/events');
		// h1 exists (text is locale-dependent; don't assert specific string)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// EventCard renders event.titleEn directly (not via $t), so always English
		await expect(page.getByText(LISTING_TITLE_EN)).toBeVisible();
	});

	test('event card navigates to event detail', async ({ page }) => {
		await page.goto('/events');
		// Use the link href to target the right card (avoids ambiguity in card text)
		await page.locator(`a[href="/events/${LISTING_SLUG}"]`).first().click();
		await expect(page).toHaveURL(`/events/${LISTING_SLUG}`);
	});
});

// ---------------------------------------------------------------------------
// Event detail page
// ---------------------------------------------------------------------------

test.describe('Event detail page', () => {
	test.beforeEach(async ({ page }) => {
		// Use the listing event — spotlight is accessible too but this is more representative
		await page.goto(`/events/${LISTING_SLUG}`);
	});

	test('renders an h1 hero heading', async ({ page }) => {
		// Text depends on $locale === 'en' string-check in EventDetailLayout;
		// Playwright locale 'en-US' won't satisfy that, so just verify the element exists.
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	test('has back-to-all-events link', async ({ page }) => {
		// Check by href; link text is i18n so don't assert specific wording
		await expect(page.locator('a[href="/events"]').first()).toBeVisible();
	});

	test('back link returns to events listing', async ({ page }) => {
		await page.locator('a[href="/events"]').first().click();
		await expect(page).toHaveURL('/events');
	});
});

// ---------------------------------------------------------------------------
// Spotlight page — session selector + booking modal
// ---------------------------------------------------------------------------

test.describe('Spotlight page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/spotlight');
	});

	test('renders spotlight hero and Book Tickets section', async ({ page }) => {
		// h1 exists (title text uses $locale==='en' check, not $t(); don't assert wording)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// "Book Tickets" h2 is rendered via $t(), which correctly resolves en-US → en
		await expect(
			page.getByRole('heading', { name: 'Book Tickets' }).first()
		).toBeVisible();
	});

	test('shows session cards with Book Now buttons', async ({ page }) => {
		// Summer Music Festival 2026 has multiple published sessions, all with capacity > 0
		await expect(
			page.getByRole('button', { name: 'Book Now' }).first()
		).toBeVisible();
	});

	test('Book Now opens booking modal with form fields', async ({ page }) => {
		await page.getByRole('button', { name: 'Book Now' }).first().click();
		// Modal renders — heading and core inputs should appear
		await expect(page.getByLabel('Full Name')).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Number of Tickets')).toBeVisible();
	});

	test('booking modal Cancel button closes the modal', async ({ page }) => {
		await page.getByRole('button', { name: 'Book Now' }).first().click();
		await expect(page.getByLabel('Full Name')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByLabel('Full Name')).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Standalone booking page — mock mode (isMockMode: true)
// ---------------------------------------------------------------------------

test.describe('Booking page (mock mode)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(BOOKING_URL);
	});

	test('renders form and demo-mode banner', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Book Tickets', level: 1 })).toBeVisible();
		// Demo mode banner is always visible on the standalone booking page
		await expect(page.getByText(/demo mode/i)).toBeVisible();
		await expect(page.getByLabel('Full Name')).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Number of Tickets')).toBeVisible();
	});

	test('submit button is disabled until name and email are filled', async ({ page }) => {
		const submit = page.getByRole('button', { name: 'Book (Demo)' });
		await expect(submit).toBeDisabled();

		await page.getByLabel('Full Name').fill('Test User');
		await expect(submit).toBeDisabled(); // email still missing

		await page.getByLabel('Email').fill('test@playwright.dev');
		await expect(submit).toBeEnabled();
	});

	test('submitting valid form shows mock-mode success screen', async ({ page }) => {
		await page.getByLabel('Full Name').fill('Playwright Tester');
		await page.getByLabel('Email').fill('pw@playwright.dev');
		await page.getByRole('button', { name: 'Book (Demo)' }).click();

		// Success screen shows demo-mode copy and a "Back to event" link
		await expect(
			page.getByText(/demo mode.*your booking would be confirmed/i)
		).toBeVisible({ timeout: 5000 });
		await expect(page.getByRole('link', { name: /back to event/i })).toBeVisible();
	});

	test('promo code input is visible', async ({ page }) => {
		await expect(page.getByPlaceholder(/ex.*SUMMER20/i)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Appliquer' })).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

test.describe('Contact form', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/contact');
	});

	test('renders contact form with all required fields', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /get in touch/i, level: 1 })).toBeVisible();
		await expect(page.getByLabel('Name')).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel(/tell us/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
	});

	test('renders inquiry type filter buttons', async ({ page }) => {
		await expect(page.getByRole('button', { name: /collaboration/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /new project/i })).toBeVisible();
	});
});
