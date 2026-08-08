import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { asyncHandler } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";
import type { ReportFilters, ReportScope } from "../lib/reports/types.js";
import {
  distributionsLedger,
  paymentsLedger,
  supplierStatements,
} from "../lib/reports/payments.js";
import { dropsLedger, rentSummary } from "../lib/reports/drops.js";
import { supplierInvoice } from "../lib/reports/invoices.js";
import { supplierAdvanceStatement } from "../lib/reports/advances.js";
import { summariesLedger, workLedger } from "../lib/reports/work.js";
import { reportToExcel, reportToPdf } from "../lib/reports/exports.js";
import {
  subscriptionEarnings,
  subscriptionMonthlyTrend,
} from "../lib/reports/subscriptions.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { facilities, supplierDrops, users } from "../db/schema.js";

const router = Router();

// ---------------------------------------------------------------------------
// Resolve the caller's data-visibility scope
// ---------------------------------------------------------------------------

async function resolveScope(req: any): Promise<ReportScope> {
  const user = req.auth;
  const scope: ReportScope = {
    role: user.role,
    companyId: user.companyId ?? null,
    facilityIds: null,
    supplierId: null,
    toliId: null,
  };

  switch (user.role) {
    case "SUPER_ADMIN":
      // sees everything
      break;
    case "COMPANY_ADMIN":
      if (scope.companyId) {
        const rows = await db
          .select({ id: facilities.id })
          .from(facilities)
          .where(eq(facilities.company_id, scope.companyId));
        scope.facilityIds = rows.map((r) => r.id);
      }
      break;
    case "FACILITY_ADMIN":
      scope.facilityIds = user.facilityId ? [user.facilityId] : [];
      break;
    case "SUPPLIER": {
      scope.supplierId = user.supplierId ?? null;
      if (scope.supplierId) {
        const drops = await db
          .select({ facilityId: supplierDrops.facility_id })
          .from(supplierDrops)
          .where(eq(supplierDrops.supplier_id, scope.supplierId));
        const fids = [...new Set(drops.map((d) => d.facilityId))];
        scope.facilityIds = fids.length ? fids : null;
      }
      break;
    }
    case "TOLI_LEADER":
      // Toli leader: limited scope — only data that mentions their toli
      scope.toliId = user.toliId ?? null;
      scope.facilityIds = user.facilityId ? [user.facilityId] : null;
      break;
  }

  return scope;
}

function parseFilters(query: any): ReportFilters {
  return {
    from: (query.from as string) || null,
    to: (query.to as string) || null,
    facilityId: (query.facilityId as string) || null,
    supplierId: (query.supplierId as string) || null,
  };
}

// ---------------------------------------------------------------------------
// JSON endpoints  GET /api/reports/:type
// ---------------------------------------------------------------------------

const REPORT_TYPES: Record<string, (scope: ReportScope, f: ReportFilters) => Promise<any>> = {
  payments: paymentsLedger,
  drops: dropsLedger,
  work: workLedger,
  summaries: summariesLedger,
  distributions: distributionsLedger,
  "supplier-statements": supplierStatements,
  rent: rentSummary,
  "supplier-invoice": supplierInvoice,
  "supplier-advance-statement": supplierAdvanceStatement,
  "subscription-earnings": subscriptionEarnings,
  "subscription-monthly": subscriptionMonthlyTrend,
};

/** True if the role is allowed to view this report type. */
function canAccessReport(role: string, type: string): boolean {
  const allowed = ROLE_REPORTS[role] || [];
  return allowed.includes(type);
}

router.get(
  "/:type",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { type } = req.params;
    const role = (req.auth?.role as string) || "SUPER_ADMIN";
    const builder = REPORT_TYPES[type];
    if (!builder) {
      res.status(404).json({ error: `Unknown report type: ${type}` });
      return;
    }
    if (!canAccessReport(role, type)) {
      res.status(403).json({ error: "Forbidden: you cannot access this report" });
      return;
    }
    const scope = await resolveScope(req);
    const filters = parseFilters(req.query);
    const report = await builder(scope, filters);
    res.json(report);
  })
);

// ---------------------------------------------------------------------------
// Excel endpoint  GET /api/reports/:type/excel
// ---------------------------------------------------------------------------

router.get(
  "/:type/excel",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { type } = req.params;
    const role = (req.auth?.role as string) || "SUPER_ADMIN";
    const builder = REPORT_TYPES[type];
    if (!builder) {
      res.status(404).json({ error: `Unknown report type: ${type}` });
      return;
    }
    if (!canAccessReport(role, type)) {
      res.status(403).json({ error: "Forbidden: you cannot access this report" });
      return;
    }
    const scope = await resolveScope(req);
    const filters = parseFilters(req.query);
    const report = await builder(scope, filters);
    const xlsx = await reportToExcel(report);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-report.xlsx"`);
    res.send(xlsx);
  })
);

// ---------------------------------------------------------------------------
// PDF endpoint  GET /api/reports/:type/pdf
// ---------------------------------------------------------------------------

router.get(
  "/:type/pdf",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { type } = req.params;
    const role = (req.auth?.role as string) || "SUPER_ADMIN";
    const builder = REPORT_TYPES[type];
    if (!builder) {
      res.status(404).json({ error: `Unknown report type: ${type}` });
      return;
    }
    if (!canAccessReport(role, type)) {
      res.status(403).json({ error: "Forbidden: you cannot access this report" });
      return;
    }
    const scope = await resolveScope(req);
    const filters = parseFilters(req.query);
    const report = await builder(scope, filters);
    const pdfBuf = await reportToPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-report.pdf"`);
    res.send(pdfBuf);
  })
);

// ---------------------------------------------------------------------------
// Metadata endpoint — available report types for the caller's role
// ---------------------------------------------------------------------------

const ROLE_REPORTS: Record<string, string[]> = {
  SUPER_ADMIN: ["subscription-earnings", "subscription-monthly", "payments", "drops", "work", "summaries", "distributions", "supplier-statements", "rent", "supplier-invoice", "supplier-advance-statement"],
  COMPANY_ADMIN: ["payments", "drops", "work", "summaries", "distributions", "supplier-statements", "rent", "supplier-invoice", "supplier-advance-statement"],
  FACILITY_ADMIN: ["payments", "drops", "work", "summaries", "rent", "supplier-invoice", "supplier-advance-statement"],
  SUPPLIER: ["supplier-statements", "distributions", "drops", "work", "supplier-invoice", "supplier-advance-statement"],
  TOLI_LEADER: ["summaries", "distributions", "work"],
};

router.get(
  "/meta/types",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const role = (req.auth?.role as string) || "SUPER_ADMIN";
    res.json({ types: ROLE_REPORTS[role] || ROLE_REPORTS.SUPER_ADMIN });
  })
);

export default router;
