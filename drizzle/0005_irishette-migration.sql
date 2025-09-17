CREATE TABLE `room_pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`rule_type` text NOT NULL,
	`value` real NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`priority` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`min_nights` integer,
	`max_nights` integer,
	`days_of_week` text,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_pricing_rules_room_id_idx` ON `room_pricing_rules` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_date_range_idx` ON `room_pricing_rules` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_active_idx` ON `room_pricing_rules` (`is_active`);--> statement-breakpoint
CREATE INDEX `room_pricing_rules_priority_idx` ON `room_pricing_rules` (`priority`);--> statement-breakpoint
ALTER TABLE `room` ADD `service_fee_rate` real DEFAULT 0.12 NOT NULL;--> statement-breakpoint
ALTER TABLE `room` ADD `state_tax_rate` real DEFAULT 0.06 NOT NULL;--> statement-breakpoint
ALTER TABLE `room` ADD `city_tax_rate` real DEFAULT 0.07 NOT NULL;