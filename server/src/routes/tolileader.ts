import { Router, type Request } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  bagSizes,
  facilities,
  supplierDrops,
  supplierPaymentDistributions,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { asyncHandler, notFound } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { currentWeek } from "../services/payments.js";
import { startOfWeek, endOfWeek, dateOnly } from "../lib/date.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "TOLI_LEADER"));

function myToliId(req: Request): string {
  if (!req.auth?.toliId) throw new Error("No toli linked to this account");
  return req.auth.toliId;
}

// GET /api/toli-leader/my-toli
router.get(
  "/my-toli",
  asyncHandler(async (req, res) => {
    const toli = (
      await db.select().from(tolis).where(eq(tolis.id, myToliId(req))).limit(1)
    )[0];
    if (!toli) throw notFound("Your toli was not found");

    const facility = (
      await db.select().from(facilities).where(eq(facilities.id, toli.facility_id)).limit(1)
    )[0];
    const drop = toli.drop_id
      ? (
          await db
            .select()
            .from(supplierDrops)
            .where(eq(supplierDrops.id, toli.drop_id))
            .limit(1)
        )[0]
      : null;

    return res.json({ toli, facility, drop });
  })
);

// GET /api/toli-leader/today-work
router.get(
  "/today-work",
  asyncHandler(async (req, res) => {
    const today = dateOnly(new Date());
    const rows = await db
      .select({
        entry: workEntries,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(
        and(
          eq(workEntries.toli_id, myToliId(req)),
          eq(workEntries.work_date, today)
        )
      )
      .orderBy(desc(workEntries.created_at));

    return res.json({ entries: rows, date: today });
  })
);

// GET /api/toli-leader/weekly-earnings
router.get(
  "/weekly-earnings",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();
    const summaries = await db
      .select()
      .from(weeklyWorkSummaries)
      .where(
        and(
          eq(weeklyWorkSummaries.toli_id, myToliId(req)),
          gte(weeklyWorkSummaries.week_start_date, weekStart),
          lte(weeklyWorkSummaries.week_end_date, weekEnd)
        )
      )
      .orderBy(desc(weeklyWorkSummaries.created_at));

    // Also fetch all work entries this week for the toli (for the breakdown)
    const entries = await db
      .select({
        entry: workEntries,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(
        and(
          eq(workEntries.toli_id, myToliId(req)),
          gte(workEntries.work_date, weekStart),
          lte(workEntries.work_date, weekEnd)
        )
      )
      .orderBy(asc(workEntries.work_date));

    return res.json({ summaries, entries, weekStart, weekEnd });
  })
);

// GET /api/toli-leader/payment-history
router.get(
  "/payment-history",
  asyncHandler(async (req, res) => {
    const distributions = await db
      .select()
      .from(supplierPaymentDistributions)
      .where(eq(supplierPaymentDistributions.toli_id, myToliId(req)))
      .orderBy(desc(supplierPaymentDistributions.distribution_date));
    return res.json({ distributions });
  })
);

// PUT /api/toli-leader/work-entries/:id/confirm
router.put(
  "/work-entries/:entryId/confirm",
  asyncHandler(async (req, res) => {
    const entry = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!entry) throw notFound("Work entry not found");
    if (entry.toli_id !== myToliId(req)) {
      return res.status(403).json({ error: "You can only confirm your own toli's work" });
    }

    const [updated] = await db
      .update(workEntries)
      .set({ leader_confirmed_at: new Date(), updated_at: new Date() })
      .where(eq(workEntries.id, param(req, "entryId")))
      .returning();
    return res.json({ entry: updated });
  })
);

export default router;
