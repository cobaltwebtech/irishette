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
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
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
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
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
	`stripe_customer_id` text,
	`phone_number` text,
	`phone_number_verified` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_public_id_unique` ON `user` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
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
	`stripe_session_id` text,
	`stripe_payment_intent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	`cancelled_at` integer,
	`cancellation_policy_id` text,
	`cancelled_by` text,
	`cancellation_reason` text,
	`refund_amount` real,
	`stripe_refund_id` text,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cancellation_policy_id`) REFERENCES `cancellation_policies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_public_id_unique` ON `bookings` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_confirmation_id_unique` ON `bookings` (`confirmation_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_id_idx` ON `bookings` (`room_id`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE INDEX `bookings_check_in_date_idx` ON `bookings` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `bookings_created_at_idx` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_expires_at_idx` ON `bookings` (`expires_at`);--> statement-breakpoint
CREATE INDEX `bookings_room_status_dates_idx` ON `bookings` (`room_id`,`status`,`check_in_date`,`check_out_date`);--> statement-breakpoint
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
CREATE TABLE `cancellation_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`check_in_time` text DEFAULT '16:00' NOT NULL,
	`timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cancellation_policies_active_idx` ON `cancellation_policies` (`is_active`);--> statement-breakpoint
CREATE TABLE `cancellation_policy_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`min_hours_before` integer NOT NULL,
	`refund_percent` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `cancellation_policies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cancellation_policy_tiers_policy_hours_unique` ON `cancellation_policy_tiers` (`policy_id`,`min_hours_before`);--> statement-breakpoint
CREATE TABLE `external_events` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`room_id` text NOT NULL,
	`uid` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`kind` text DEFAULT 'reserved' NOT NULL,
	`summary` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `ical_feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_events_feed_uid_unique` ON `external_events` (`feed_id`,`uid`);--> statement-breakpoint
CREATE INDEX `external_events_room_dates_idx` ON `external_events` (`room_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `ical_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`source` text NOT NULL,
	`label` text,
	`url` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`last_event_count` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ical_feeds_room_url_unique` ON `ical_feeds` (`room_id`,`url`);--> statement-breakpoint
CREATE INDEX `ical_feeds_room_id_idx` ON `ical_feeds` (`room_id`);--> statement-breakpoint
CREATE TABLE `ical_sync_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_log_id` text NOT NULL,
	`room_id` text NOT NULL,
	`feed_id` text,
	`action` text NOT NULL,
	`uid` text NOT NULL,
	`kind` text,
	`start_date` text,
	`end_date` text,
	`previous_start_date` text,
	`previous_end_date` text,
	`booking_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sync_log_id`) REFERENCES `ical_sync_log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feed_id`) REFERENCES `ical_feeds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ical_sync_changes_log_idx` ON `ical_sync_changes` (`sync_log_id`);--> statement-breakpoint
CREATE INDEX `ical_sync_changes_room_created_idx` ON `ical_sync_changes` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ical_sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`feed_id` text,
	`platform` text NOT NULL,
	`trigger` text DEFAULT 'cron' NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`events_in_feed` integer,
	`added` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`conflicts` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`sync_duration` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feed_id`) REFERENCES `ical_feeds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ical_sync_log_room_created_idx` ON `ical_sync_log` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ical_sync_log_created_idx` ON `ical_sync_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`base_price` real NOT NULL,
	`service_fee_rate` real DEFAULT 0.12 NOT NULL,
	`state_tax_rate` real DEFAULT 0.06 NOT NULL,
	`city_tax_rate` real DEFAULT 0.07 NOT NULL,
	`max_guests` integer DEFAULT 2 NOT NULL,
	`ical_export_token` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_public_id_unique` ON `room` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_slug_unique` ON `room` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_ical_export_token_unique` ON `room` (`ical_export_token`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `room_pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`rule_type` text NOT NULL,
	`value` real NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_active` integer DEFAULT true,
	`activated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_pricing_rules_room_id_idx` ON `room_pricing_rules` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_date_range_idx` ON `room_pricing_rules` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_active_idx` ON `room_pricing_rules` (`is_active`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_room_active_dates_idx` ON `room_pricing_rules` (`room_id`,`is_active`,`start_date`,`end_date`);