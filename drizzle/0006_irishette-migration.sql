DROP INDEX `room_pricing_rules_priority_idx`;--> statement-breakpoint
ALTER TABLE `room_pricing_rules` DROP COLUMN `priority`;--> statement-breakpoint
ALTER TABLE `room_pricing_rules` DROP COLUMN `min_nights`;--> statement-breakpoint
ALTER TABLE `room_pricing_rules` DROP COLUMN `max_nights`;--> statement-breakpoint
ALTER TABLE `room_pricing_rules` DROP COLUMN `description`;