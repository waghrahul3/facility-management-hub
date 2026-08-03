import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import authRoutes from "./routes/auth.js";
import superAdminRoutes from "./routes/superadmin.js";
import companyRoutes from "./routes/company.js";
import facilityRoutes from "./routes/facility.js";
import supplierRoutes from "./routes/supplier.js";
import toliLeaderRoutes from "./routes/tolileader.js";
import { errorMiddleware } from "./lib/errors.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Request logging (lightweight)
  app.use((req, _res, next) => {
    if (config.nodeEnv !== "test") {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    }
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: "onion-facility-center", time: new Date().toISOString() });
  });

  // API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/super-admin", superAdminRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/facility", facilityRoutes);
  app.use("/api/supplier", supplierRoutes);
  app.use("/api/toli-leader", toliLeaderRoutes);

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
