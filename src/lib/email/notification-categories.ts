// Admin email notification categories: what an admin can turn email on or
// off for in /admin/settings. Every admin email (src/lib/email/email-service.ts)
// names one category; an admin with no stored preference gets every category.
// Stored per admin in notification_preferences (src/db/notification-schema.ts).
// Shared by the schema, the server and the settings page. No server imports.

export const notificationCategories = [
	'new_booking',
	'booking_cancelled',
	'refund_issued',
	'payment_problem',
	'calendar_sync',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export const NOTIFICATION_CATEGORY_INFO: Record<
	NotificationCategory,
	{ label: string; description: string }
> = {
	new_booking: {
		label: 'New bookings',
		description: 'A guest’s payment is confirmed and the booking is made.',
	},
	booking_cancelled: {
		label: 'Cancellations',
		description: 'A booking is cancelled by a guest, an admin or the system.',
	},
	refund_issued: {
		label: 'Refunds made in Stripe',
		description: 'A refund is issued from the Stripe Dashboard.',
	},
	payment_problem: {
		label: 'Payment problems',
		description:
			'A refund fails, or a payment is released because the dates were taken.',
	},
	calendar_sync: {
		label: 'Calendar sync problems',
		description:
			'An imported calendar feed stops syncing, or an imported reservation overlaps a booking.',
	},
};

/** Every category on: what an admin with no stored preferences gets. */
export function defaultNotificationPreferences(): Record<
	NotificationCategory,
	boolean
> {
	return Object.fromEntries(
		notificationCategories.map((category) => [category, true]),
	) as Record<NotificationCategory, boolean>;
}
