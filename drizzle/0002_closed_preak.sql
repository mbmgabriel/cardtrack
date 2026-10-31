CREATE TABLE `installment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`description` text NOT NULL,
	`principal_cents` integer NOT NULL,
	`months` integer NOT NULL,
	`monthly_cents` integer NOT NULL,
	`monthly_fee_cents` integer DEFAULT 0 NOT NULL,
	`first_payment_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `installment_plans_account_idx` ON `installment_plans` (`account_id`);