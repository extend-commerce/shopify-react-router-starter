ALTER TABLE "session" ALTER COLUMN "accessToken" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "firstName" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "lastName" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "accountOwner" boolean;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "collaborator" boolean;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "emailVerified" boolean;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "refreshToken" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "refreshTokenExpires" timestamp;