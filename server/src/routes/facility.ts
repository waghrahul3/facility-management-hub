import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

import lookupsRouter from "./facility/lookups.js";
import dropsRouter from "./facility/drops.js";
import tolisRouter from "./facility/tolis.js";
import workEntriesRouter from "./facility/workEntries.js";
import ratesRouter from "./facility/rates.js";
import summariesRouter from "./facility/summaries.js";
import paymentsRouter from "./facility/payments.js";
import dashboardRouter from "./facility/dashboard.js";

const router = Router();
router.use(requireAuth);
// SUPPLIER is allowed only on the public facility list (used to register drops);
// every facility-scoped route below additionally enforces requireFacilityAccess,
// which also admits COMPANY_ADMINs for facilities owned by their company.
router.use(requireRole("SUPER_ADMIN", "FACILITY_ADMIN", "COMPANY_ADMIN", "SUPPLIER"));

router.use(lookupsRouter);
router.use(dropsRouter);
router.use(tolisRouter);
router.use(workEntriesRouter);
router.use(ratesRouter);
router.use(summariesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
