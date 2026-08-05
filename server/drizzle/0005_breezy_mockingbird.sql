CREATE TABLE "subscription_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"previous_start" timestamp with time zone NOT NULL,
	"previous_end" timestamp with time zone NOT NULL,
	"new_start" timestamp with time zone NOT NULL,
	"new_end" timestamp with time zone NOT NULL,
	"renewed_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_renewed_by_users_id_fk" FOREIGN KEY ("renewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "renewals_subscription_idx" ON "subscription_renewals" USING btree ("subscription_id");