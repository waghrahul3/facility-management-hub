import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

import dashboardRouter from "./company/dashboard.js";
import facilitiesRouter from "./company/facilities.js";
import adminsRouter from "./company/admins.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "COMPANY_ADMIN"));

router.use(dashboardRouter);
router.use(facilitiesRouter);
router.use(adminsRouter);

export default router;
