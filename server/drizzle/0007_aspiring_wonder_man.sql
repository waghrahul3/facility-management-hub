CREATE TYPE "public"."sales_order_status" AS ENUM('PENDING', 'PARTIALLY_DISPATCHED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('TRUCK', 'CONTAINER', 'TRACTOR', 'TEMPO', 'OTHER');--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity_bags" integer NOT NULL,
	"rate_per_bag" integer NOT NULL,
	"total_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"vehicle_number" text,
	"destination" text,
	"dispatch_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_method" text DEFAULT 'CASH' NOT NULL,
	"reference_number" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"onion_category" text,
	"bag_size_id" uuid NOT NULL,
	"quantity_bags" integer NOT NULL,
	"rate_per_bag" integer NOT NULL,
	"total_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"company_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"status" "sales_order_status" DEFAULT 'PENDING' NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_bag_size_id_bag_sizes_id_fk" FOREIGN KEY ("bag_size_id") REFERENCES "public"."bag_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyers_company_idx" ON "buyers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatch_items_dispatch_idx" ON "dispatch_items" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "dispatches_order_idx" ON "dispatches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "dispatches_facility_idx" ON "dispatches" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "sales_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_orders_company_idx" ON "sales_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sales_orders_facility_idx" ON "sales_orders" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "sales_orders_buyer_idx" ON "sales_orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");