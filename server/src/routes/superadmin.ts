import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

import companiesRouter from "./superadmin/companies.js";
import facilitiesRouter from "./superadmin/facilities.js";
import catalogRouter from "./superadmin/catalog.js";
import suppliersRouter from "./superadmin/suppliers.js";
import analyticsRouter from "./superadmin/analytics.js";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.use(companiesRouter);
router.use(facilitiesRouter);
router.use(catalogRouter);
router.use(suppliersRouter);
router.use(analyticsRouter);

export default router;
