import { credentials, expect, hardReload, login, test } from './fixtures';

// Needs existing local accounts (see playwright.config.ts). Skipped otherwise.

test.describe('normal user', () => {
	test.skip(!credentials.user, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');

	test('email/password login reaches the account page', async ({
		page,
		expectCleanConsole,
	}) => {
		if (!credentials.user) return;
		await login(page, credentials.user);
		await page.goto('/account', { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(/\/account/);
		await hardReload(page);
		await expect(page).toHaveURL(/\/account/);
		expectCleanConsole();
	});

	test('a non-admin on /admin lands on / (no redirect loop)', async ({
		page,
	}) => {
		if (!credentials.user) return;
		await login(page, credentials.user);
		const response = await page.goto('/admin');
		expect(response?.ok()).toBe(true);
		await expect(page).toHaveURL((url) => url.pathname === '/');
	});

	test('a signed-in user on the auth pages goes to the (safe) redirect', async ({
		page,
	}) => {
		if (!credentials.user) return;
		await login(page, credentials.user);
		await page.goto('/auth/login?redirect=%2Faccount%2Fpast-bookings');
		await expect(page).toHaveURL(
			(url) => url.pathname === '/account/past-bookings',
		);
		await page.goto('/auth/signup?redirect=%2F%2Fevil.example');
		await expect(page).toHaveURL((url) => url.pathname === '/account');
		await page.goto('/auth/reset-password?token=abc');
		await expect(page).toHaveURL((url) => url.pathname === '/account');
	});

	test('hard reload of an own booking page', async ({
		page,
		expectCleanConsole,
	}) => {
		if (!credentials.user) return;
		await login(page, credentials.user);
		await page.goto('/account', { waitUntil: 'networkidle' });
		const link = page.locator('a[href^="/account/booking/"]').first();
		test.skip(
			(await link.count()) === 0,
			'The E2E user has no bookings to open.',
		);
		await link.click();
		await page.waitForURL(/\/account\/booking\/[0-9a-z]{16}$/);
		await hardReload(page);
		await expect(page).toHaveURL(/\/account\/booking\/[0-9a-z]{16}$/);
		expectCleanConsole();
	});
});

test.describe('admin', () => {
	test.skip(!credentials.admin, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

	for (const path of ['/admin', '/admin/property-management', '/admin/guest']) {
		test(`hard reload of ${path}`, async ({ page, expectCleanConsole }) => {
			if (!credentials.admin) return;
			await login(page, credentials.admin);
			await page.goto(path, { waitUntil: 'networkidle' });
			await hardReload(page);
			await expect(page).toHaveURL((url) => url.pathname === path);
			expectCleanConsole();
		});
	}
});
