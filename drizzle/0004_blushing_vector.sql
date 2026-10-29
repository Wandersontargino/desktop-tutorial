CREATE TABLE `crm_mfa` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret` text,
	`pending` text,
	`pending_until` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`last_step` integer DEFAULT -1 NOT NULL,
	`recovery` text DEFAULT '[]' NOT NULL
);
