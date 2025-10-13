PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_room_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text NOT NULL,
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
INSERT INTO `__new_room_availability`("id", "room_id", "check_in_date", "check_out_date", "is_available", "is_blocked", "source", "external_booking_id", "price_override", "created_at", "updated_at") SELECT "id", "room_id", "check_in_date", "check_out_date", "is_available", "is_blocked", "source", "external_booking_id", "price_override", "created_at", "updated_at" FROM `room_availability`;--> statement-breakpoint
DROP TABLE `room_availability`;--> statement-breakpoint
ALTER TABLE `__new_room_availability` RENAME TO `room_availability`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `room_availability_room_id_idx` ON `room_availability` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_availability_check_in_date_idx` ON `room_availability` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `room_availability_check_out_date_idx` ON `room_availability` (`check_out_date`);--> statement-breakpoint
CREATE INDEX `room_availability_source_idx` ON `room_availability` (`source`);--> statement-breakpoint
CREATE INDEX `room_availability_external_booking_idx` ON `room_availability` (`external_booking_id`);