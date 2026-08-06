import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

import profileRouter from "./supplier/profile.js";
import dropsRouter from "./supplier/drops.js";
import workEntriesRouter from "./supplier/workEntries.js";
import summaryRouter from "./supplier/summary.js";
import paymentsRouter from "./supplier/payments.js";
import dashboardRouter from "./supplier/dashboard.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "SUPPLIER"));

router.use(profileRouter);
router.use(dropsRouter);
router.use(workEntriesRouter);
router.use(summaryRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
