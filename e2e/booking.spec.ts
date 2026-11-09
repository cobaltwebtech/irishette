import { credentials, expect, login, test } from './fixtures';

// Full booking with a Stripe sandbox test card. Creates a real sandbox
// Checkout Session and a local booking, so it only runs with E2E_STRIPE=1.

test.describe('booking with a test card', () => {
	test.skip(
		!credentials.user || process.env.E2E_STRIPE !== '1',
		'Set E2E_USER_EMAIL, E2E_USER_PASSWORD and E2E_STRIPE=1',
	);
	test.setTimeout(180_000);

	test('books the Rose Room and lands on the confirmation page', async ({
		page,
	}) => {
		if (!credentials.user) return;
		await login(page, credentials.user);
		await page.goto('/rooms/rose-room', { waitUntil: 'networkidle' });

		// Pick the first two consecutive enabled days at least two weeks out.
		const enabled = page.locator(
			'td[data-day]:not([data-disabled="true"]):not([data-hidden="true"])',
		);
		const days = await enabled.evaluateAll((cells) =>
			cells.map((c) => c.getAttribute('data-day') as string),
		);
		const minDay = new Date(Date.now() + 14 * 86_400_000)
			.toISOString()
			.slice(0, 10);
		const next = (iso: string) => {
			const d = new Date(`${iso}T00:00:00Z`);
			d.setUTCDate(d.getUTCDate() + 1);
			return d.toISOString().slice(0, 10);
		};
		const checkIn = days.find((d) => d >= minDay && days.includes(next(d)));
		test.skip(!checkIn, 'No free two-night window is visible.');
		if (!checkIn) return;
		await page.locator(`td[data-day="${checkIn}"] button`).click();
		await page.locator(`td[data-day="${next(checkIn)}"] button`).click();

		await page.getByRole('button', { name: /Book Rose Room Now/ }).click();
		await page.waitForURL(/\/booking/);

		await page.getByLabel('Full Name *').fill('E2E Guest');
		await page.getByLabel('Phone Number *').fill('5555550100');
		await page.getByRole('button', { name: 'Continue to Payment' }).click();

		// Stripe Payment Element (iframe).
		const stripeFrame = page
			.frameLocator('iframe[name^="__privateStripeFrame"]')
			.first();
		await stripeFrame.getByLabel(/card number/i).fill('4242424242424242');
		await stripeFrame.getByLabel(/expiration/i).fill('12 / 34');
		await stripeFrame.getByLabel(/security code|cvc/i).fill('123');
		const zip = stripeFrame.getByLabel(/zip|postal/i);
		if (await zip.count()) await zip.fill('76446');

		await page.getByLabel('Policies Acknowledgement').check();
		await page.getByRole('button', { name: /^Pay \$/ }).click();

		// The Checkout Session is confirmed, then the confirmation page runs
		// bookings.confirmCheckout with ?session_id=... and shows the status.
		await page.waitForURL(
			/\/booking\/confirmation\/[0-9a-z]{16}\?session_id=cs_test_/,
			{
				timeout: 90_000,
			},
		);
		await expect(
			page.getByRole('heading', { name: 'Your Booking is Confirmed!' }),
		).toBeVisible({ timeout: 30_000 });
	});
});
