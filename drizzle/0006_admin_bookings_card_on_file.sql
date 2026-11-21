ALTER TABLE `bookings` ADD `created_by_admin_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `late_same_day` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `card_consent_at` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `card_consent_by` text;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `stripe_payment_method_id` text;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `card_brand` text;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `card_last4` text;