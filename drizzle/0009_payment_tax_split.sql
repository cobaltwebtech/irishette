ALTER TABLE `payment_refunds` ADD `room_amount` real;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD `fees_amount` real;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD `taxable_amount` real;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD `state_tax_amount` real;--> statement-breakpoint
ALTER TABLE `payment_refunds` ADD `city_tax_amount` real;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `room_amount` real;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `fees_amount` real;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `taxable_amount` real;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `state_tax_amount` real;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `city_tax_amount` real;