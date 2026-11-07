import { expect, hardReload, test } from './fixtures';

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
