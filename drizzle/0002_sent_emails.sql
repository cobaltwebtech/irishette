CREATE TABLE `sent_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	`suppressed_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sent_emails_key_unique` ON `sent_emails` (`key`);--> statement-breakpoint
CREATE INDEX `sent_emails_sent_at_idx` ON `sent_emails` (`sent_at`);