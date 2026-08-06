import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierDrops, suppliers } from "../../db/schema.js";
import {
  d,
  endOfDay,
  money,
  type Report,
  type ReportFilters,
  type ReportScope,
} from "./types.js";

// ---------------------------------------------------------------------------
// Supplier Drops Ledger
// ---------------------------------------------------------------------------

export async function dropsLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierDrops.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierDrops.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierDrops.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierDrops.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierDrops.drop_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierDrops.drop_date, endOfDay(f.to)));

  const rows = await db
    .select({
      dropDate: supplierDrops.drop_date,
      facilityName: facilities.name,
      supplierName: suppliers.name,
      workers: supplierDrops.total_workers_dropped,
      rent: supplierDrops.rent_per_drop,
      status: supplierDrops.status,
    })
    .from(supplierDrops)
    .innerJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierDrops.drop_date));

  const totals = { workers: 0, rent: 0 };
  for (const r of rows) {
    totals.workers += r.workers ?? 0;
    totals.rent += r.rent ?? 0;
  }
  const completed = rows.filter((r) => r.status === "COMPLETED").length;

  return {
    type: "drops",
    title: "Supplier Drops Ledger",
    subtitle: "Every supplier drop with negotiated per-drop rent",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "dropDate", label: "Date", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "workers", label: "Workers", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
      { key: "status", label: "Status", type: "status" },
    ],
    rows,
    totals,
    cards: [
      { label: "Total drops", value: String(rows.length), tone: "slate" },
      { label: "Total workers", value: String(totals.workers), tone: "blue" },
      { label: "Total rent", value: money(totals.rent), tone: "amber" },
      { label: "Completed", value: String(completed), tone: "green" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rent Collection Summary (per supplier)
// ---------------------------------------------------------------------------

export async function rentSummary(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierDrops.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierDrops.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierDrops.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierDrops.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierDrops.drop_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierDrops.drop_date, endOfDay(f.to)));

  const rows = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      facilityName: facilities.name,
      workers: supplierDrops.total_workers_dropped,
      rent: supplierDrops.rent_per_drop,
    })
    .from(supplierDrops)
    .innerJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
    .where(where.length ? and(...where) : undefined);

  const bySupplier = new Map<string, { name: string; facilities: Set<string>; drops: number; workers: number; rent: number }>();
  for (const r of rows) {
    const key = r.supplierId;
    let agg = bySupplier.get(key);
    if (!agg) {
      agg = { name: r.supplierName, facilities: new Set(), drops: 0, workers: 0, rent: 0 };
      bySupplier.set(key, agg);
    }
    agg.facilities.add(r.facilityName);
    agg.drops += 1;
    agg.workers += r.workers ?? 0;
    agg.rent += r.rent ?? 0;
  }

  const out = [...bySupplier.values()]
    .sort((a, b) => b.rent - a.rent)
    .map((a) => ({
      supplierName: a.name,
      facilities: [...a.facilities].join(", ") || "—",
      drops: a.drops,
      workers: a.workers,
      rent: a.rent,
    }));

  const totals = { drops: 0, workers: 0, rent: 0 };
  for (const r of out) {
    totals.drops += r.drops;
    totals.workers += r.workers;
    totals.rent += r.rent;
  }

  return {
    type: "rent",
    title: "Rent Collection Summary",
    subtitle: "Negotiated drop rent aggregated per supplier",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "facilities", label: "Facilities", type: "text" },
      { key: "drops", label: "Drops", type: "number" },
      { key: "workers", label: "Workers", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
    ],
    rows: out,
    totals,
    cards: [
      { label: "Total rent", value: money(totals.rent), tone: "amber" },
      { label: "Total drops", value: String(totals.drops), tone: "slate" },
      { label: "Total workers", value: String(totals.workers), tone: "blue" },
      { label: "Suppliers", value: String(bySupplier.size), tone: "green" },
    ],
  };
}

export { d };
