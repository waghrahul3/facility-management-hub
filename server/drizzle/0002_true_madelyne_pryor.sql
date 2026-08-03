CREATE TYPE "public"."supplier_status" AS ENUM('PENDING', 'ACTIVE');--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "status" "supplier_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "facility_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "login_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "login_generated_by" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suppliers_facility_idx" ON "suppliers" USING btree ("facility_id");