CREATE TABLE `crm_leadership_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`leadership` text NOT NULL,
	`coordinator` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`commit_token` text NOT NULL,
	`updated_at` text NOT NULL
);
