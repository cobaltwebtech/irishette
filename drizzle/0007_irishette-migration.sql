ALTER TABLE `room_availability` RENAME COLUMN "date" TO "check_in_date";--> statement-breakpoint
DROP INDEX `room_availability_date_idx`;--> statement-breakpoint
DROP INDEX `room_availability_room_id_date_unique`;--> statement-breakpoint
ALTER TABLE `room_availability` ADD `check_out_date` text;--> statement-breakpoint
CREATE INDEX `room_availability_check_in_date_idx` ON `room_availability` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `room_availability_check_out_date_idx` ON `room_availability` (`check_out_date`);--> statement-breakpoint
CREATE INDEX `room_availability_external_booking_idx` ON `room_availability` (`external_booking_id`);