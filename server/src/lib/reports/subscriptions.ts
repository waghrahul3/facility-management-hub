import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  companies,
  subscriptionPayments,
  subscriptionPlans,
  subscriptions,
  suppliers,
} from "../../db/schema.js";
import {
  d,
  endOfDay,
  money,
  type Report,
  type ReportFilters,
  type ReportScope,
} from "./types.js";

// ---------------------------------------------------------------------------
// Subscription Earnings Report (Super Admin only)
// ---------------------------------------------------------------------------
// Revenue from subscription payments with per-entity detail, plan-type
// breakdown, and monthly revenue trend.

const CYCLE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-Yearly",
  yearly: "Yearly",
  annually: "Yearly",
};

function cycleLabel(cycle: string | null): string {
  return CYCLE_LABEL[cycle ?? "monthly"] ?? cycle ?? "Monthly";
}

export async function subscriptionEarnings(
  scope: ReportScope,
  f: ReportFilters
): Promise<Report> {
  // -------------------------------------------------------------------------
  // 1. Payments ledger (detail rows)
  // -------------------------------------------------------------------------
  const where = [];
  if (f.from) where.push(gte(subscriptionPayments.payment_date, new Date(f.from)));
  if (f.to) where.push(lte(subscriptionPayments.payment_date, endOfDay(f.to)));

  const payments = await db
    .select({
      paymentDate: subscriptionPayments.payment_date,
      amount: subscriptionPayments.amount,
      method: subscriptionPayments.payment_method,
      reference: subscriptionPayments.reference_number,
      planName: subscriptionPlans.name,
      planType: subscriptionPlans.type,
      planCycle: subscriptionPlans.billing_cycle,
      companyId: subscriptions.company_id,
      companyName: companies.name,
      supplierId: subscriptions.supplier_id,
      supplierName: suppliers.name,
      subStatus: subscriptions.status,
    })
    .from(subscriptionPayments)
    .innerJoin(subscriptions, eq(subscriptionPayments.subscription_id, subscriptions.id))
    .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
    .leftJoin(companies, eq(subscriptions.company_id, companies.id))
    .leftJoin(suppliers, eq(subscriptions.supplier_id, suppliers.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(subscriptionPayments.payment_date));

  // -------------------------------------------------------------------------
  // 2. Aggregate totals
  // -------------------------------------------------------------------------
  let totalRevenue = 0;
  let companyRevenue = 0;
  let supplierRevenue = 0;
  let thisMonthRevenue = 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Monthly trend map: "YYYY-MM" -> { label, amount, count }
  const monthlyMap = new Map<string, { label: string; amount: number; count: number }>();

  for (const p of payments) {
    totalRevenue += p.amount ?? 0;
    if (p.planType === "COMPANY") companyRevenue += p.amount ?? 0;
    if (p.planType === "SUPPLIER") supplierRevenue += p.amount ?? 0;

    const pd = new Date(p.paymentDate);
    if (pd >= monthStart) thisMonthRevenue += p.amount ?? 0;

    const key = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(key);
    if (existing) {
      existing.amount += p.amount ?? 0;
      existing.count += 1;
    } else {
      monthlyMap.set(key, {
        label: pd.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
        amount: p.amount ?? 0,
        count: 1,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Subscription counts by status (for cards)
  // -------------------------------------------------------------------------
  const [activeRows, subStats] = await Promise.all([
    db
      .select({
        type: subscriptionPlans.type,
        id: subscriptions.id,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
      .where(eq(subscriptions.status, "ACTIVE")),
    db
      .select({ status: subscriptions.status })
      .from(subscriptions),
  ]);

  const activeByType = { COMPANY: 0, SUPPLIER: 0 };
  for (const r of activeRows) {
    if (r.type === "COMPANY") activeByType.COMPANY += 1;
    if (r.type === "SUPPLIER") activeByType.SUPPLIER += 1;
  }
  const totalSubs = subStats.length;
  const activeSubs = activeRows.length;

  // -------------------------------------------------------------------------
  // 4. Compose the report
  // -------------------------------------------------------------------------
  const rows = payments.map((p) => ({
    paymentDate: p.paymentDate,
    entity: p.companyName ?? p.supplierName ?? "—",
    entityType: p.companyId ? "Company" : p.supplierId ? "Supplier" : "—",
    plan: p.planName,
    planType: p.planType,
    cycle: cycleLabel(p.planCycle),
    amount: p.amount,
    method: p.method,
    reference: p.reference ?? "",
  }));

  // Monthly trend rows
  const monthlyRows = [...monthlyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([_, v]) => ({
      month: v.label,
      payments: v.count,
      amount: v.amount,
    }));

  return {
    type: "subscription-earnings",
    title: "Subscription Earnings Report",
    subtitle: "Revenue from company & supplier subscription payments",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "paymentDate", label: "Date", type: "date" },
      { key: "entity", label: "Entity", type: "text" },
      { key: "entityType", label: "Type", type: "text" },
      { key: "plan", label: "Plan", type: "text" },
      { key: "cycle", label: "Cycle", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "method", label: "Method", type: "text" },
      { key: "reference", label: "Reference", type: "text" },
    ],
    rows,
    totals: {
      amount: totalRevenue,
    },
    cards: [
      { label: "Total Revenue", value: money(totalRevenue), tone: "green" },
      { label: "Revenue This Month", value: money(thisMonthRevenue), tone: "blue" },
      { label: "Company Revenue", value: money(companyRevenue), tone: "violet" },
      { label: "Supplier Revenue", value: money(supplierRevenue), tone: "amber" },
      { label: "Active Subscriptions", value: `${activeSubs}/${totalSubs}`, tone: "slate" },
      { label: "Active Companies", value: String(activeByType.COMPANY), tone: "green" },
      { label: "Active Suppliers", value: String(activeByType.SUPPLIER), tone: "green" },
    ],
    meta: {
      monthlyTrend: monthlyRows,
    },
  };
}

// ---------------------------------------------------------------------------
// Monthly trend view (uses the same query, returns trend rows as main rows)
// ---------------------------------------------------------------------------

export async function subscriptionMonthlyTrend(
  scope: ReportScope,
  f: ReportFilters
): Promise<Report> {
  const base = await subscriptionEarnings(scope, f);
  const trend = (base as any).meta?.monthlyTrend ?? [];
  return {
    type: "subscription-monthly",
    title: "Subscription Revenue — Monthly Trend",
    subtitle: "Monthly subscription revenue with payment counts",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "month", label: "Month", type: "text" },
      { key: "payments", label: "Payments", type: "number" },
      { key: "amount", label: "Revenue", type: "money" },
    ],
    rows: trend,
    totals: { amount: base.totals.amount },
    cards: base.cards.filter((c) =>
      ["Total Revenue", "Company Revenue", "Supplier Revenue"].includes(c.label)
    ),
  };
}
