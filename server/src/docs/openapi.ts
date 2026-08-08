/**
 * OpenAPI 3.0.3 specification for the Onion Facility Center API.
 *
 * Hand-maintained to mirror the routes registered in server/src/routes.
 * Served as JSON at GET /api/docs and rendered by Swagger UI at /api/docs/ui.
 */

/* ------------------------------------------------------------------ */
/* Small helpers to keep the spec readable                             */
/* ------------------------------------------------------------------ */

type Schema = Record<string, unknown>;
type Responses = Record<string, { description: string; content?: Record<string, { schema: Schema }> }>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

const err = (description: string): { description: string } => ({ description });

/** Standard error responses used across every endpoint. */
const stdErrors = (): Responses => ({
  400: err("Bad request — missing or invalid fields"),
  401: err("Unauthorized — missing or invalid bearer token"),
  403: err("Forbidden — role or scope not allowed"),
});

/** Build a 200 responses object, optionally referencing a schema. */
const ok = (schema?: string, description = "Success"): Responses => {
  const r: Responses = { 200: { description } };
  if (schema) {
    r[200].content = { "application/json": { schema: ref(schema) } };
  }
  return { ...r, ...stdErrors() };
};

/** A created (201) response. */
const created = (schema?: string, description = "Created"): Responses => {
  const r: Responses = { 201: { description } };
  if (schema) {
    r[201].content = { "application/json": { schema: ref(schema) } };
  }
  return { ...r, ...stdErrors() };
};

const body = (schema: string, required: string[] = []): Schema => ({
  required,
  content: { "application/json": { schema: ref(schema) } },
});

const pathParam = (name: string, description: string): Schema => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
  description,
});

const uuidPath = (name: string, description: string): Schema => pathParam(name, description);

const q = (name: string, description = "", type = "string"): Schema => ({
  name,
  in: "query",
  schema: { type },
  ...(description ? { description } : {}),
});

const bearer = [{ bearerAuth: [] }];
const pub = (): unknown[] => [];

/* ------------------------------------------------------------------ */
/* The specification                                                   */
/* ------------------------------------------------------------------ */

export const openApiSpec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "Onion Facility Center API",
    version: "1.0.0",
    description:
      "REST API for the Onion Facility Center — multi-facility onion storage & processing management. " +
      "Covers supplier drops, toli (worker-group) work recording, weekly summaries & approvals, Sunday " +
      "payment settlement with advance recovery, supplier collection/distribution, sales orders & " +
      "dispatches, subscriptions, reports and audit logging.\n\n" +
      "All endpoints (except auth, health, plans and reports metadata) require an access token: " +
      "`Authorization: Bearer <accessToken>`. Obtain one via `POST /auth/login`.",
  },
  servers: [{ url: "/api", description: "Same-origin API (dev: Vite proxy → :3001, prod: Express)" }],
  tags: [
    { name: "Auth", description: "Login, session refresh, password & profile management" },
    { name: "Super Admin", description: "Global management — companies, facilities, admins, catalog, suppliers, analytics" },
    { name: "Company", description: "Company admin workspace — facilities, facility admins, dashboard" },
    { name: "Facility", description: "Facility operations — drops, tolis, work entries, rates, approvals, payments, advances" },
    { name: "Supplier", description: "Supplier self-service — drops, work entries, weekly summary, collect & distribute, advances" },
    { name: "Toli Leader", description: "Toli leader self-service — my toli, today's work, earnings, confirmations" },
    { name: "Sales", description: "Buyers, sales orders, dispatches and order payments" },
    { name: "Subscriptions", description: "Subscription plans, subscriptions, renewals and payments" },
    { name: "Reports", description: "Role-scoped reports with JSON, Excel and PDF exports" },
    { name: "GitHub", description: "Super Admin — push the project to a GitHub repository" },
    { name: "System", description: "Health checks" },
  ],
  security: bearer,
  paths: {
    /* ---------------------------------------------------------- */
    /* System                                                     */
    /* ---------------------------------------------------------- */
    "/health": {
      get: {
        tags: ["System"],
        summary: "Liveness check",
        security: pub(),
        responses: ok(undefined, "API is up"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Auth                                                       */
    /* ---------------------------------------------------------- */
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in and receive an access + refresh token pair",
        security: pub(),
        requestBody: body("LoginRequest", ["email", "password"]),
        responses: ok("AuthSession", "Logged in"),
      },
    },
    "/auth/refresh-token": {
      post: {
        tags: ["Auth"],
        summary: "Rotate a refresh token for a fresh token pair",
        security: pub(),
        requestBody: body("RefreshRequest", ["refreshToken"]),
        responses: ok("AuthSession", "New token pair issued"),
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke the current refresh token",
        requestBody: body("RefreshRequest"),
        responses: ok(undefined, "Logged out"),
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current signed-in user",
        responses: ok("MeResponse"),
      },
    },
    "/auth/profile": {
      put: {
        tags: ["Auth"],
        summary: "Edit own profile (name/phone/email; suppliers also contact person, address, city)",
        requestBody: body("ProfileUpdate"),
        responses: ok("MeResponse", "Profile updated (supplier row kept in sync)"),
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a one-time password reset link (emailed via Resend)",
        security: pub(),
        requestBody: body("ForgotPasswordRequest", ["email"]),
        responses: ok(undefined, "Reset email dispatched (or logged in dev)"),
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a one-time reset token for a new password",
        security: pub(),
        requestBody: body("ResetPasswordRequest", ["token", "password"]),
        responses: ok(undefined, "Password changed"),
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change own password (current password required)",
        requestBody: body("ChangePasswordRequest", ["currentPassword", "newPassword"]),
        responses: ok(undefined, "Password changed"),
      },
    },
    "/auth/admin-reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Admin resets another user's password (scoped by role)",
        requestBody: body("AdminResetPasswordRequest", ["userId", "newPassword"]),
        responses: ok(undefined, "Password reset"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Super Admin                                                */
    /* ---------------------------------------------------------- */
    "/super-admin/companies": {
      get: { tags: ["Super Admin"], summary: "List companies", responses: ok("CompanyList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a company",
        requestBody: body("CompanyInput", ["name"]),
        responses: created("Company"),
      },
    },
    "/super-admin/companies/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Update a company",
        parameters: [uuidPath("id", "Company id")],
        requestBody: body("CompanyInput"),
        responses: ok("Company"),
      },
      delete: {
        tags: ["Super Admin"],
        summary: "Delete a company",
        parameters: [uuidPath("id", "Company id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/super-admin/company-admins": {
      get: { tags: ["Super Admin"], summary: "List company admins", responses: ok("UserList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a company admin",
        requestBody: body("CompanyAdminInput", ["name", "email", "company_id", "password"]),
        responses: created("User"),
      },
    },
    "/super-admin/company-admins/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Edit a company admin's name/phone/email",
        parameters: [uuidPath("id", "User id")],
        requestBody: body("UserEditInput", ["name", "email"]),
        responses: ok("User"),
      },
    },
    "/super-admin/facilities": {
      get: { tags: ["Super Admin"], summary: "List all facilities", responses: ok("FacilityList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a facility",
        requestBody: body("FacilityInput", ["name", "location"]),
        responses: created("Facility"),
      },
    },
    "/super-admin/facilities/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Update a facility",
        parameters: [uuidPath("id", "Facility id")],
        requestBody: body("FacilityInput"),
        responses: ok("Facility"),
      },
      delete: {
        tags: ["Super Admin"],
        summary: "Delete a facility",
        parameters: [uuidPath("id", "Facility id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/super-admin/facility-admins": {
      get: { tags: ["Super Admin"], summary: "List facility admins", responses: ok("UserList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a facility admin",
        requestBody: body("FacilityAdminInput", ["name", "email", "facility_id", "password"]),
        responses: created("User"),
      },
    },
    "/super-admin/facility-admins/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Edit a facility admin's name/phone/email",
        parameters: [uuidPath("id", "User id")],
        requestBody: body("UserEditInput", ["name", "email"]),
        responses: ok("User"),
      },
    },
    "/super-admin/bag-sizes": {
      get: { tags: ["Super Admin"], summary: "List bag sizes", responses: ok("BagSizeList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a bag size",
        requestBody: body("BagSizeInput", ["size_name", "weight_kg"]),
        responses: created("BagSize"),
      },
    },
    "/super-admin/bag-sizes/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Update a bag size",
        parameters: [uuidPath("id", "Bag size id")],
        requestBody: body("BagSizeInput"),
        responses: ok("BagSize"),
      },
    },
    "/super-admin/rates": {
      get: { tags: ["Super Admin"], summary: "List global rates", responses: ok("RateList") },
      post: {
        tags: ["Super Admin"],
        summary: "Create a global (or facility) rate",
        requestBody: body("RateInput", ["bag_size_id", "rate_amount"]),
        responses: created("Rate"),
      },
    },
    "/super-admin/rates/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Update a rate",
        parameters: [uuidPath("id", "Rate id")],
        requestBody: body("RateInput"),
        responses: ok("Rate"),
      },
    },
    "/super-admin/suppliers": {
      get: { tags: ["Super Admin"], summary: "List suppliers", responses: ok("SupplierList") },
      post: {
        tags: ["Super Admin"],
        summary: "Register a supplier (optionally with a login account)",
        requestBody: body("SupplierInput", ["name"]),
        responses: created("SupplierWithUser"),
      },
    },
    "/super-admin/suppliers/{id}": {
      put: {
        tags: ["Super Admin"],
        summary: "Edit a supplier (syncs the linked login account)",
        parameters: [uuidPath("id", "Supplier id")],
        requestBody: body("SupplierInput"),
        responses: ok("Supplier"),
      },
    },
    "/super-admin/suppliers/{id}/generate-login": {
      post: {
        tags: ["Super Admin"],
        summary: "Generate a login account for a facility-registered supplier",
        parameters: [uuidPath("id", "Supplier id")],
        requestBody: body("GenerateLoginRequest", ["email", "password"]),
        responses: created("SupplierWithUser"),
      },
    },
    "/super-admin/dashboard": {
      get: { tags: ["Super Admin"], summary: "Global dashboard statistics", responses: ok("Dashboard") },
    },
    "/super-admin/audit-logs": {
      get: {
        tags: ["Super Admin"],
        summary: "Paginated audit log",
        parameters: [q("page"), q("pageSize"), q("entity_type"), q("q")],
        responses: ok("AuditLogList"),
      },
    },
    "/super-admin/reports/payments": {
      get: { tags: ["Super Admin"], summary: "Cross-facility payment analytics", responses: ok("Dashboard") },
    },
    "/super-admin/reports/suppliers": {
      get: { tags: ["Super Admin"], summary: "Supplier analytics across facilities", responses: ok("Dashboard") },
    },

    /* ---------------------------------------------------------- */
    /* Company                                                    */
    /* ---------------------------------------------------------- */
    "/company/{companyId}/dashboard": {
      get: {
        tags: ["Company"],
        summary: "Company dashboard",
        parameters: [uuidPath("companyId", "Company id")],
        responses: ok("Dashboard"),
      },
    },
    "/company/{companyId}/facilities": {
      get: {
        tags: ["Company"],
        summary: "List the company's facilities",
        parameters: [uuidPath("companyId", "Company id")],
        responses: ok("FacilityList"),
      },
      post: {
        tags: ["Company"],
        summary: "Create a facility under this company",
        parameters: [uuidPath("companyId", "Company id")],
        requestBody: body("FacilityInput", ["name", "location"]),
        responses: created("Facility"),
      },
    },
    "/company/{companyId}/facilities/{facilityId}": {
      put: {
        tags: ["Company"],
        summary: "Update a company facility",
        parameters: [uuidPath("companyId", "Company id"), uuidPath("facilityId", "Facility id")],
        requestBody: body("FacilityInput"),
        responses: ok("Facility"),
      },
      delete: {
        tags: ["Company"],
        summary: "Delete a company facility",
        parameters: [uuidPath("companyId", "Company id"), uuidPath("facilityId", "Facility id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/company/{companyId}/facility-admins": {
      get: {
        tags: ["Company"],
        summary: "List facility admins of the company's facilities",
        parameters: [uuidPath("companyId", "Company id")],
        responses: ok("UserList"),
      },
      post: {
        tags: ["Company"],
        summary: "Create a facility admin for one of the company's facilities",
        parameters: [uuidPath("companyId", "Company id")],
        requestBody: body("FacilityAdminInput", ["name", "email", "facility_id", "password"]),
        responses: created("User"),
      },
    },
    "/company/{companyId}/facility-admins/{id}": {
      put: {
        tags: ["Company"],
        summary: "Edit a company facility admin's name/phone/email",
        parameters: [uuidPath("companyId", "Company id"), uuidPath("id", "User id")],
        requestBody: body("UserEditInput", ["name", "email"]),
        responses: ok("User"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Facility                                                   */
    /* ---------------------------------------------------------- */
    "/facility/facilities": {
      get: { tags: ["Facility"], summary: "List facilities the caller can access", responses: ok("FacilityList") },
    },
    "/facility/{facilityId}/dashboard": {
      get: {
        tags: ["Facility"],
        summary: "Facility dashboard summary",
        parameters: [uuidPath("facilityId", "Facility id")],
        responses: ok("Dashboard"),
      },
    },
    "/facility/{facilityId}/bag-sizes": {
      get: {
        tags: ["Facility"],
        summary: "Bag sizes available at this facility",
        parameters: [uuidPath("facilityId", "Facility id")],
        responses: ok("BagSizeList"),
      },
    },
    "/facility/{facilityId}/suppliers": {
      get: {
        tags: ["Facility"],
        summary: "Suppliers available to drop at this facility",
        parameters: [uuidPath("facilityId", "Facility id")],
        responses: ok("SupplierList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Register a supplier at this facility (status PENDING until login generated)",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("SupplierInput", ["name"]),
        responses: created("Supplier"),
      },
    },
    "/facility/{facilityId}/supplier-drops": {
      get: {
        tags: ["Facility"],
        summary: "List supplier drops (filters: from, to, supplier_id, page)",
        parameters: [uuidPath("facilityId", "Facility id"), q("from"), q("to"), q("supplier_id"), q("page")],
        responses: ok("DropList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Register a daily supplier drop with negotiated rent",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("DropInput", ["supplier_id", "drop_date"]),
        responses: created("SupplierDrop"),
      },
    },
    "/facility/{facilityId}/supplier-drops/{dropId}": {
      put: {
        tags: ["Facility"],
        summary: "Update a drop (workers, rent, status)",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("dropId", "Drop id")],
        requestBody: body("DropUpdate"),
        responses: ok("SupplierDrop"),
      },
    },
    "/facility/{facilityId}/tolis": {
      get: {
        tags: ["Facility"],
        summary: "List tolis for this facility",
        parameters: [uuidPath("facilityId", "Facility id"), q("from"), q("to"), q("q"), q("page")],
        responses: ok("ToliList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Create a toli (also registers the leader)",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("ToliInput", ["leader_name", "date"]),
        responses: created("Toli"),
      },
    },
    "/facility/{facilityId}/tolis/{toliId}": {
      put: {
        tags: ["Facility"],
        summary: "Update a toli",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("toliId", "Toli id")],
        requestBody: body("ToliUpdate"),
        responses: ok("Toli"),
      },
      delete: {
        tags: ["Facility"],
        summary: "Delete a toli",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("toliId", "Toli id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/facility/{facilityId}/tolis/{toliId}/leader": {
      put: {
        tags: ["Facility"],
        summary: "Edit the toli leader's name/phone (keeps registry + login in sync)",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("toliId", "Toli id")],
        requestBody: body("LeaderUpdate", ["leader_name"]),
        responses: ok("Toli"),
      },
    },
    "/facility/{facilityId}/work-entries": {
      get: {
        tags: ["Facility"],
        summary: "List work entries (filters: from, to, toli_id, status, q, page)",
        parameters: [uuidPath("facilityId", "Facility id"), q("from"), q("to"), q("toli_id"), q("status"), q("q"), q("page")],
        responses: ok("WorkEntryList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Record daily work (rate resolved from facility override or global)",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("WorkEntryInput", ["toli_id", "work_date", "bag_size_id", "quantity_bags"]),
        responses: created("WorkEntry"),
      },
    },
    "/facility/{facilityId}/work-entries/toli/{toliId}": {
      get: {
        tags: ["Facility"],
        summary: "Work entries for one toli",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("toliId", "Toli id")],
        responses: ok("WorkEntryList"),
      },
    },
    "/facility/{facilityId}/work-entries/{entryId}": {
      put: {
        tags: ["Facility"],
        summary: "Update a work entry",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("entryId", "Work entry id")],
        requestBody: body("WorkEntryUpdate"),
        responses: ok("WorkEntry"),
      },
    },
    "/facility/{facilityId}/work-entries/{entryId}/approve": {
      post: {
        tags: ["Facility"],
        summary: "Approve a work entry",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("entryId", "Work entry id")],
        responses: ok("WorkEntry"),
      },
    },
    "/facility/{facilityId}/work-entries/{entryId}/reject": {
      post: {
        tags: ["Facility"],
        summary: "Reject a work entry",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("entryId", "Work entry id")],
        responses: ok("WorkEntry"),
      },
    },
    "/facility/{facilityId}/work-entries/{entryId}/confirm": {
      post: {
        tags: ["Facility"],
        summary: "Mark a work entry as confirmed",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("entryId", "Work entry id")],
        responses: ok("WorkEntry"),
      },
    },
    "/facility/{facilityId}/rates": {
      get: {
        tags: ["Facility"],
        summary: "Effective rates at this facility (overrides + global)",
        parameters: [uuidPath("facilityId", "Facility id")],
        responses: ok("RateList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Set a facility-specific rate override",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("RateInput", ["bag_size_id", "rate_amount"]),
        responses: created("Rate"),
      },
    },
    "/facility/{facilityId}/weekly-summary": {
      get: {
        tags: ["Facility"],
        summary: "Weekly work summaries (filters: weekStart, weekEnd, status, q, page)",
        parameters: [uuidPath("facilityId", "Facility id"), q("weekStart"), q("weekEnd"), q("status"), q("q"), q("page")],
        responses: ok("SummaryList"),
      },
    },
    "/facility/{facilityId}/weekly-summary/generate": {
      post: {
        tags: ["Facility"],
        summary: "Generate weekly summaries for a week",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("WeekParams", ["weekStart", "weekEnd"]),
        responses: ok("SummaryGenerateResponse"),
      },
    },
    "/facility/{facilityId}/weekly-summary/{summaryId}/approve": {
      post: {
        tags: ["Facility"],
        summary: "Approve a weekly summary",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("summaryId", "Summary id")],
        responses: ok("WeeklySummary"),
      },
    },
    "/facility/{facilityId}/weekly-summary/{summaryId}/reject": {
      post: {
        tags: ["Facility"],
        summary: "Reject a weekly summary",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("summaryId", "Summary id")],
        responses: ok("WeeklySummary"),
      },
    },
    "/facility/{facilityId}/payments/pending": {
      get: {
        tags: ["Facility"],
        summary: "Pending supplier payments for a week (weekStart/weekEnd query)",
        parameters: [uuidPath("facilityId", "Facility id"), q("weekStart"), q("weekEnd")],
        responses: ok("PaymentPendingList"),
      },
    },
    "/facility/{facilityId}/supplier/{supplierId}/payment": {
      get: {
        tags: ["Facility"],
        summary: "A supplier's payment for a week (weekStart/weekEnd query)",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("supplierId", "Supplier id"), q("weekStart"), q("weekEnd")],
        responses: ok("SupplierPayment"),
      },
    },
    "/facility/{facilityId}/payments/process": {
      post: {
        tags: ["Facility"],
        summary: "Process Sunday payments — locks PENDING payments with optional advance deductions",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("ProcessPaymentsRequest", ["weekStart", "weekEnd"]),
        responses: ok("ProcessPaymentsResponse"),
      },
    },
    "/facility/{facilityId}/payments/history": {
      get: {
        tags: ["Facility"],
        summary: "Payment history (page, pageSize)",
        parameters: [uuidPath("facilityId", "Facility id"), q("page"), q("pageSize")],
        responses: ok("PaymentList"),
      },
    },
    "/facility/{facilityId}/advances": {
      get: {
        tags: ["Facility"],
        summary: "Advance ledger (page, q)",
        parameters: [uuidPath("facilityId", "Facility id"), q("page"), q("pageSize"), q("q")],
        responses: ok("AdvanceList"),
      },
      post: {
        tags: ["Facility"],
        summary: "Record a supplier advance",
        parameters: [uuidPath("facilityId", "Facility id")],
        requestBody: body("AdvanceInput", ["supplier_id", "amount"]),
        responses: created("SupplierAdvance"),
      },
    },
    "/facility/{facilityId}/advances/outstanding": {
      get: {
        tags: ["Facility"],
        summary: "Outstanding advance per supplier",
        parameters: [uuidPath("facilityId", "Facility id")],
        responses: ok("OutstandingAdvances"),
      },
    },
    "/facility/{facilityId}/advances/{id}": {
      delete: {
        tags: ["Facility"],
        summary: "Delete an advance (blocked once any recovery has been recorded)",
        parameters: [uuidPath("facilityId", "Facility id"), uuidPath("id", "Advance id")],
        responses: ok(undefined, "Deleted"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Supplier                                                   */
    /* ---------------------------------------------------------- */
    "/supplier/dashboard": {
      get: { tags: ["Supplier"], summary: "Supplier dashboard", responses: ok("Dashboard") },
    },
    "/supplier/profile": {
      get: { tags: ["Supplier"], summary: "Own supplier profile record", responses: ok("Supplier") },
      put: {
        tags: ["Supplier"],
        summary: "Update own supplier profile (name/phone/contact person/address/city)",
        requestBody: body("SupplierInput"),
        responses: ok("Supplier"),
      },
    },
    "/supplier/drops": {
      get: {
        tags: ["Supplier"],
        summary: "My drops (page, from, to)",
        parameters: [q("page"), q("from"), q("to")],
        responses: ok("DropList"),
      },
    },
    "/supplier/drops/register": {
      post: {
        tags: ["Supplier"],
        summary: "Register a drop at a facility",
        requestBody: body("SupplierDropRegister", ["facility_id", "drop_date", "total_workers_dropped"]),
        responses: created("SupplierDrop"),
      },
    },
    "/supplier/drops/{dropId}": {
      get: {
        tags: ["Supplier"],
        summary: "Drop detail with tolis and rent",
        parameters: [uuidPath("dropId", "Drop id")],
        responses: ok("SupplierDrop"),
      },
    },
    "/supplier/work-entries": {
      get: {
        tags: ["Supplier"],
        summary: "Work entries for my drops",
        parameters: [q("page")],
        responses: ok("WorkEntryList"),
      },
    },
    "/supplier/work-entries/drop/{dropId}": {
      get: {
        tags: ["Supplier"],
        summary: "Work entries for one of my drops",
        parameters: [uuidPath("dropId", "Drop id")],
        responses: ok("WorkEntryList"),
      },
    },
    "/supplier/this-week": {
      get: { tags: ["Supplier"], summary: "This week's summary (earnings, rent, net)", responses: ok("SupplierWeek") },
    },
    "/supplier/payment-pending": {
      get: { tags: ["Supplier"], summary: "Payment pending collection this week", responses: ok("SupplierPayment") },
    },
    "/supplier/collect-payment": {
      post: {
        tags: ["Supplier"],
        summary: "Mark a payment as collected from the facility",
        requestBody: body("CollectPaymentRequest", ["payment_id", "payment_method"]),
        responses: ok("SupplierPayment"),
      },
    },
    "/supplier/distribute-payment": {
      post: {
        tags: ["Supplier"],
        summary: "Record distribution of the net payment to toli leaders (total ≤ net payment)",
        requestBody: body("DistributePaymentRequest", ["payment_id", "distributions"]),
        responses: ok("SupplierPayment"),
      },
    },
    "/supplier/payment-history": {
      get: {
        tags: ["Supplier"],
        summary: "My payment history (page, pageSize)",
        parameters: [q("page"), q("pageSize")],
        responses: ok("PaymentList"),
      },
    },
    "/supplier/advances": {
      get: {
        tags: ["Supplier"],
        summary: "My advances — total given, outstanding, per-facility breakdown, history",
        responses: ok("MyAdvances"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Toli leader                                                */
    /* ---------------------------------------------------------- */
    "/toli-leader/my-toli": {
      get: { tags: ["Toli Leader"], summary: "My toli details (with facility and drop)", responses: ok("Toli") },
    },
    "/toli-leader/today-work": {
      get: { tags: ["Toli Leader"], summary: "Today's work entries for my toli", responses: ok("WorkEntryList") },
    },
    "/toli-leader/weekly-earnings": {
      get: { tags: ["Toli Leader"], summary: "My weekly earnings breakdown", responses: ok("LeaderEarnings") },
    },
    "/toli-leader/payment-history": {
      get: {
        tags: ["Toli Leader"],
        summary: "My distribution payments history",
        parameters: [q("page"), q("pageSize")],
        responses: ok("DistributionList"),
      },
    },
    "/toli-leader/work-entries/{entryId}/confirm": {
      put: {
        tags: ["Toli Leader"],
        summary: "Confirm a work entry recorded against my toli",
        parameters: [uuidPath("entryId", "Work entry id")],
        responses: ok("WorkEntry"),
      },
    },

    /* ---------------------------------------------------------- */
    /* Sales                                                      */
    /* ---------------------------------------------------------- */
    "/sales/buyers": {
      get: { tags: ["Sales"], summary: "List buyers", responses: ok("BuyerList") },
      post: {
        tags: ["Sales"],
        summary: "Create a buyer",
        requestBody: body("BuyerInput", ["name"]),
        responses: created("Buyer"),
      },
    },
    "/sales/buyers/{buyerId}": {
      put: {
        tags: ["Sales"],
        summary: "Update a buyer",
        parameters: [uuidPath("buyerId", "Buyer id")],
        requestBody: body("BuyerInput"),
        responses: ok("Buyer"),
      },
      delete: {
        tags: ["Sales"],
        summary: "Delete a buyer",
        parameters: [uuidPath("buyerId", "Buyer id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/sales/orders": {
      get: {
        tags: ["Sales"],
        summary: "List sales orders (filters: status, q, from, to, page)",
        parameters: [q("status"), q("q"), q("from"), q("to"), q("page")],
        responses: ok("OrderList"),
      },
      post: {
        tags: ["Sales"],
        summary: "Create a sales order (company admins)",
        requestBody: body("OrderInput", ["facility_id", "buyer_id", "order_date", "items"]),
        responses: created("SalesOrder"),
      },
    },
    "/sales/orders/{orderId}": {
      get: {
        tags: ["Sales"],
        summary: "Order detail with items",
        parameters: [uuidPath("orderId", "Order id")],
        responses: ok("SalesOrder"),
      },
    },
    "/sales/orders/{orderId}/cancel": {
      post: {
        tags: ["Sales"],
        summary: "Cancel a sales order",
        parameters: [uuidPath("orderId", "Order id")],
        responses: ok("SalesOrder"),
      },
    },
    "/sales/orders/{orderId}/dispatch": {
      post: {
        tags: ["Sales"],
        summary: "Create a dispatch against the order (bags loaded per line)",
        parameters: [uuidPath("orderId", "Order id")],
        requestBody: body("DispatchInput", ["vehicle_type", "items"]),
        responses: created("Dispatch"),
      },
    },
    "/sales/orders/{orderId}/payments": {
      post: {
        tags: ["Sales"],
        summary: "Record a payment against an order",
        parameters: [uuidPath("orderId", "Order id")],
        requestBody: body("OrderPaymentInput", ["amount"]),
        responses: created("OrderPayment"),
      },
    },
    "/sales/summary": {
      get: { tags: ["Sales"], summary: "Sales summary (totals, paid, outstanding)", responses: ok("Dashboard") },
    },

    /* ---------------------------------------------------------- */
    /* Subscriptions                                              */
    /* ---------------------------------------------------------- */
    "/subscriptions/plans": {
      get: { tags: ["Subscriptions"], summary: "List subscription plans (public)", security: pub(), responses: ok("PlanList") },
      post: {
        tags: ["Subscriptions"],
        summary: "Create a plan (Super Admin)",
        requestBody: body("PlanInput", ["name", "type", "price"]),
        responses: created("SubscriptionPlan"),
      },
    },
    "/subscriptions/plans/{planId}": {
      put: {
        tags: ["Subscriptions"],
        summary: "Update a plan (Super Admin)",
        parameters: [uuidPath("planId", "Plan id")],
        requestBody: body("PlanInput"),
        responses: ok("SubscriptionPlan"),
      },
      delete: {
        tags: ["Subscriptions"],
        summary: "Delete a plan (Super Admin)",
        parameters: [uuidPath("planId", "Plan id")],
        responses: ok(undefined, "Deleted"),
      },
    },
    "/subscriptions/": {
      get: {
        tags: ["Subscriptions"],
        summary: "List subscriptions (Super Admin)",
        parameters: [q("status")],
        responses: ok("SubscriptionList"),
      },
      post: {
        tags: ["Subscriptions"],
        summary: "Create a subscription (Super Admin)",
        requestBody: body("SubscriptionInput", ["plan_id", "start_date", "end_date"]),
        responses: created("Subscription"),
      },
    },
    "/subscriptions/stats": {
      get: { tags: ["Subscriptions"], summary: "Subscription statistics (Super Admin)", responses: ok("Dashboard") },
    },
    "/subscriptions/{subId}/status": {
      put: {
        tags: ["Subscriptions"],
        summary: "Update a subscription status (Super Admin)",
        parameters: [uuidPath("subId", "Subscription id")],
        requestBody: body("SubscriptionStatusInput", ["status"]),
        responses: ok("Subscription"),
      },
    },
    "/subscriptions/{subId}/payments": {
      get: {
        tags: ["Subscriptions"],
        summary: "Payments for a subscription",
        parameters: [uuidPath("subId", "Subscription id")],
        responses: ok("SubscriptionPaymentList"),
      },
      post: {
        tags: ["Subscriptions"],
        summary: "Record a subscription payment (Super Admin)",
        parameters: [uuidPath("subId", "Subscription id")],
        requestBody: body("SubscriptionPaymentInput", ["amount"]),
        responses: created("SubscriptionPayment"),
      },
    },
    "/subscriptions/{subId}/renew": {
      post: {
        tags: ["Subscriptions"],
        summary: "Renew a subscription (Super Admin)",
        parameters: [uuidPath("subId", "Subscription id")],
        requestBody: body("RenewInput", ["new_start", "new_end"]),
        responses: ok("Subscription"),
      },
    },
    "/subscriptions/{subId}/renewals": {
      get: {
        tags: ["Subscriptions"],
        summary: "Renewal history for a subscription",
        parameters: [uuidPath("subId", "Subscription id")],
        responses: ok("RenewalList"),
      },
    },
    "/subscriptions/my-subscription": {
      get: { tags: ["Subscriptions"], summary: "My active subscription", responses: ok("Subscription") },
    },
    "/subscriptions/plans/available": {
      get: { tags: ["Subscriptions"], summary: "Plans available to me", security: pub(), responses: ok("PlanList") },
    },
    "/subscriptions/alerts/expiring": {
      get: { tags: ["Subscriptions"], summary: "Expiring / expired subscriptions (Super Admin)", responses: ok("SubscriptionList") },
    },
    "/subscriptions/auto-expire": {
      post: { tags: ["Subscriptions"], summary: "Auto-expire overdue subscriptions (Super Admin)", responses: ok(undefined, "Expired") },
    },
    "/subscriptions/my-status": {
      get: { tags: ["Subscriptions"], summary: "My subscription status + plan", responses: ok("Subscription") },
    },

    /* ---------------------------------------------------------- */
    /* Reports                                                    */
    /* ---------------------------------------------------------- */
    "/reports/meta/types": {
      get: {
        tags: ["Reports"],
        summary: "Report types available to the caller's role",
        responses: ok("ReportTypes"),
      },
    },
    "/reports/{type}": {
      get: {
        tags: ["Reports"],
        summary: "Report data as JSON",
        parameters: [
          { name: "type", in: "path", required: true, schema: { type: "string", enum: ["payments", "drops", "work", "summaries", "distributions", "supplier-statements", "rent", "supplier-invoice", "supplier-advance-statement", "subscription-earnings", "subscription-monthly"] }, description: "Report type" },
          q("from"), q("to"), q("facilityId"), q("supplierId"),
        ],
        responses: ok("Report"),
      },
    },
    "/reports/{type}/excel": {
      get: {
        tags: ["Reports"],
        summary: "Download report as XLSX",
        parameters: [
          { name: "type", in: "path", required: true, schema: { type: "string" }, description: "Report type" },
          q("from"), q("to"), q("facilityId"), q("supplierId"),
        ],
        responses: { 200: err("XLSX file"), ...stdErrors() },
      },
    },
    "/reports/{type}/pdf": {
      get: {
        tags: ["Reports"],
        summary: "Download report as PDF",
        parameters: [
          { name: "type", in: "path", required: true, schema: { type: "string" }, description: "Report type" },
          q("from"), q("to"), q("facilityId"), q("supplierId"),
        ],
        responses: { 200: err("PDF file"), ...stdErrors() },
      },
    },

    /* ---------------------------------------------------------- */
    /* GitHub                                                     */
    /* ---------------------------------------------------------- */
    "/super-admin/github/status": {
      get: { tags: ["GitHub"], summary: "GitHub integration status", responses: ok("GithubStatus") },
    },
    "/super-admin/github/create-repo": {
      post: {
        tags: ["GitHub"],
        summary: "Create the target repository if it does not exist",
        requestBody: body("GithubRepoInput"),
        responses: ok("GithubResult"),
      },
    },
    "/super-admin/github/push": {
      post: {
        tags: ["GitHub"],
        summary: "Push the project to the configured GitHub repository",
        requestBody: body("GithubPushRequest"),
        responses: ok("GithubResult"),
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    parameters: {
      FacilityId: pathParam("facilityId", "Facility id"),
      CompanyId: pathParam("companyId", "Company id"),
      SupplierId: pathParam("supplierId", "Supplier id"),
    },
    responses: {
      Unauthorized: err("Unauthorized"),
      Forbidden: err("Forbidden"),
      NotFound: err("Not found"),
    },
    schemas: {
      /* ---- auth ---- */
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      AuthUser: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          role: { type: "string", enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "FACILITY_ADMIN", "TOLI_LEADER", "SUPPLIER"] },
          companyId: { type: "string", format: "uuid", nullable: true },
          companyName: { type: "string", nullable: true },
          facilityId: { type: "string", format: "uuid", nullable: true },
          facilityName: { type: "string", nullable: true },
          supplierId: { type: "string", format: "uuid", nullable: true },
          supplierName: { type: "string", nullable: true },
          toliId: { type: "string", format: "uuid", nullable: true },
          toliName: { type: "string", nullable: true },
        },
      },
      LoginRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
        required: ["email", "password"],
      },
      TokenPair: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      AuthSession: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          user: ref("AuthUser"),
        },
      },
      RefreshRequest: {
        type: "object",
        properties: { refreshToken: { type: "string" } },
        required: ["refreshToken"],
      },
      MeResponse: {
        type: "object",
        properties: { user: ref("AuthUser") },
      },
      ForgotPasswordRequest: {
        type: "object",
        properties: { email: { type: "string", format: "email" } },
        required: ["email"],
      },
      ResetPasswordRequest: {
        type: "object",
        properties: { token: { type: "string" }, password: { type: "string", minLength: 6 } },
        required: ["token", "password"],
      },
      ChangePasswordRequest: {
        type: "object",
        properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 6 } },
        required: ["currentPassword", "newPassword"],
      },
      AdminResetPasswordRequest: {
        type: "object",
        properties: { userId: { type: "string", format: "uuid" }, newPassword: { type: "string", minLength: 6 } },
        required: ["userId", "newPassword"],
      },
      ProfileUpdate: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string", nullable: true },
          email: { type: "string", format: "email" },
          contact_person: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
        },
      },

      /* ---- users / companies / facilities ---- */
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string", nullable: true },
          role: { type: "string" },
          company_id: { type: "string", format: "uuid", nullable: true },
          facility_id: { type: "string", format: "uuid", nullable: true },
          supplier_id: { type: "string", format: "uuid", nullable: true },
          toli_id: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      UserList: { type: "object", properties: { users: { type: "array", items: ref("User") } } },
      UserEditInput: {
        type: "object",
        properties: { name: { type: "string" }, phone: { type: "string", nullable: true }, email: { type: "string", format: "email" } },
        required: ["name", "email"],
      },
      CompanyAdminInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          company_id: { type: "string", format: "uuid" },
          password: { type: "string", minLength: 6 },
        },
        required: ["name", "email", "company_id", "password"],
      },
      FacilityAdminInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          facility_id: { type: "string", format: "uuid" },
          password: { type: "string", minLength: 6 },
        },
        required: ["name", "email", "facility_id", "password"],
      },
      Company: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          contact_person: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          is_active: { type: "boolean" },
        },
      },
      CompanyList: { type: "object", properties: { companies: { type: "array", items: ref("Company") } } },
      CompanyInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          contact_person: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
        },
        required: ["name"],
      },
      Facility: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          company_id: { type: "string", format: "uuid", nullable: true },
          name: { type: "string" },
          location: { type: "string" },
          city: { type: "string", nullable: true },
          capacity: { type: "integer" },
          is_active: { type: "boolean" },
        },
      },
      FacilityList: { type: "object", properties: { facilities: { type: "array", items: ref("Facility") } } },
      FacilityInput: {
        type: "object",
        properties: {
          company_id: { type: "string", format: "uuid", nullable: true },
          name: { type: "string" },
          location: { type: "string" },
          city: { type: "string" },
          capacity: { type: "integer" },
        },
        required: ["name", "location"],
      },

      /* ---- catalog ---- */
      BagSize: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          size_name: { type: "string" },
          weight_kg: { type: "integer" },
          is_global: { type: "boolean" },
        },
      },
      BagSizeList: { type: "object", properties: { bagSizes: { type: "array", items: ref("BagSize") } } },
      BagSizeInput: {
        type: "object",
        properties: { size_name: { type: "string" }, weight_kg: { type: "integer" } },
        required: ["size_name", "weight_kg"],
      },
      Rate: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          bag_size_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid", nullable: true },
          rate_amount: { type: "integer" },
          is_global: { type: "boolean" },
        },
      },
      RateList: { type: "object", properties: { rates: { type: "array", items: ref("Rate") } } },
      RateInput: {
        type: "object",
        properties: {
          bag_size_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid", nullable: true },
          rate_amount: { type: "integer" },
        },
        required: ["bag_size_id", "rate_amount"],
      },

      /* ---- suppliers ---- */
      Supplier: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          contact_person: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          status: { type: "string", enum: ["PENDING", "ACTIVE"] },
          facility_id: { type: "string", format: "uuid", nullable: true },
        },
      },
      SupplierList: { type: "object", properties: { suppliers: { type: "array", items: ref("Supplier") } } },
      SupplierInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email", nullable: true },
          phone: { type: "string", nullable: true },
          contact_person: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          create_login: { type: "boolean" },
          password: { type: "string", minLength: 6 },
        },
        required: ["name"],
      },
      GenerateLoginRequest: {
        type: "object",
        properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 6 } },
        required: ["email", "password"],
      },
      SupplierWithUser: {
        type: "object",
        properties: { supplier: ref("Supplier"), user: { type: "object", nullable: true, allOf: [ref("User")] } },
      },

      /* ---- operations ---- */
      SupplierDrop: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          drop_date: { type: "string", format: "date" },
          total_workers_dropped: { type: "integer" },
          rent_per_drop: { type: "integer" },
          status: { type: "string", enum: ["REGISTERED", "COMPLETED"] },
        },
      },
      DropList: { type: "object", properties: { drops: { type: "array", items: ref("SupplierDrop") }, total: { type: "integer" } } },
      DropInput: {
        type: "object",
        properties: {
          supplier_id: { type: "string", format: "uuid" },
          drop_date: { type: "string", format: "date" },
          total_workers_dropped: { type: "integer" },
          rent_per_drop: { type: "integer" },
        },
        required: ["supplier_id", "drop_date"],
      },
      DropUpdate: {
        type: "object",
        properties: {
          total_workers_dropped: { type: "integer" },
          rent_per_drop: { type: "integer" },
          status: { type: "string", enum: ["REGISTERED", "COMPLETED"] },
        },
      },
      SupplierDropRegister: {
        type: "object",
        properties: {
          facility_id: { type: "string", format: "uuid" },
          drop_date: { type: "string", format: "date" },
          total_workers_dropped: { type: "integer" },
          rent_per_drop: { type: "integer" },
        },
        required: ["facility_id", "drop_date", "total_workers_dropped"],
      },
      Toli: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          leader_id: { type: "string", format: "uuid", nullable: true },
          leader_name: { type: "string" },
          worker_count: { type: "integer" },
          daily_charge: { type: "integer" },
          date: { type: "string", format: "date" },
          drop_id: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "COMPLETED"] },
        },
      },
      ToliList: { type: "object", properties: { tolis: { type: "array", items: ref("Toli") }, total: { type: "integer" } } },
      ToliInput: {
        type: "object",
        properties: {
          leader_name: { type: "string" },
          worker_count: { type: "integer" },
          daily_charge: { type: "integer" },
          date: { type: "string", format: "date" },
          drop_id: { type: "string", format: "uuid", nullable: true },
        },
        required: ["leader_name", "date"],
      },
      ToliUpdate: {
        type: "object",
        properties: {
          leader_name: { type: "string" },
          worker_count: { type: "integer" },
          daily_charge: { type: "integer" },
          drop_id: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "COMPLETED"] },
        },
      },
      LeaderUpdate: {
        type: "object",
        properties: { leader_name: { type: "string" }, phone: { type: "string", nullable: true } },
        required: ["leader_name"],
      },
      WorkEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          toli_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          work_date: { type: "string", format: "date" },
          bag_size_id: { type: "string", format: "uuid" },
          onion_category: { type: "string", nullable: true },
          quantity_bags: { type: "integer" },
          rate_per_bag: { type: "integer" },
          total_amount: { type: "integer" },
          status: { type: "string", enum: ["DRAFT", "APPROVED", "PAID"] },
          leader_confirmed_at: { type: "string", format: "date-time", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      WorkEntryList: { type: "object", properties: { entries: { type: "array", items: ref("WorkEntry") }, total: { type: "integer" } } },
      WorkEntryInput: {
        type: "object",
        properties: {
          toli_id: { type: "string", format: "uuid" },
          work_date: { type: "string", format: "date" },
          bag_size_id: { type: "string", format: "uuid" },
          quantity_bags: { type: "integer" },
          onion_category: { type: "string" },
          notes: { type: "string" },
        },
        required: ["toli_id", "work_date", "bag_size_id", "quantity_bags"],
      },
      WorkEntryUpdate: {
        type: "object",
        properties: {
          quantity_bags: { type: "integer" },
          onion_category: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      WeeklySummary: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          toli_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid", nullable: true },
          week_start_date: { type: "string", format: "date" },
          week_end_date: { type: "string", format: "date" },
          total_bags_processed: { type: "integer" },
          total_work_amount: { type: "integer" },
          daily_charge_agreed_amount: { type: "integer" },
          total_earnings: { type: "integer" },
          approval_status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
        },
      },
      SummaryList: { type: "object", properties: { summaries: { type: "array", items: ref("WeeklySummary") }, total: { type: "integer" } } },
      SummaryGenerateResponse: {
        type: "object",
        properties: { summaries: { type: "array", items: ref("WeeklySummary") }, count: { type: "integer" } },
      },
      WeekParams: {
        type: "object",
        properties: {
          weekStart: { type: "string", format: "date" },
          weekEnd: { type: "string", format: "date" },
        },
        required: ["weekStart", "weekEnd"],
      },

      /* ---- payments & advances ---- */
      SupplierPayment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          week_start_date: { type: "string", format: "date" },
          week_end_date: { type: "string", format: "date" },
          total_worker_earnings: { type: "integer" },
          total_drops: { type: "integer" },
          total_rent_charges: { type: "integer" },
          advance_deducted: { type: "integer" },
          advance_balance_before: { type: "integer" },
          net_payment: { type: "integer" },
          collection_status: { type: "string", enum: ["PENDING", "COLLECTED_FROM_FACILITY", "DISTRIBUTED_TO_WORKERS"] },
          payment_method: { type: "string", enum: ["CASH", "BANK_TRANSFER"], nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      PaymentList: { type: "object", properties: { payments: { type: "array", items: ref("SupplierPayment") }, total: { type: "integer" } } },
      PaymentPendingList: {
        type: "object",
        properties: {
          pending: { type: "array", items: ref("SupplierPayment") },
          weekStart: { type: "string" },
          weekEnd: { type: "string" },
        },
      },
      ProcessPaymentsRequest: {
        type: "object",
        properties: {
          weekStart: { type: "string", format: "date" },
          weekEnd: { type: "string", format: "date" },
          advanceDeductions: {
            type: "object",
            additionalProperties: { type: "integer" },
            description: "Map of supplier_id → amount to deduct from the weekly net payment",
          },
        },
        required: ["weekStart", "weekEnd"],
      },
      ProcessPaymentsResponse: {
        type: "object",
        properties: { processed: { type: "array", items: ref("SupplierPayment") } },
      },
      SupplierAdvance: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          amount: { type: "integer" },
          advance_date: { type: "string", format: "date" },
          payment_method: { type: "string", enum: ["CASH", "BANK_TRANSFER"] },
          notes: { type: "string", nullable: true },
        },
      },
      AdvanceList: {
        type: "object",
        properties: {
          advances: {
            type: "array",
            items: {
              type: "object",
              properties: { advance: ref("SupplierAdvance"), supplier: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } },
            },
          },
          total: { type: "integer" },
        },
      },
      AdvanceInput: {
        type: "object",
        properties: {
          supplier_id: { type: "string", format: "uuid" },
          amount: { type: "integer" },
          advance_date: { type: "string", format: "date" },
          payment_method: { type: "string", enum: ["CASH", "BANK_TRANSFER"] },
          notes: { type: "string" },
        },
        required: ["supplier_id", "amount"],
      },
      OutstandingAdvances: {
        type: "object",
        properties: { outstanding: { type: "object", additionalProperties: { type: "integer" } } },
      },
      MyAdvances: {
        type: "object",
        properties: {
          advances: { type: "array", items: ref("SupplierAdvance") },
          totalGiven: { type: "integer" },
          totalOutstanding: { type: "integer" },
          byFacility: {
            type: "array",
            items: {
              type: "object",
              properties: { facilityId: { type: "string" }, outstanding: { type: "integer" } },
            },
          },
        },
      },
      CollectPaymentRequest: {
        type: "object",
        properties: {
          payment_id: { type: "string", format: "uuid" },
          payment_method: { type: "string", enum: ["CASH", "BANK_TRANSFER"] },
          notes: { type: "string" },
        },
        required: ["payment_id", "payment_method"],
      },
      DistributePaymentRequest: {
        type: "object",
        properties: {
          payment_id: { type: "string", format: "uuid" },
          distributions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                toli_id: { type: "string", format: "uuid" },
                amount: { type: "integer" },
                method: { type: "string", enum: ["CASH", "BANK_TRANSFER"] },
                notes: { type: "string" },
              },
              required: ["toli_id", "amount"],
            },
          },
        },
        required: ["payment_id", "distributions"],
      },
      SupplierWeek: {
        type: "object",
        properties: {
          weekStart: { type: "string" },
          weekEnd: { type: "string" },
          totalEarnings: { type: "integer" },
          totalRent: { type: "integer" },
          netPayment: { type: "integer" },
        },
      },
      LeaderEarnings: {
        type: "object",
        properties: {
          weekStart: { type: "string" },
          weekEnd: { type: "string" },
          totalEarnings: { type: "integer" },
          paymentStatus: { type: "string" },
        },
      },
      Distribution: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          supplier_payment_id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid" },
          toli_id: { type: "string", format: "uuid" },
          amount_distributed: { type: "integer" },
          distribution_date: { type: "string", format: "date-time" },
          payment_method: { type: "string" },
          notes: { type: "string", nullable: true },
        },
      },
      DistributionList: {
        type: "object",
        properties: { distributions: { type: "array", items: ref("Distribution") }, total: { type: "integer" } },
      },

      /* ---- sales ---- */
      Buyer: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          company_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          phone: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          is_active: { type: "boolean" },
        },
      },
      BuyerList: { type: "object", properties: { buyers: { type: "array", items: ref("Buyer") } } },
      BuyerInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
        },
        required: ["name"],
      },
      SalesOrderItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          onion_category: { type: "string", nullable: true },
          bag_size_id: { type: "string", format: "uuid" },
          quantity_bags: { type: "integer" },
          rate_per_bag: { type: "integer" },
          total_amount: { type: "integer" },
        },
      },
      SalesOrder: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          order_number: { type: "string" },
          company_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          buyer_id: { type: "string", format: "uuid" },
          order_date: { type: "string", format: "date" },
          status: { type: "string", enum: ["PENDING", "PARTIALLY_DISPATCHED", "COMPLETED", "CANCELLED"] },
          total_amount: { type: "integer" },
          notes: { type: "string", nullable: true },
        },
      },
      OrderList: { type: "object", properties: { orders: { type: "array", items: ref("SalesOrder") }, total: { type: "integer" } } },
      OrderInput: {
        type: "object",
        properties: {
          facility_id: { type: "string", format: "uuid" },
          buyer_id: { type: "string", format: "uuid" },
          order_date: { type: "string", format: "date" },
          notes: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                onion_category: { type: "string" },
                bag_size_id: { type: "string", format: "uuid" },
                quantity_bags: { type: "integer" },
                rate_per_bag: { type: "integer" },
              },
              required: ["bag_size_id", "quantity_bags", "rate_per_bag"],
            },
          },
        },
        required: ["facility_id", "buyer_id", "order_date", "items"],
      },
      Dispatch: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          order_id: { type: "string", format: "uuid" },
          facility_id: { type: "string", format: "uuid" },
          vehicle_type: { type: "string", enum: ["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"] },
          vehicle_number: { type: "string", nullable: true },
          destination: { type: "string", nullable: true },
          dispatch_date: { type: "string", format: "date-time" },
          notes: { type: "string", nullable: true },
        },
      },
      DispatchInput: {
        type: "object",
        properties: {
          vehicle_type: { type: "string", enum: ["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"] },
          vehicle_number: { type: "string" },
          destination: { type: "string" },
          dispatch_date: { type: "string", format: "date-time" },
          notes: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order_item_id: { type: "string", format: "uuid" },
                quantity_bags: { type: "integer" },
              },
              required: ["order_item_id", "quantity_bags"],
            },
          },
        },
        required: ["vehicle_type", "items"],
      },
      OrderPayment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          order_id: { type: "string", format: "uuid" },
          amount: { type: "integer" },
          payment_date: { type: "string", format: "date-time" },
          payment_method: { type: "string" },
          reference_number: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      OrderPaymentInput: {
        type: "object",
        properties: {
          amount: { type: "integer" },
          payment_date: { type: "string", format: "date-time" },
          payment_method: { type: "string" },
          reference_number: { type: "string" },
          notes: { type: "string" },
        },
        required: ["amount"],
      },

      /* ---- subscriptions ---- */
      SubscriptionPlan: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          type: { type: "string", enum: ["COMPANY", "SUPPLIER"] },
          price: { type: "integer" },
          billing_cycle: { type: "string", enum: ["monthly", "quarterly", "half-yearly", "yearly"] },
          description: { type: "string", nullable: true },
          is_active: { type: "boolean" },
        },
      },
      PlanList: { type: "object", properties: { plans: { type: "array", items: ref("SubscriptionPlan") } } },
      PlanInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["COMPANY", "SUPPLIER"] },
          price: { type: "integer" },
          billing_cycle: { type: "string", enum: ["monthly", "quarterly", "half-yearly", "yearly"] },
          description: { type: "string" },
          features: { type: "array", items: { type: "string" } },
        },
        required: ["name", "type", "price"],
      },
      Subscription: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          plan_id: { type: "string", format: "uuid" },
          company_id: { type: "string", format: "uuid", nullable: true },
          supplier_id: { type: "string", format: "uuid", nullable: true },
          status: { type: "string", enum: ["ACTIVE", "EXPIRED", "PENDING", "CANCELLED"] },
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          auto_renew: { type: "boolean" },
          notes: { type: "string", nullable: true },
        },
      },
      SubscriptionList: { type: "object", properties: { subscriptions: { type: "array", items: ref("Subscription") } } },
      SubscriptionInput: {
        type: "object",
        properties: {
          plan_id: { type: "string", format: "uuid" },
          company_id: { type: "string", format: "uuid" },
          supplier_id: { type: "string", format: "uuid" },
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          notes: { type: "string" },
        },
        required: ["plan_id", "start_date", "end_date"],
      },
      SubscriptionStatusInput: {
        type: "object",
        properties: { status: { type: "string", enum: ["ACTIVE", "EXPIRED", "PENDING", "CANCELLED"] } },
        required: ["status"],
      },
      SubscriptionPayment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          subscription_id: { type: "string", format: "uuid" },
          amount: { type: "integer" },
          payment_date: { type: "string", format: "date-time" },
          payment_method: { type: "string" },
          reference_number: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      SubscriptionPaymentList: {
        type: "object",
        properties: { payments: { type: "array", items: ref("SubscriptionPayment") } },
      },
      SubscriptionPaymentInput: {
        type: "object",
        properties: {
          amount: { type: "integer" },
          payment_date: { type: "string", format: "date-time" },
          payment_method: { type: "string" },
          reference_number: { type: "string" },
          notes: { type: "string" },
        },
        required: ["amount"],
      },
      RenewInput: {
        type: "object",
        properties: {
          new_start: { type: "string", format: "date" },
          new_end: { type: "string", format: "date" },
        },
        required: ["new_start", "new_end"],
      },
      RenewalList: {
        type: "object",
        properties: { renewals: { type: "array", items: { type: "object", properties: { previous_start: { type: "string" }, previous_end: { type: "string" }, new_start: { type: "string" }, new_end: { type: "string" } } } } },
      },

      /* ---- misc ---- */
      Report: {
        type: "object",
        properties: {
          title: { type: "string" },
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: {} } },
          summary: { type: "object", additionalProperties: {} },
        },
      },
      ReportTypes: { type: "object", properties: { types: { type: "array", items: { type: "string" } } } },
      Dashboard: {
        type: "object",
        description: "Role-specific dashboard statistics (keys vary by role)",
        additionalProperties: {},
      },
      AuditLogList: {
        type: "object",
        properties: {
          logs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                user_id: { type: "string", nullable: true },
                user_role: { type: "string", nullable: true },
                action: { type: "string" },
                entity_type: { type: "string" },
                entity_id: { type: "string", nullable: true },
                old_values: { type: "object", additionalProperties: {} },
                new_values: { type: "object", additionalProperties: {} },
                timestamp: { type: "string", format: "date-time" },
              },
            },
          },
          total: { type: "integer" },
        },
      },
      GithubStatus: {
        type: "object",
        properties: {
          configured: { type: "boolean" },
          owner: { type: "string" },
          repo: { type: "string" },
          exists: { type: "boolean" },
        },
      },
      GithubRepoInput: {
        type: "object",
        properties: { owner: { type: "string" }, repo: { type: "string" } },
      },
      GithubPushRequest: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          message: { type: "string" },
        },
      },
      GithubResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          commitSha: { type: "string" },
          branch: { type: "string" },
        },
      },
    },
  },
};
