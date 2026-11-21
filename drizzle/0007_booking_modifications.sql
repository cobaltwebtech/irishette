CREATE TABLE `booking_modifications` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`admin_user_id` text,
	`kind` text NOT NULL,
	`previous_room_id` text NOT NULL,
	`new_room_id` text NOT NULL,
	`previous_check_in_date` text NOT NULL,
	`previous_check_out_date` text NOT NULL,
	`new_check_in_date` text NOT NULL,
	`new_check_out_date` text NOT NULL,
	`previous_total` real NOT NULL,
	`new_total` real NOT NULL,
	`difference_cents` integer NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_refund_id` text,
	`status` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `booking_modifications_booking_idx` ON `booking_modifications` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_modifications_status_idx` ON `booking_modifications` (`status`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `last_modification_id` text;