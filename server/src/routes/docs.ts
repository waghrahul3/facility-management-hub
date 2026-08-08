import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "../docs/openapi.js";

const router = Router();

/**
 * GET /api/docs           → raw OpenAPI 3.0.3 JSON (for tooling / consumers)
 * GET /api/docs/ui        → interactive Swagger UI documentation
 */
router.get("/", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(openApiSpec, null, 2));
});

router.use(
  "/ui",
  ...swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Onion Facility Center — API Docs",
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #14532d; }
      .swagger-ui .opblock-tag { font-family: inherit; }
      .swagger-ui .btn.authorize { border-color: #16a34a; color: #15803d; }
      .swagger-ui .btn.authorize svg { fill: #16a34a; }
    `,
  })
);

export default router;
