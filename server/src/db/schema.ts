import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "FACILITY_ADMIN",
  "TOLI_LEADER",
  "SUPPLIER",
]);

export const dropStatusEnum = pgEnum("drop_status", ["REGISTERED", "COMPLETED"]);

export const supplierStatusEnum = pgEnum("supplier_status", ["PENDING", "ACTIVE"]);

export const toliStatusEnum = pgEnum("toli_status", ["ACTIVE", "COMPLETED"]);

export const workEntryStatusEnum = pgEnum("work_entry_status", [
  "DRAFT",
  "APPROVED",
  "PAID",
]);

export const summaryStatusEnum = pgEnum("summary_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const supplierPaymentStatusEnum = pgEnum("supplier_payment_status", [
  "PENDING",
  "COLLECTED_FROM_FACILITY",
  "DISTRIBUTED_TO_WORKERS",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "BANK_TRANSFER"]);

export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "REJECT",
  "COLLECT",
  "DISTRIBUTE",
  "LOGIN",
  "LOGOUT",
]);

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  password_hash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  // COMPANY_ADMIN -> which company they administer
  company_id: uuid("company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  // FACILITY_ADMIN -> which facility they administer
  facility_id: uuid("facility_id"),
  // SUPPLIER -> which supplier record they belong to
  supplier_id: uuid("supplier_id"),
  // TOLI_LEADER -> which toli they lead
  toli_id: uuid("toli_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull().unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Companies (trading companies; a company owns one or more facilities)
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  contact_person: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Which trading company this facility belongs to (NULL = standalone facility)
    company_id: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    location: text("location").notNull(),
    city: text("city"),
    capacity: integer("capacity").default(0),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("facilities_company_idx").on(t.company_id)]
);

// ---------------------------------------------------------------------------
// Bag sizes & rates
// ---------------------------------------------------------------------------

export const bagSizes = pgTable("bag_sizes", {
  id: uuid("id").defaultRandom().primaryKey(),
  size_name: text("size_name").notNull(),
  weight_kg: integer("weight_kg").notNull(),
  is_global: boolean("is_global").default(true).notNull(),
  created_by: uuid("created_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rates = pgTable(
  "rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bag_size_id: uuid("bag_size_id")
      .notNull()
      .references(() => bagSizes.id, { onDelete: "cascade" }),
    // NULL facility_id means this is the global rate for the bag size
    facility_id: uuid("facility_id").references(() => facilities.id, {
      onDelete: "cascade",
    }),
    rate_amount: integer("rate_amount").notNull(),
    is_global: boolean("is_global").default(true).notNull(),
    effective_from: timestamp("effective_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    effective_to: timestamp("effective_to", { withTimezone: true }),
    created_by: uuid("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("rates_bag_size_idx").on(t.bag_size_id),
    index("rates_facility_idx").on(t.facility_id),
    uniqueIndex("rates_bag_facility_unique").on(t.bag_size_id, t.facility_id),
  ]
);

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    contact_person: text("contact_person"),
    address: text("address"),
    city: text("city"),
    // PENDING = registered by a facility, awaiting Super Admin login activation.
    // ACTIVE  = login generated (or globally registered) — selectable at any facility.
    status: supplierStatusEnum("status").default("ACTIVE").notNull(),
    // Which facility registered this supplier (NULL = global registry entry).
    facility_id: uuid("facility_id").references(() => facilities.id, {
      onDelete: "set null",
    }),
    login_generated_at: timestamp("login_generated_at", { withTimezone: true }),
    login_generated_by: uuid("login_generated_by"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("suppliers_facility_idx").on(t.facility_id)]
);

// ---------------------------------------------------------------------------
// Supplier drops
// ---------------------------------------------------------------------------

export const supplierDrops = pgTable(
  "supplier_drops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    drop_date: timestamp("drop_date", { withTimezone: true }).notNull(),
    total_workers_dropped: integer("total_workers_dropped").default(0),
    // Negotiated rent for this drop (₹) — variable per drop
    rent_per_drop: integer("rent_per_drop").default(0).notNull(),
    status: dropStatusEnum("status").default("REGISTERED").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("supplier_drops_supplier_date_idx").on(t.supplier_id, t.drop_date),
    index("supplier_drops_facility_idx").on(t.facility_id),
  ]
);

// ---------------------------------------------------------------------------
// Toli leaders & tolis
// ---------------------------------------------------------------------------

export const toliLeaders = pgTable("toli_leaders", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tolis = pgTable(
  "tolis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    leader_id: uuid("leader_id").references(() => toliLeaders.id, {
      onDelete: "set null",
    }),
    // Denormalized for quick access
    leader_name: text("leader_name").notNull(),
    worker_count: integer("worker_count").default(0),
    daily_charge: integer("daily_charge").default(0).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    // Drop that brought these workers in (may be null if no supplier involved)
    drop_id: uuid("drop_id").references(() => supplierDrops.id, {
      onDelete: "set null",
    }),
    status: toliStatusEnum("status").default("ACTIVE").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tolis_drop_date_idx").on(t.drop_id, t.date),
    index("tolis_facility_date_idx").on(t.facility_id, t.date),
  ]
);

// ---------------------------------------------------------------------------
// Work entries
// ---------------------------------------------------------------------------

export const workEntries = pgTable(
  "work_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    toli_id: uuid("toli_id")
      .notNull()
      .references(() => tolis.id, { onDelete: "cascade" }),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    work_date: timestamp("work_date", { withTimezone: true }).notNull(),
    bag_size_id: uuid("bag_size_id")
      .notNull()
      .references(() => bagSizes.id),
    // Free-text onion category (e.g. "Red", "White", "Rose", "Grower Grade")
    onion_category: text("onion_category"),
    quantity_bags: integer("quantity_bags").notNull(),
    // Snapshot of the applicable rate on that date (facility rate overrides global)
    rate_per_bag: integer("rate_per_bag").notNull(),
    total_amount: integer("total_amount").notNull(),
    status: workEntryStatusEnum("status").default("DRAFT").notNull(),
    // Toli leader confirmation timestamp (leader accepts the recorded work)
    leader_confirmed_at: timestamp("leader_confirmed_at", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("work_entries_toli_date_idx").on(t.toli_id, t.work_date),
    index("work_entries_facility_date_idx").on(t.facility_id, t.work_date),
  ]
);

// ---------------------------------------------------------------------------
// Weekly work summaries
// ---------------------------------------------------------------------------

export const weeklyWorkSummaries = pgTable(
  "weekly_work_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    toli_id: uuid("toli_id")
      .notNull()
      .references(() => tolis.id, { onDelete: "cascade" }),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    // Supplier whose drop brought this toli in (tracked for payment)
    supplier_id: uuid("supplier_id").references(() => suppliers.id),
    week_start_date: timestamp("week_start_date", { withTimezone: true }).notNull(),
    week_end_date: timestamp("week_end_date", { withTimezone: true }).notNull(),
    total_bags_processed: integer("total_bags_processed").default(0).notNull(),
    total_work_amount: integer("total_work_amount").default(0).notNull(),
    daily_charge_agreed_amount: integer("daily_charge_agreed_amount")
      .default(0)
      .notNull(),
    total_earnings: integer("total_earnings").default(0).notNull(),
    approval_status: summaryStatusEnum("approval_status")
      .default("PENDING")
      .notNull(),
    approved_by: uuid("approved_by"),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("summaries_facility_week_idx").on(t.facility_id, t.week_start_date),
    index("summaries_supplier_week_idx").on(t.supplier_id, t.week_start_date),
    uniqueIndex("summaries_toli_week_unique").on(t.toli_id, t.week_start_date),
  ]
);

// ---------------------------------------------------------------------------
// Supplier payments & distributions
// ---------------------------------------------------------------------------

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    week_start_date: timestamp("week_start_date", { withTimezone: true }).notNull(),
    week_end_date: timestamp("week_end_date", { withTimezone: true }).notNull(),
    total_worker_earnings: integer("total_worker_earnings").default(0).notNull(),
    total_drops: integer("total_drops").default(0).notNull(),
    total_rent_charges: integer("total_rent_charges").default(0).notNull(),
    net_payment: integer("net_payment").default(0).notNull(),
    collection_date: timestamp("collection_date", { withTimezone: true }),
    collection_status: supplierPaymentStatusEnum("collection_status")
      .default("PENDING")
      .notNull(),
    payment_method: paymentMethodEnum("payment_method"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("supplier_payments_supplier_week_idx").on(t.supplier_id, t.week_start_date),
    index("supplier_payments_facility_week_idx").on(t.facility_id, t.week_start_date),
    uniqueIndex("supplier_payments_supplier_week_unique").on(
      t.supplier_id,
      t.week_start_date
    ),
  ]
);

export const supplierPaymentDistributions = pgTable(
  "supplier_payment_distributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplier_payment_id: uuid("supplier_payment_id")
      .notNull()
      .references(() => supplierPayments.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    toli_id: uuid("toli_id")
      .notNull()
      .references(() => tolis.id),
    amount_distributed: integer("amount_distributed").notNull(),
    distribution_date: timestamp("distribution_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    payment_method: paymentMethodEnum("payment_method").default("CASH").notNull(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("distributions_payment_idx").on(t.supplier_payment_id)]
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id"),
    user_role: text("user_role"),
    action: auditActionEnum("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id"),
    old_values: jsonb("old_values"),
    new_values: jsonb("new_values"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    ip_address: text("ip_address"),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity_type, t.entity_id),
    index("audit_timestamp_idx").on(t.timestamp),
  ]
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type Facility = typeof facilities.$inferSelect;
export type BagSize = typeof bagSizes.$inferSelect;
export type Rate = typeof rates.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type SupplierDrop = typeof supplierDrops.$inferSelect;
export type Toli = typeof tolis.$inferSelect;
export type ToliLeader = typeof toliLeaders.$inferSelect;
export type WorkEntry = typeof workEntries.$inferSelect;
export type WeeklyWorkSummary = typeof weeklyWorkSummaries.$inferSelect;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type SupplierPaymentDistribution = typeof supplierPaymentDistributions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

// ---------------------------------------------------------------------------
// Subscriptions & billing
// ---------------------------------------------------------------------------

export const subscriptionTypeEnum = pgEnum("subscription_type", [
  "COMPANY",
  "SUPPLIER",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "EXPIRED",
  "PENDING",
  "CANCELLED",
]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: subscriptionTypeEnum("type").notNull(),
  price: integer("price").notNull(),
  billing_cycle: text("billing_cycle").default("monthly").notNull(),
  description: text("description"),
  features: jsonb("features"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    plan_id: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    company_id: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    supplier_id: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    status: subscriptionStatusEnum("status").default("PENDING").notNull(),
    start_date: timestamp("start_date", { withTimezone: true }).notNull(),
    end_date: timestamp("end_date", { withTimezone: true }).notNull(),
    auto_renew: boolean("auto_renew").default(true),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscriptions_company_idx").on(t.company_id),
    index("subscriptions_supplier_idx").on(t.supplier_id),
    index("subscriptions_status_idx").on(t.status),
  ]
);

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    amount: integer("amount").notNull(),
    payment_date: timestamp("payment_date", { withTimezone: true }).notNull(),
    payment_method: text("payment_method").default("CASH").notNull(),
    reference_number: text("reference_number"),
    notes: text("notes"),
    recorded_by: uuid("recorded_by").references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sub_payments_subscription_idx").on(t.subscription_id),
  ]
);
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

// ---------------------------------------------------------------------------
// Renewal tracking
// ---------------------------------------------------------------------------

export const subscriptionRenewals = pgTable(
  "subscription_renewals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    previous_start: timestamp("previous_start", { withTimezone: true }).notNull(),
    previous_end: timestamp("previous_end", { withTimezone: true }).notNull(),
    new_start: timestamp("new_start", { withTimezone: true }).notNull(),
    new_end: timestamp("new_end", { withTimezone: true }).notNull(),
    renewed_by: uuid("renewed_by").references(() => users.id),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("renewals_subscription_idx").on(t.subscription_id),
  ]
);

export type SubscriptionRenewal = typeof subscriptionRenewals.$inferSelect;

export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "TRUCK",
  "CONTAINER",
  "TRACTOR",
  "TEMPO",
  "OTHER",
]);

export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "PENDING",
  "PARTIALLY_DISPATCHED",
  "COMPLETED",
  "CANCELLED",
]);

export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    company_id: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("buyers_company_idx").on(t.company_id)]
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    order_number: text("order_number").notNull().unique(),
    company_id: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Facility that will fill this order
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id),
    buyer_id: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id),
    order_date: timestamp("order_date", { withTimezone: true }).notNull(),
    status: salesOrderStatusEnum("status").default("PENDING").notNull(),
    total_amount: integer("total_amount").default(0).notNull(),
    notes: text("notes"),
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sales_orders_company_idx").on(t.company_id),
    index("sales_orders_facility_idx").on(t.facility_id),
    index("sales_orders_buyer_idx").on(t.buyer_id),
    index("sales_orders_status_idx").on(t.status),
  ]
);

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    // Free-text onion category (Red, White, Rose…) — matches work entries
    onion_category: text("onion_category"),
    bag_size_id: uuid("bag_size_id")
      .notNull()
      .references(() => bagSizes.id),
    quantity_bags: integer("quantity_bags").notNull(),
    rate_per_bag: integer("rate_per_bag").notNull(),
    total_amount: integer("total_amount").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.order_id)]
);

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    facility_id: uuid("facility_id")
      .notNull()
      .references(() => facilities.id),
    vehicle_type: vehicleTypeEnum("vehicle_type").notNull(),
    vehicle_number: text("vehicle_number"),
    destination: text("destination"),
    dispatch_date: timestamp("dispatch_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    notes: text("notes"),
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dispatches_order_idx").on(t.order_id),
    index("dispatches_facility_idx").on(t.facility_id),
  ]
);

export const dispatchItems = pgTable(
  "dispatch_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatch_id: uuid("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    order_item_id: uuid("order_item_id")
      .notNull()
      .references(() => salesOrderItems.id),
    quantity_bags: integer("quantity_bags").notNull(),
    rate_per_bag: integer("rate_per_bag").notNull(),
    total_amount: integer("total_amount").notNull(),
  },
  (t) => [index("dispatch_items_dispatch_idx").on(t.dispatch_id)]
);

export const orderPayments = pgTable(
  "order_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    payment_date: timestamp("payment_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    payment_method: text("payment_method").default("CASH").notNull(),
    reference_number: text("reference_number"),
    notes: text("notes"),
    recorded_by: uuid("recorded_by").references(() => users.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("order_payments_order_idx").on(t.order_id)]
);

export type Buyer = typeof buyers.$inferSelect;
export type SalesOrder = typeof salesOrders.$inferSelect;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type Dispatch = typeof dispatches.$inferSelect;
export type DispatchItem = typeof dispatchItems.$inferSelect;
export type OrderPayment = typeof orderPayments.$inferSelect;
