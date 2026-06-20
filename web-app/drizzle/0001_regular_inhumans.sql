ALTER TABLE "habit" ALTER COLUMN "emoji" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "habit" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
UPDATE "habit" SET "archivedAt" = "updatedAt" WHERE "isArchived" = true;--> statement-breakpoint
DELETE FROM "daily_record" WHERE "status" <> 'done' OR "completedAt" IS NULL;--> statement-breakpoint
ALTER TABLE "daily_record" ALTER COLUMN "completedAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_record" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "habit" DROP COLUMN "deadTime";--> statement-breakpoint
ALTER TABLE "habit" DROP COLUMN "isArchived";--> statement-breakpoint
DROP TYPE "public"."record_status";
