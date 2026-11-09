import { setupNetwork } from '@msw/cloudflare';

/**
 * Outbound request mock for the workers project. Started in setup.ts with
 * `onUnhandledFrame: 'error'` (msw 3's name for `onUnhandledRequest`), so any
 * request a test did not mock (Stripe, Resend, iCal feeds, ...) fails loudly
 * instead of reaching the network.
 */
export const network = setupNetwork();
network.configure({ onUnhandledFrame: 'error' });
