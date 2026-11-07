import { test as base, expect, type Page } from '@playwright/test';

/**
 * `test` with a page that records console errors, page errors and React
 * hydration warnings. Call `expectCleanConsole()` at the end of a test.
 */
export const test = base.extend<{
	consoleErrors: string[];
	expectCleanConsole: () => void;
}>({
	consoleErrors: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('console', (message) => {
			const text = message.text();
			if (message.type() === 'error' || /hydrat|did not match/i.test(text)) {
				errors.push(`[console.${message.type()}] ${text}`);
			}
		});
		page.on('pageerror', (error) =>
			errors.push(`[pageerror] ${error.message}`),
		);
		await use(errors);
	},
	expectCleanConsole: async ({ consoleErrors }, use) => {
		await use(() => {
			// Third-party noise that is not ours (Stripe.js/Turnstile iframes).
			const ours = consoleErrors.filter(
				(e) => !/stripe\.com|challenges\.cloudflare\.com|turnstile/i.test(e),
			);
			expect(ours, ours.join('\n')).toEqual([]);
		});
	},
});

export { expect };

export const credentials = {
	user:
		process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD
			? {
					email: process.env.E2E_USER_EMAIL,
					password: process.env.E2E_USER_PASSWORD,
				}
			: null,
	admin:
		process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
			? {
					email: process.env.E2E_ADMIN_EMAIL,
					password: process.env.E2E_ADMIN_PASSWORD,
				}
			: null,
};

/** Signs in with email + password on /auth/login (waits for Turnstile). */
export async function login(
	page: Page,
	account: { email: string; password: string },
) {
	await page.goto('/auth/login');
	await page.getByRole('button', { name: 'Login with Password' }).click();
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	const submit = page.getByRole('button', { name: 'Login', exact: true });
	// Enabled once Turnstile has issued a token.
	await expect(submit).toBeEnabled({ timeout: 30_000 });
	await submit.click();
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/'));
}

/** Reloads the current page with the browser cache bypassed (hard reload). */
export async function hardReload(page: Page) {
	const client = await page.context().newCDPSession(page);
	await client.send('Network.setCacheDisabled', { cacheDisabled: true });
	await page.reload({ waitUntil: 'networkidle' });
	await client.send('Network.setCacheDisabled', { cacheDisabled: false });
}
