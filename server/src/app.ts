import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { logger, reqLogger, maskBody } from "./lib/logger.js";

import authRoutes from "./routes/auth.js";
import superAdminRoutes from "./routes/superadmin.js";
import githubRoutes from "./routes/github.js";
import companyRoutes from "./routes/company.js";
import facilityRoutes from "./routes/facility.js";
import supplierRoutes from "./routes/supplier.js";
import toliLeaderRoutes from "./routes/tolileader.js";
import reportsRoutes from "./routes/reports.js";
import subscriptionRoutes from "./routes/subscription.js";
import salesRoutes from "./routes/sales.js";
import { errorMiddleware } from "./lib/errors.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Security headers. CSP and COEP are disabled so the SPA and Vite dev server
  // (inline styles, cross-origin API) keep working; the rest of helmet's
  // headers (nosniff, X-Frame-Options, HSTS, etc.) are applied.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Request ID + timing middleware
  app.use((req, res, next) => {
    const requestId = randomUUID().slice(0, 8);
    const start = Date.now();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    // Log request body for POST/PUT/DELETE (with sensitive field masking)
    const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    if (methodsWithBody.has(req.method) && req.body && typeof req.body === "object") {
      const masked = maskBody(req.body);
      const bodyKeys = Object.keys(masked as Record<string, unknown>);
      logger.debug("request body", {
        requestId,
        method: req.method,
        path: req.originalUrl || req.path,
        bodyKeys,
        body: masked,
      });
    }

    // Log response when it finishes
    res.on("finish", () => {
      const duration = Date.now() - start;
      const log = reqLogger({
        requestId,
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
      if (res.statusCode >= 500) {
        log.error("request completed");
      } else if (res.statusCode >= 400) {
        log.warn("request completed");
    } else {
        log.info("request completed");
      }
    });

    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: "onion-facility-center", time: new Date().toISOString() });
  });

  // API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/super-admin", superAdminRoutes);
  app.use("/api/super-admin", githubRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/facility", facilityRoutes);
  app.use("/api/supplier", supplierRoutes);
  app.use("/api/toli-leader", toliLeaderRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/sales", salesRoutes);

  // 404 for unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Serve built frontend (production / preview)
  // In dev, Vite serves the client and proxies /api here, so dist may not exist.
  const distPath = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback (Express 5: use middleware, not regex routes)
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(path.join(distPath, "index.html"));
      }
      next();
    });
  }

  app.use(errorMiddleware);

  return app;
}
