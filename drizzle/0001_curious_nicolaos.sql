ALTER TABLE `bookings` ADD `taxable_amount` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `state_tax_rate` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `city_tax_rate` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `state_tax_amount` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `city_tax_amount` real;