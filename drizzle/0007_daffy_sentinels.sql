CREATE TABLE `crm_automatic_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`revision` integer NOT NULL,
	`records` integer NOT NULL,
	`archived` integer NOT NULL,
	`key_id` text NOT NULL,
	`digest` text NOT NULL,
	`verified_at` text,
	`source` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auto_backups_created` ON `crm_automatic_backups` (`created_at`);--> statement-breakpoint
CREATE TABLE `platform_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`route` text NOT NULL,
	`status` integer NOT NULL,
	`latency_bucket` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`total_ms` integer NOT NULL,
	`max_ms` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_platform_metrics_window` ON `platform_metrics` (`window_start`);--> statement-breakpoint
CREATE TABLE `crm_quality_reviews` (
	`record_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
