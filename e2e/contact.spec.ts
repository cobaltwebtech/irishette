import { expect, test } from './fixtures';

// The public contact form. Submitting it in `pnpm dev` sends a REAL email
// through Cloudflare Email Service (to CONTACT_EMAIL), so that test runs only with
// E2E_CONTACT=1.

/** Retries the first click: in dev, a click before hydration does nothing. */
async function submitUntilValidated(page: import('@playwright/test').Page) {
	await expect(async () => {
		await page.getByRole('button', { name: 'Send Message' }).click();
		await expect(page.getByText('Please enter your name')).toBeVisible({
			timeout: 1_000,
		});
	}).toPass({ timeout: 30_000 });
}

test('the contact page reloads cleanly and prefills ?booking=', async ({
	page,
	expectCleanConsole,
}) => {
	await page.goto('/contact?booking=abc234');
	// Not hardReload: Turnstile keeps the network busy (no networkidle).
	await page.reload();
	await expect(page.getByLabel('Booking Confirmation ID')).toHaveValue(
		'abc234',
	);
	expectCleanConsole();
});

test('the contact form shows field errors without sending', async ({
	page,
}) => {
	await page.goto('/contact');
	await submitUntilValidated(page);
	await expect(
		page.getByText('Message must be at least 10 characters'),
	).toBeVisible();
	await page.getByLabel('Subject *').fill('Two\nlines');
	await page.getByLabel('Email Address *').fill('not-an-email');
	await page.getByRole('button', { name: 'Send Message' }).click();
	await expect(
		page.getByText('Please enter a valid email address'),
	).toBeVisible();
});

test('submitting the contact form shows the thank-you state', async ({
	page,
}) => {
	test.skip(
		process.env.E2E_CONTACT !== '1',
		'Sends a real email through Cloudflare Email Service; set E2E_CONTACT=1',
	);
	await page.goto('/contact');
	await page.getByLabel('Name *').fill('E2E Test');
	await page.getByLabel('Email Address *').fill('e2e@example.test');
	await page.getByLabel('Subject *').fill('E2E contact form test');
	await page
		.getByLabel('Message *')
		.fill('This is an automated test message. Please ignore.');
	const send = page.getByRole('button', { name: 'Send Message' });
	await expect(async () => {
		await send.click();
		await expect(
			page.getByText('Thanks, your message is on its way'),
		).toBeVisible({ timeout: 5_000 });
	}).toPass({ timeout: 30_000 });
});
