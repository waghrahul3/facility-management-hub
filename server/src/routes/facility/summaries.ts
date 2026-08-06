import { Router } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { suppliers, tolis, weeklyWorkSummaries } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { generateWeeklySummaries } from "../../services/payments.js";
import { weekParams } from "./_shared.js";

const router = Router();

// ---------------------------------------------------------------------------
// Weekly summaries + approval
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/weekly-summary",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = and(
      eq(weeklyWorkSummaries.facility_id, param(req, "facilityId")),
      eq(weeklyWorkSummaries.week_start_date, weekStart)
    );
    const rows = await db
      .select({
        summary: weeklyWorkSummaries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(weeklyWorkSummaries)
      .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
      .leftJoin(suppliers, eq(suppliers.id, weeklyWorkSummaries.supplier_id))
      .where(where)
      .orderBy(desc(weeklyWorkSummaries.total_earnings))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(weeklyWorkSummaries)
      .where(where);
    return res.json({
      summaries: rows,
      weekStart,
      weekEnd,
      ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }),
    });
  })
);

router.post(
  "/:facilityId/weekly-summary/generate",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams((req.body ?? {}) as Record<string, unknown>);
    const summaries = await generateWeeklySummaries(
      param(req, "facilityId"),
      weekStart,
      weekEnd
    );
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "WEEKLY_SUMMARY",
      entityId: param(req, "facilityId"),
      newValues: { generated: summaries.length },
    });
    return res.json({ summaries, count: summaries.length });
  })
);

router.post(
  "/:facilityId/weekly-summary/:summaryId/approve",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(weeklyWorkSummaries)
        .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Summary not found");

    const [updated] = await db
      .update(weeklyWorkSummaries)
      .set({
        approval_status: "APPROVED",
        approved_by: req.auth?.userId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "APPROVE",
      entityType: "WEEKLY_SUMMARY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ summary: updated });
  })
);

router.post(
  "/:facilityId/weekly-summary/:summaryId/reject",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(weeklyWorkSummaries)
        .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Summary not found");

    const [updated] = await db
      .update(weeklyWorkSummaries)
      .set({
        approval_status: "REJECTED",
        approved_by: req.auth?.userId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "REJECT",
      entityType: "WEEKLY_SUMMARY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ summary: updated });
  })
);

export default router;
