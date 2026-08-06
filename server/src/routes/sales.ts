import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

import buyersRouter from "./sales/buyers.js";
import ordersRouter from "./sales/orders.js";
import dispatchesRouter from "./sales/dispatches.js";
import paymentsRouter from "./sales/payments.js";
import summaryRouter from "./sales/summary.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "COMPANY_ADMIN", "FACILITY_ADMIN"));

router.use(buyersRouter);
router.use(ordersRouter);
router.use(dispatchesRouter);
router.use(paymentsRouter);
router.use(summaryRouter);

export default router;
