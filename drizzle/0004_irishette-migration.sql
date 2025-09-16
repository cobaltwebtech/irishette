ALTER TABLE `bookings` ADD `stripe_session_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `stripe_payment_intent_id` text;