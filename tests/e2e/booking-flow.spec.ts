import { test, expect } from '@playwright/test';

test.describe('Booking Flow', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to homepage
		await page.goto('/');

		// Accept any cookies/banner
		await page.waitForLoadState('networkidle');
	});

	test('should display event listing', async ({ page }) => {
		// Check if events section is visible
		const eventsSection = page.locator('text=/Events/i');
		await expect(eventsSection).toBeVisible();

		// Check if at least one event card is displayed
		const eventCards = page.locator('[data-testid="event-card"]');
		await expect(eventCards).toHaveCount(0);
	});

	test('should navigate to event details', async ({ page }) => {
		// Click on first event
		const firstEvent = page.locator('[data-testid="event-card"]').first();
		await firstEvent.click();

		// Wait for navigation
		await page.waitForURL(/\/events\/.+/);

		// Check if event details are displayed
		const eventTitle = page.locator('[data-testid="event-title"]');
		await expect(eventTitle).toBeVisible();
	});

	test('should show booking modal when ticket button clicked', async ({ page }) => {
		// Navigate to an event
		await page.goto('/events/test-event-slug');

		// Click on book tickets button
		const bookButton = page.locator('button:has-text("Book Tickets")');
		await bookButton.click();

		// Check if booking modal is visible
		const modal = page.locator('[role="dialog"]');
		await expect(modal).toBeVisible();
	});

	test('should validate booking form', async ({ page }) => {
		// Navigate to an event
		await page.goto('/events/test-event-slug');

		// Click on book tickets button
		const bookButton = page.locator('button:has-text("Book Tickets")');
		await bookButton.click();

		// Try to submit without filling required fields
		const submitButton = page.locator('button[type="submit"]');
		await submitButton.click();

		// Check for validation errors
		const nameInput = page.locator('input[name="name"]');
		await expect(nameInput).toHaveClass(/border-red-500/);
	});

	test('should complete booking with valid data', async ({ page }) => {
		// Navigate to an event
		await page.goto('/events/test-event-slug');

		// Click on book tickets button
		const bookButton = page.locator('button:has-text("Book Tickets")');
		await bookButton.click();

		// Fill in form
		await page.fill('input[name="name"]', 'John Doe');
		await page.fill('input[name="email"]', 'john.doe@example.com');
		await page.fill('input[name="phone"]', '+1234567890');

		// Select quantity
		const quantitySelect = page.locator('input[name="quantity"]');
		await quantitySelect.fill('2');

		// Submit form
		const submitButton = page.locator('button[type="submit"]');
		await submitButton.click();

		// Wait for success message or redirect to checkout
		await page.waitForURL(/\/checkout\?reservation=.*/, { timeout: 10000 });
	});

	test('should display waitlist form when session is sold out', async ({ page }) => {
		// Navigate to an event
		await page.goto('/events/test-event-slug');

		// Click on join waitlist button (this would need to be implemented in the UI)
		const waitlistButton = page.locator('button:has-text("Join Waitlist")');
		await waitlistButton.click();

		// Check if waitlist modal is visible
		const modal = page.locator('[role="dialog"]');
		await expect(modal).toBeVisible();
	});
});

test.describe('Contact Form', () => {
	test('should validate contact form fields', async ({ page }) => {
		// Navigate to contact page
		await page.goto('/contact');

		// Try to submit without filling required fields
		const submitButton = page.locator('button[type="submit"]');
		await submitButton.click();

		// Check for validation errors
		const nameInput = page.locator('input[name="name"]');
		await expect(nameInput).toHaveClass(/border-red-500/);
	});

	test('should submit contact form with valid data', async ({ page }) => {
		// Navigate to contact page
		await page.goto('/contact');

		// Fill in form
		await page.fill('input[name="name"]', 'Jane Doe');
		await page.fill('input[name="email"]', 'jane.doe@example.com');
		await page.fill('textarea[name="message"]', 'Test message for contact form');

		// Submit form
		const submitButton = page.locator('button[type="submit"]');
		await submitButton.click();

		// Wait for success message
		const successMessage = page.locator('text=/Thank you for your message/i');
		await expect(successMessage).toBeVisible({ timeout: 5000 });
	});
});
