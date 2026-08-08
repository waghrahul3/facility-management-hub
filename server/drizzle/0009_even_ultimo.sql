CREATE TABLE "supplier_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"advance_date" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "advance_deducted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "advance_balance_before" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_advances" ADD CONSTRAINT "supplier_advances_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_advances" ADD CONSTRAINT "supplier_advances_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_advances" ADD CONSTRAINT "supplier_advances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_advances_supplier_idx" ON "supplier_advances" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_advances_facility_idx" ON "supplier_advances" USING btree ("facility_id");