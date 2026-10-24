CREATE TABLE `shop` (
	`id` integer PRIMARY KEY NOT NULL,
	`myshopifyDomain` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`contactEmail` text NOT NULL,
	`shopOwnerName` text NOT NULL,
	`primaryDomain` text NOT NULL,
	`countryCode` text,
	`shopifyPlan` text NOT NULL,
	`shopifyPlus` integer NOT NULL,
	`partnerDevelopment` integer NOT NULL,
	`installedAt` integer NOT NULL,
	`uninstalledAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_myshopifyDomain_unique` ON `shop` (`myshopifyDomain`);