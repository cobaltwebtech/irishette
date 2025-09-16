PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_room` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`base_price` real NOT NULL,
	`is_active` integer DEFAULT true,
	`airbnb_ical_url` text,
	`expedia_ical_url` text,
	`last_airbnb_sync` integer,
	`last_expedia_sync` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_room`("id", "slug", "base_price", "is_active", "airbnb_ical_url", "expedia_ical_url", "last_airbnb_sync", "last_expedia_sync", "created_at", "updated_at") SELECT "id", "slug", "base_price", "is_active", "airbnb_ical_url", "expedia_ical_url", "last_airbnb_sync", "last_expedia_sync", "created_at", "updated_at" FROM `room`;--> statement-breakpoint
DROP TABLE `room`;--> statement-breakpoint
ALTER TABLE `__new_room` RENAME TO `room`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `room_slug_unique` ON `room` (`slug`);