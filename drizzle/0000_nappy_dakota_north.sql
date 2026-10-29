CREATE TABLE `crm_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`before_value` text,
	`after_value` text,
	`operation` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_audit_record` ON `crm_audit` (`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_intake_status` ON `crm_intake` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`leadership` text NOT NULL,
	`coordinator` text NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_links_token_unique` ON `crm_links` (`token`);--> statement-breakpoint
CREATE TABLE `crm_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_records` (
	`id` text PRIMARY KEY NOT NULL,
	`leadership` text NOT NULL,
	`coordinator` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_records_leadership` ON `crm_records` (`leadership`,`deleted`);--> statement-breakpoint
CREATE INDEX `idx_crm_records_coordinator` ON `crm_records` (`coordinator`,`deleted`);--> statement-breakpoint
CREATE INDEX `idx_crm_records_title` ON `crm_records` (`title`);--> statement-breakpoint
CREATE TABLE `crm_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_sessions_user` ON `crm_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `crm_state` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`commit_token` text DEFAULT '' NOT NULL,
	`seeded` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`password_hash` text,
	`salt` text,
	`version` integer DEFAULT 1 NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_users_email_unique` ON `crm_users` (`email`);