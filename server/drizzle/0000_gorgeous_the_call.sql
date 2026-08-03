CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'COLLECT', 'DISTRIBUTE', 'LOGIN', 'LOGOUT');--> statement-breakpoint
CREATE TYPE "public"."drop_status" AS ENUM('REGISTERED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."summary_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."supplier_payment_status" AS ENUM('PENDING', 'COLLECTED_FROM_FACILITY', 'DISTRIBUTED_TO_WORKERS');--> statement-breakpoint
CREATE TYPE "public"."toli_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'FACILITY_ADMIN', 'TOLI_LEADER', 'SUPPLIER');--> statement-breakpoint
CREATE TYPE "public"."work_entry_status" AS ENUM('DRAFT', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_role" text,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "bag_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"size_name" text NOT NULL,
	"weight_kg" integer NOT NULL,
	"is_global" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"city" text,
	"capacity" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bag_size_id" uuid NOT NULL,
	"facility_id" uuid,
	"rate_amount" integer NOT NULL,
	"is_global" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "supplier_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"drop_date" timestamp with time zone NOT NULL,
	"total_workers_dropped" integer DEFAULT 0,
	"rent_per_drop" integer DEFAULT 0 NOT NULL,
	"status" "drop_status" DEFAULT 'REGISTERED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_distributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_payment_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"toli_id" uuid NOT NULL,
	"amount_distributed" integer NOT NULL,
	"distribution_date" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"week_start_date" timestamp with time zone NOT NULL,
	"week_end_date" timestamp with time zone NOT NULL,
	"total_worker_earnings" integer DEFAULT 0 NOT NULL,
	"total_drops" integer DEFAULT 0 NOT NULL,
	"total_rent_charges" integer DEFAULT 0 NOT NULL,
	"net_payment" integer DEFAULT 0 NOT NULL,
	"collection_date" timestamp with time zone,
	"collection_status" "supplier_payment_status" DEFAULT 'PENDING' NOT NULL,
	"payment_method" "payment_method",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"contact_person" text,
	"address" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toli_leaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tolis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"leader_id" uuid,
	"leader_name" text NOT NULL,
	"worker_count" integer DEFAULT 0,
	"daily_charge" integer DEFAULT 0 NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"drop_id" uuid,
	"status" "toli_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"facility_id" uuid,
	"supplier_id" uuid,
	"toli_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_work_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"toli_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"supplier_id" uuid,
	"week_start_date" timestamp with time zone NOT NULL,
	"week_end_date" timestamp with time zone NOT NULL,
	"total_bags_processed" integer DEFAULT 0 NOT NULL,
	"total_work_amount" integer DEFAULT 0 NOT NULL,
	"daily_charge_agreed_amount" integer DEFAULT 0 NOT NULL,
	"total_earnings" integer DEFAULT 0 NOT NULL,
	"approval_status" "summary_status" DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"toli_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"work_date" timestamp with time zone NOT NULL,
	"bag_size_id" uuid NOT NULL,
	"quantity_bags" integer NOT NULL,
	"rate_per_bag" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"status" "work_entry_status" DEFAULT 'DRAFT' NOT NULL,
	"leader_confirmed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rates" ADD CONSTRAINT "rates_bag_size_id_bag_sizes_id_fk" FOREIGN KEY ("bag_size_id") REFERENCES "public"."bag_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rates" ADD CONSTRAINT "rates_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_drops" ADD CONSTRAINT "supplier_drops_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_drops" ADD CONSTRAINT "supplier_drops_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_distributions" ADD CONSTRAINT "supplier_payment_distributions_supplier_payment_id_supplier_payments_id_fk" FOREIGN KEY ("supplier_payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_distributions" ADD CONSTRAINT "supplier_payment_distributions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_distributions" ADD CONSTRAINT "supplier_payment_distributions_toli_id_tolis_id_fk" FOREIGN KEY ("toli_id") REFERENCES "public"."tolis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tolis" ADD CONSTRAINT "tolis_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tolis" ADD CONSTRAINT "tolis_leader_id_toli_leaders_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."toli_leaders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tolis" ADD CONSTRAINT "tolis_drop_id_supplier_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."supplier_drops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_summaries" ADD CONSTRAINT "weekly_work_summaries_toli_id_tolis_id_fk" FOREIGN KEY ("toli_id") REFERENCES "public"."tolis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_summaries" ADD CONSTRAINT "weekly_work_summaries_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_summaries" ADD CONSTRAINT "weekly_work_summaries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_toli_id_tolis_id_fk" FOREIGN KEY ("toli_id") REFERENCES "public"."tolis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_bag_size_id_bag_sizes_id_fk" FOREIGN KEY ("bag_size_id") REFERENCES "public"."bag_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "rates_bag_size_idx" ON "rates" USING btree ("bag_size_id");--> statement-breakpoint
CREATE INDEX "rates_facility_idx" ON "rates" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rates_bag_facility_unique" ON "rates" USING btree ("bag_size_id","facility_id");--> statement-breakpoint
CREATE INDEX "supplier_drops_supplier_date_idx" ON "supplier_drops" USING btree ("supplier_id","drop_date");--> statement-breakpoint
CREATE INDEX "supplier_drops_facility_idx" ON "supplier_drops" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "distributions_payment_idx" ON "supplier_payment_distributions" USING btree ("supplier_payment_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_week_idx" ON "supplier_payments" USING btree ("supplier_id","week_start_date");--> statement-breakpoint
CREATE INDEX "supplier_payments_facility_week_idx" ON "supplier_payments" USING btree ("facility_id","week_start_date");--> statement-breakpoint
CREATE INDEX "tolis_drop_date_idx" ON "tolis" USING btree ("drop_id","date");--> statement-breakpoint
CREATE INDEX "tolis_facility_date_idx" ON "tolis" USING btree ("facility_id","date");--> statement-breakpoint
CREATE INDEX "summaries_facility_week_idx" ON "weekly_work_summaries" USING btree ("facility_id","week_start_date");--> statement-breakpoint
CREATE INDEX "summaries_supplier_week_idx" ON "weekly_work_summaries" USING btree ("supplier_id","week_start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "summaries_toli_week_unique" ON "weekly_work_summaries" USING btree ("toli_id","week_start_date");--> statement-breakpoint
CREATE INDEX "work_entries_toli_date_idx" ON "work_entries" USING btree ("toli_id","work_date");--> statement-breakpoint
CREATE INDEX "work_entries_facility_date_idx" ON "work_entries" USING btree ("facility_id","work_date");