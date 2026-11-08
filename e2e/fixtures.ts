import {
	test as base,
	type BrowserContext,
	expect,
	type Page,
} from '@playwright/test';

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

/**
 * Switches an auth page from the magic-link form to the password form. Retries
 * the click: in dev, a click before hydration does nothing.
 */
export async function showPasswordForm(page: Page) {
	const password = page.getByLabel('Password', { exact: true });
	await expect(async () => {
		await page.getByRole('button', { name: 'Use a password instead' }).click();
		await expect(password).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: 30_000 });
}

/** Session cookies per account, so each account signs in through the UI once. */
const sessionCookies = new Map<
	string,
	Awaited<ReturnType<BrowserContext['cookies']>>
>();

/**
 * Signs in with email + password on /auth/login (waits for Turnstile). The
 * first call per account uses the form; later calls reuse its session cookies
 * (Better Auth allows 5 password sign-ins per minute per IP).
 */
export async function login(
	page: Page,
	account: { email: string; password: string },
) {
	const cookies = sessionCookies.get(account.email);
	if (cookies) {
		await page.context().addCookies(cookies);
		return;
	}
	await page.goto('/auth/login');
	await showPasswordForm(page);
	await page.getByLabel('Email', { exact: true }).fill(account.email);
	await page.getByLabel('Password', { exact: true }).fill(account.password);
	const submit = page.getByRole('button', { name: 'Login', exact: true });
	// Enabled once Turnstile has issued a token.
	await expect(submit).toBeEnabled({ timeout: 30_000 });
	await submit.click();
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/'));
	sessionCookies.set(account.email, await page.context().cookies());
}

/** Reloads the current page with the browser cache bypassed (hard reload). */
export async function hardReload(page: Page) {
	const client = await page.context().newCDPSession(page);
	await client.send('Network.setCacheDisabled', { cacheDisabled: true });
	await page.reload({ waitUntil: 'networkidle' });
	await client.send('Network.setCacheDisabled', { cacheDisabled: false });
}
