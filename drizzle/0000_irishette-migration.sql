CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`stripe_customer_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text NOT NULL,
	`number_of_nights` integer NOT NULL,
	`number_of_guests` integer NOT NULL,
	`base_amount` real NOT NULL,
	`tax_amount` real DEFAULT 0,
	`fees_amount` real DEFAULT 0,
	`discount_amount` real DEFAULT 0,
	`total_amount` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`guest_phone` text,
	`special_requests` text,
	`internal_notes` text,
	`stripe_customer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_confirmation_id_unique` ON `bookings` (`confirmation_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_id_idx` ON `bookings` (`room_id`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE INDEX `bookings_check_in_date_idx` ON `bookings` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `bookings_created_at_idx` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_customer_id` text,
	`amount` real NOT NULL,
	`status` text NOT NULL,
	`payment_method` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_stripe_payment_intent_id_unique` ON `payment_transactions` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE TABLE `ical_sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`bookings_processed` integer DEFAULT 0,
	`error_message` text,
	`sync_duration` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`base_price` real NOT NULL,
	`is_active` integer DEFAULT true,
	`airbnb_ical_url` text,
	`booking_com_ical_url` text,
	`last_airbnb_sync` integer,
	`last_booking_com_sync` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_slug_unique` ON `room` (`slug`);--> statement-breakpoint
CREATE TABLE `room_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`date` text NOT NULL,
	`is_available` integer DEFAULT true,
	`is_blocked` integer DEFAULT false,
	`source` text DEFAULT 'direct',
	`external_booking_id` text,
	`price_override` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_availability_room_id_idx` ON `room_availability` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_availability_date_idx` ON `room_availability` (`date`);--> statement-breakpoint
CREATE INDEX `room_availability_source_idx` ON `room_availability` (`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_availability_room_id_date_unique` ON `room_availability` (`room_id`,`date`);--> statement-breakpoint
CREATE TABLE `room_blocked_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
