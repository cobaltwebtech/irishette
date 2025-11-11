ALTER TABLE `bookings` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `bookings_expires_at_idx` ON `bookings` (`expires_at`);