import { expect, hardReload, showPasswordForm, test } from './fixtures';

// Logged out. Uses the local seed (pnpm db:reset:local).

for (const path of ['/', '/rooms/rose-room', '/rooms/texas-room']) {
	test(`hard reload of ${path} has no hydration or console errors`, async ({
		page,
		expectCleanConsole,
	}) => {
		await page.goto(path, { waitUntil: 'networkidle' });
		await hardReload(page);
		await expect(page.locator('body')).toBeVisible();
		expectCleanConsole();
	});
}

for (const path of ['/admin', '/account']) {
	test(`${path} redirects a logged-out visitor to login`, async ({ page }) => {
		await page.goto(path);
		await page.waitForURL(/\/auth\/login/);
		const url = new URL(page.url());
		expect(url.searchParams.get('redirect')).toBe(path);
	});
}

test('/account keeps the full href (path and query) in redirect', async ({
	page,
}) => {
	await page.goto('/account/past-bookings?page=2');
	await page.waitForURL(/\/auth\/login/);
	expect(new URL(page.url()).searchParams.get('redirect')).toBe(
		'/account/past-bookings?page=2',
	);
});

test.describe('auth pages (magic link first)', () => {
	test('login opens on the magic-link form, password is the alternative', async ({
		page,
		expectCleanConsole,
	}) => {
		// No networkidle: the Turnstile widget keeps polling.
		await page.goto('/auth/login');
		await expect(
			page.getByRole('button', { name: 'Email me a login link' }),
		).toBeVisible();
		await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
		await showPasswordForm(page);
		await expect(
			page.getByRole('link', { name: 'Forgot your password?' }),
		).toBeVisible();
		expectCleanConsole();
	});

	test('signup asks for a name and email first, password is optional', async ({
		page,
		expectCleanConsole,
	}) => {
		await page.goto('/auth/signup');
		await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Email me a sign-up link' }),
		).toBeVisible();
		await showPasswordForm(page);
		await expect(
			page.getByLabel('Confirm Password', { exact: true }),
		).toBeVisible();
		expectCleanConsole();
	});

	test('a wrong password shows an inline error and allows a retry', async ({
		page,
	}) => {
		await page.goto('/auth/login');
		await showPasswordForm(page);
		await page.getByLabel('Email', { exact: true }).fill('nobody@example.test');
		await page.getByLabel('Password', { exact: true }).fill('Wrong1Password');
		const submit = page.getByRole('button', { name: 'Login', exact: true });
		await expect(submit).toBeEnabled({ timeout: 30_000 });
		await submit.click();
		await expect(page.getByRole('alert')).toContainText(
			'Incorrect email or password.',
		);
		// Turnstile was reset (tokens are single-use) and issues a new token.
		await expect(submit).toBeEnabled({ timeout: 30_000 });
	});

	test('an expired magic link error is shown on the login page', async ({
		page,
	}) => {
		await page.goto('/auth/login?error=INVALID_TOKEN&redirect=%2Faccount');
		await expect(page.getByRole('alert')).toContainText(
			'This link is invalid or has already been used.',
		);
		// The error is dropped from the URL, the redirect is kept.
		await expect(page).toHaveURL(
			(url) =>
				!url.searchParams.has('error') &&
				url.searchParams.get('redirect') === '/account',
		);
	});

	test('reset password without a token asks for a new link', async ({
		page,
	}) => {
		await page.goto('/auth/reset-password');
		await expect(
			page.getByRole('heading', { name: 'Invalid Reset Link' }),
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Request a new reset link' }),
		).toBeVisible();
	});
});

test.describe('room calendar around an admin block', () => {
	// scripts/seed-local.sql blocks the Texas Room 2026-12-08..2026-12-10
	// (inclusive): the 10th is not a check-in day, the 11th is.
	const BLOCK_LAST_DAY = '2026-12-10';
	const DAY_AFTER = '2026-12-11';

	test('disables check-in on the block’s last day, allows the next day', async ({
		page,
	}) => {
		test.skip(
			new Date(`${DAY_AFTER}T00:00:00`) < new Date(),
			'Seed block is in the past; move the block in scripts/seed-local.sql.',
		);
		await page.goto('/rooms/texas-room', { waitUntil: 'networkidle' });

		const day = (iso: string) => page.locator(`td[data-day="${iso}"]`);
		// The calendar shows two months; step forward until December is visible.
		for (let i = 0; i < 10 && (await day(DAY_AFTER).count()) === 0; i++) {
			await page
				.getByRole('button', { name: /next month/i })
				.first()
				.click();
		}

		await expect(day(BLOCK_LAST_DAY)).toHaveAttribute('data-disabled', 'true');
		await expect(day(DAY_AFTER)).not.toHaveAttribute('data-disabled', 'true');
	});
});
