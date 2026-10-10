CREATE TABLE "push_registration_rate_limit" (
	"userId" text PRIMARY KEY NOT NULL,
	"windowStartedAt" timestamp with time zone NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_registration_rate_limit" ADD CONSTRAINT "push_registration_rate_limit_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;