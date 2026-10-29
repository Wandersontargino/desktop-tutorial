CREATE TABLE `crm_whatsapp_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`response` text NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_whatsapp_sessions` (
	`sender` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`step` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
