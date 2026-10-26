CREATE TABLE `gdpr_request` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`shopId` integer NOT NULL,
	`shopDomain` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`triggeredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`processedAt` integer
);
--> statement-breakpoint
CREATE INDEX `gdpr_request_shopId_idx` ON `gdpr_request` (`shopId`);