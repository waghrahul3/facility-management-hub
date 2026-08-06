import { Router } from "express";

import plansRouter from "./subscription/plans.js";
import manageRouter from "./subscription/manage.js";
import paymentsRouter from "./subscription/payments.js";
import statusRouter from "./subscription/status.js";
import alertsRouter from "./subscription/alerts.js";

const router = Router();

// Mount order preserves the original route registration order (Express matches
// in registration order). Each sub-router carries its own requireAuth /
// requireRole middleware.
router.use(plansRouter);
router.use(manageRouter);
router.use(paymentsRouter);
router.use(statusRouter);
router.use(alertsRouter);

export default router;
