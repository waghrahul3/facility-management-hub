# Onion Facility Center — Project Document

> **Complete technical & functional reference** for the Onion Facility Center management platform.
> Companion to [`README.md`](./README.md) (setup & quick start).

**Stack:** React 19 + Vite + Tailwind (client) · Express 5 + TypeScript (API) · PostgreSQL + Drizzle ORM · JWT auth · ExcelJS/PDFKit reports · Resend email

---

## Table of contents

1. [System overview](#1-system-overview)
2. [User roles & permissions](#2-user-roles--permissions)
3. [High-level architecture](#3-high-level-architecture)
4. [Database schema](#4-database-schema)
5. [Key workflows](#5-key-workflows)
    - [5.1 The weekly facility cycle](#51-the-weekly-facility-cycle)
    - [5.2 Payment lifecycle (Sunday settlement → distribution)](#52-payment-lifecycle)
    - [5.3 Advance payments](#53-advance-payments)
    - [5.4 Sales orders & dispatches](#54-sales-orders--dispatches)
    - [5.5 Subscriptions & billing](#55-subscriptions--billing)
    - [5.6 Password reset & account management](#56-password-reset--account-management)
6. [API reference](#6-api-reference)
7. [Security model](#7-security-model)
8. [Reports & exports](#8-reports--exports)
9. [Internationalization](#9-internationalization)
10. [Frontend architecture](#10-frontend-architecture)
11. [Deployment notes](#11-deployment-notes)
12. [Roadmap](#12-roadmap)

---

## 1. System overview

The Onion Facility Center manages the full weekly operation of **onion storage & processing facilities**:

- **Multiple facilities**, each owned by a trading company (a facility can also be standalone).
- **Daily supplier drops** — suppliers bring in workers; each drop has a **negotiated rent**.
- **Tolis** — worker groups led by a toli leader, with a daily charge and worker count.
- **Daily work recording** — bagging/grading/packing entries by bag size and onion category, charged at a per-bag rate.
- **Weekly settlement** — the facility admin approves the week's summaries, then processes **Sunday payments** for every supplier.
- **Supplier-centric payment model** — the facility pays the supplier a **net amount** (worker earnings − rent charges − advance deductions); the supplier then **collects** it and **distributes** it to the toli leaders who did the work.
- **Advances** — cash given to suppliers before settlement, recovered manually from weekly payments.
- **Sales & subscriptions** — the platform also tracks outbound sales orders (company/facility side) and monetizes access with subscription plans.

### Business entities at a glance

```
Company 1──* Facility 1──* SupplierDrop (supplier + workers + rent)
                       │
                       ├──* Toli 1──* WorkEntry (bag size × qty × rate)
                       │      └──* ToliLeader
                       ├──* WeeklyWorkSummary (per toli, per week)
                       ├──* SupplierPayment (per supplier, per week)
                       │      └──* SupplierPaymentDistribution (per toli)
                       └──* SupplierAdvance
```

---

## 2. User roles & permissions

Five roles exist in one `users` table, discriminated by `role` and scoped by `company_id` / `facility_id` / `supplier_id` / `toli_id`.

### 2.1 Super Admin — global
- CRUD **companies**, **facilities**, **facility admins**, **company admins**
- Global **bag sizes** and **global rates**; view facility rate overrides
- Supplier registry (create/edit, **generate login accounts**)
- Cross-facility payment history, **audit log**, **reports**, **subscriptions**, GitHub integration

### 2.2 Company Admin — one company
- Manage their company's **facilities** (create + assign facility admins) and **buyers**
- Create & track **sales orders**, dispatches, order payments
- **Full facility-admin capabilities** inside any of their facilities via workspace tabs
  (`/company/facility/:facilityId/…`)

### 2.3 Facility Admin — one facility
- Register daily **supplier drops** (with per-drop rent), create **tolis**, record **work entries**
- Edit facility-specific **rates** (override global)
- Approve/reject **weekly summaries**
- Process **Sunday payments** (earnings + rent − advance deduction)
- Record & manage **supplier advances**; manage **sales** for the facility
- Edit toli leader details (name/phone) and reset their passwords

### 2.4 Supplier — own drops + facilities they operate in
- Register drops; view work entries on their drops; view rent charges per drop
- See weekly net payment (earnings + rent − advance deduction)
- **Collect** payment from the facility → **distribute** to toli leaders
- See advance balance + history; generate invoice & advance-statement reports
- Cannot edit work entries or approve payments

### 2.5 Toli Leader — own toli only
- View toli details, today's work, weekly earnings, payment history
- **Confirm/accept** work entries recorded against their toli
- Cannot edit or approve anything

---

## 3. High-level architecture

```
┌──────────────────────────┐        ┌──────────────────────────────┐
│  React SPA (Vite)        │  /api  │  Express 5 API               │
│  pages/<role>/…          │ ─────► │  routes/<role>/…             │
│  lib/api.ts (JWT fetch)  │        │  auth/middleware (RBAC)      │
│  lib/auth.tsx (session)  │        │  services/payments.ts        │
│  components/ui.tsx       │        │  lib/reports/* (xlsx/pdf)    │
└──────────────────────────┘        └──────────────┬───────────────┘
                                                  │ Drizzle ORM
                                          ┌───────▼────────┐
                                          │  PostgreSQL     │
                                          └────────────────┘
```

- **Single Express app** (`server/src/app.ts`) mounts every API router under `/api/*`, then serves the built SPA (`client/dist`) with an SPA fallback — one deployable process in production.
- **Client** is a lazy-loaded SPA: each page is its own chunk; routes are guarded by role.
- In dev, Vite (port 3000) and the API (port 3001) run concurrently; the client calls the API via same-origin `/api` (Vite proxy).
- **Migrations** run automatically at boot (`server/src/index.ts`), followed by idempotent demo seeding on a fresh database.

---

## 4. Database schema

**25 tables** (PostgreSQL, UUID PKs, snake_case), defined in `server/src/db/schema.ts` and versioned as SQL migrations in `server/drizzle/` (0000–0009).

### 4.1 Auth & users
| Table | Notes |
| --- | --- |
| `users` | name, email (unique), phone, `password_hash` (bcrypt), `role`, scope FKs (`company_id`, `facility_id`, `supplier_id`, `toli_id`) |
| `refresh_tokens` | hashed token, expiry, revoke flag — rotation on every refresh |
| `password_reset_tokens` | one-time, hashed, 1-hour expiry, indexed by user |
| `audit_logs` | actor, role, action enum (CREATE/UPDATE/DELETE/APPROVE/REJECT/COLLECT/DISTRIBUTE/LOGIN/LOGOUT), entity, old/new JSONB values, timestamp, IP |

### 4.2 Core operations
| Table | Key fields | Notes |
| --- | --- | --- |
| `companies` | name, contact_person, email, phone, address, city | trading companies owning facilities |
| `facilities` | `company_id` (nullable → standalone), name, location, city, capacity | |
| `bag_sizes` | size_name, weight_kg, is_global | global catalog, e.g. Small 5kg / Medium 10kg / Large 20kg |
| `rates` | `bag_size_id`, `facility_id` (**NULL = global rate**), rate_amount | unique per (bag_size, facility) |
| `suppliers` | name, email, phone, contact_person, address, city, status (PENDING/ACTIVE), `facility_id` (registrar), login_generated_* | registry + login lifecycle |
| `supplier_drops` | `supplier_id`, `facility_id`, drop_date, total_workers_dropped, `rent_per_drop` (negotiated), status | indexed (supplier, date) |
| `toli_leaders` | name, phone | leader registry (shared across facilities) |
| `tolis` | `facility_id`, `leader_id`, denormalized `leader_name`, worker_count, daily_charge, date, `drop_id`, status | per-day worker group |
| `work_entries` | `toli_id`, `facility_id`, work_date, `bag_size_id`, onion_category, quantity_bags, `rate_per_bag` (snapshot), total_amount, status (DRAFT/APPROVED/PAID), `leader_confirmed_at`, notes | rate snapshot preserves history |
| `weekly_work_summaries` | `toli_id`, `facility_id`, `supplier_id`, week_start/end, total_bags_processed, total_work_amount, daily_charge_agreed_amount, total_earnings, approval_status | unique (toli, week) |

### 4.3 Payments & advances
| Table | Key fields | Notes |
| --- | --- | --- |
| `supplier_payments` | `supplier_id`, `facility_id`, week_start/end, total_worker_earnings, total_drops, total_rent_charges, `advance_deducted`, `advance_balance_before`, **net_payment**, collection_status (PENDING → COLLECTED_FROM_FACILITY → DISTRIBUTED_TO_WORKERS), payment_method | unique (supplier, week) — idempotent settlement |
| `supplier_payment_distributions` | `supplier_payment_id`, `toli_id`, amount_distributed, payment_method, notes | distribution validated ≤ net payment |
| `supplier_advances` | `supplier_id`, `facility_id`, amount, advance_date, payment_method (CASH/BANK_TRANSFER), notes, `recorded_by` | outstanding balance = given − recovered |

### 4.4 Sales
| Table | Notes |
| --- | --- |
| `buyers` | `company_id`, name, phone, address, city |
| `sales_orders` | `order_number` (unique), `company_id`, `facility_id`, `buyer_id`, order_date, status (PENDING/PARTIALLY_DISPATCHED/COMPLETED/CANCELLED), total_amount |
| `sales_order_items` | onion_category, `bag_size_id`, quantity_bags, rate_per_bag, total_amount |
| `dispatches` / `dispatch_items` | vehicle_type (TRUCK/CONTAINER/TRACTOR/TEMPO/OTHER), vehicle_number, destination; items per order item |
| `order_payments` | amount, payment_method, reference_number, notes, `recorded_by` |

### 4.5 Subscriptions
| Table | Notes |
| --- | --- |
| `subscription_plans` | type (COMPANY/SUPPLIER), price, billing_cycle (monthly/quarterly/half-yearly/yearly), features JSONB |
| `subscriptions` | `plan_id`, `company_id` or `supplier_id`, status (ACTIVE/EXPIRED/PENDING/CANCELLED), start/end date, auto_renew |
| `subscription_payments` | amount, payment_method, reference_number |
| `subscription_renewals` | previous/new start+end, renewed_by — full renewal history |

### Enums
`user_role`, `drop_status`, `supplier_status`, `toli_status`, `work_entry_status`, `summary_status`, `supplier_payment_status`, `payment_method`, `audit_action`, `subscription_type`, `subscription_status`, `vehicle_type`, `sales_order_status`.

---

## 5. Key workflows

### 5.1 The weekly facility cycle

```
Mon–Sat                          Sun
─────────────────────────────    ───────────────────────────────────────
1. Register supplier drops       4. Approvals: weekly summaries
   (workers + rent/drop)            (auto-generated, admin approves)
2. Create tolis + record            → admin clicks "Process Sunday
   work entries (leader             payments" → supplier_payments rows
   confirms)                        are created & locked (PENDING)
3. Weekly summaries auto-
   generated per toli            5. Supplier collects → distributes
```

1. **Drops** — facility admin registers the day's supplier drops with worker counts and the negotiated `rent_per_drop`.
2. **Tolis & work** — admins create tolis (leader, worker count, day charge) and record `work_entries` (bag size × category × qty). The rate applied is the **facility override if present, else the global rate**, snapshotted into the entry. Toli leaders **confirm** entries.
3. **Summaries** — `generateWeeklySummaries(facilityId, weekStart, weekEnd)` (in `services/payments.ts`) aggregates each toli's bags, work amount, agreed daily charge and total earnings into a `weekly_work_summaries` row (unique per toli+week, so it is safe to re-run).
4. **Approvals** — admins approve or reject summaries; payment processing only considers approved ones.
5. **Sunday settlement** — `processSupplierPayments(facilityId, weekStart, weekEnd)` groups approved summaries **by supplier**, computes each supplier's totals (earnings, drops, rent) and a `net_payment = earnings + rent − advance_deducted`. Advance recovery is passed in from the UI per supplier (see §5.3).

### 5.2 Payment lifecycle

```
PENDING ──(supplier clicks "Mark collected")──► COLLECTED_FROM_FACILITY
   │                                                    │
   └──(supplier records distribution to tolis)──► DISTRIBUTED_TO_WORKERS
```

- **Facility admin** creates the `supplier_payments` row on Sunday (Step 5 above). Each payment records earnings, rent, advance deduction, and the **advance balance before** the deduction.
- **Supplier** sees the net payment in `Supplier → Collect & Distribute` and clicks **Mark collected** (cash / bank transfer) → `COLLECTED_FROM_FACILITY`.
- **Supplier** then enters how much was handed to each toli leader (pre-filled from that week's summaries) and clicks **Record distribution** → `DISTRIBUTED_TO_WORKERS`. The distribution total is validated against the net payment.
- Payments are immutable once distributed; history is available on both sides, plus printable **invoice** (earnings + rent − advance deduction) and **advance statement** reports.

### 5.3 Advance payments

- **Recording** — the facility admin records advances against a supplier (`POST /facility/:facilityId/advances`): amount, date, method, notes.
- **Recovery** — when processing Sunday payments, the admin sees each supplier's **outstanding advance** and types a "deduct now" amount (pre-filled to `min(outstanding, net payment)` and capped so the net never goes negative). The deduction is stored on the payment row (`advance_deducted`, `advance_balance_before`).
- **Visibility** — the supplier's Collect & Distribute page shows **total received / outstanding / recovered**, a per-facility breakdown, and the full history.
- **Integrity** — an advance cannot be deleted once any recovery has been recorded against it (that would corrupt the running balance); the balance is always derived from `SUM(advances) − SUM(advance_deducted)`.

### 5.4 Sales orders & dispatches

- Company admin (or facility admin) creates a **sales order** for a buyer: multiple line items (onion category + bag size + qty + rate), auto-computed total.
- **Dispatches** move stock against the order — vehicle type/number, destination, and per-item quantities. Partial dispatches flip the order to `PARTIALLY_DISPATCHED`; when items are fully dispatched it becomes `COMPLETED`.
- **Order payments** record cash/bank receipts against the order; the summary page tracks paid vs. outstanding.

### 5.5 Subscriptions & billing

- Super Admin maintains **plans** (Company/Supplier × monthly/quarterly/half-yearly/yearly) with price, description, and feature list.
- Subscriptions are created per **company** or **supplier** with start/end dates and auto-renew. Renewals keep a full history (`subscription_renewals`), and payments are recorded per subscription.
- **Alerts** surface expiring/expired subscriptions in the Super Admin dashboard; `subscription-earnings` and `subscription-monthly` reports track revenue.

### 5.6 Password reset & account management

- **Forgot password** (`POST /api/auth/forgot-password`) — email-only delivery. A one-time token (hashed at rest, 1-hour expiry) is sent **via Resend**; without `RESEND_API_KEY` the email contents are logged so demo reset links remain usable.
- **Reset password** (`POST /api/auth/reset-password`) — exchanges the token for a new password (single-use).
- **Change password** — signed-in user, requires the current password.
- **Admin reset** (`POST /api/auth/admin-reset-password`) — scoped by role (Super Admin resets anyone; facility/company admins reset their own users).
- **Profile editing** — every role can edit name/phone/email (`PUT /api/auth/profile`); suppliers additionally get contact person/address/city, and their **supplier row is kept in sync** with their login. Admins can edit managed users (facility/company admins, suppliers, toli leaders) and the linked login account updates together.

---

## 6. API reference

All routes are under `/api` and require `Authorization: Bearer <accessToken>` unless noted. Access tokens are short-lived (default 1 h); the client refreshes automatically via `POST /api/auth/refresh-token` (rotated refresh token, 7 d default).

### Auth — `/api/auth`
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | public | Login → `{ accessToken, refreshToken, user }` |
| POST | `/refresh-token` | public | Rotate refresh token → new pair |
| POST | `/logout` | auth | Revoke refresh token |
| GET | `/me` | auth | Current user profile |
| PUT | `/profile` | auth | Edit own name/phone/email (+ supplier extras) |
| POST | `/forgot-password` | public | Email one-time reset link |
| POST | `/reset-password` | public | Set new password from token |
| POST | `/change-password` | auth | Change own password |
| POST | `/admin-reset-password` | admins | Reset another user's password |

### Super Admin — `/api/super-admin`
Mounted routers: `companies`, `facilities`, `catalog` (bag sizes & rates), `suppliers` (CRUD + login generation), `analytics`. All guarded by `SUPER_ADMIN`.

### Company — `/api/company`
`dashboard`, `facilities` (own company, incl. facility-admins management), `admins`. Guarded by `SUPER_ADMIN | COMPANY_ADMIN`; scoped via `requireCompanyAccess`.

### Facility — `/api/facility`
`lookups`, `drops`, `tolis` (incl. leader edit), `workEntries`, `rates`, `summaries` (approvals), `payments` (Sunday processing, advance deductions), `advances` (record/list/delete), `dashboard`. Guarded by `SUPER_ADMIN | FACILITY_ADMIN | COMPANY_ADMIN | SUPPLIER`, then `requireFacilityAccess`.

### Supplier — `/api/supplier`
`profile`, `drops`, `workEntries`, `summary`, `payments` (collect + distribute), `advances` (my balance/history), `dashboard`. Guarded by `SUPER_ADMIN | SUPPLIER`.

### Toli Leader — `/api/toli-leader`
`GET /my-toli`, `GET /today-work`, `GET /weekly-earnings`, `GET /payment-history`, `PUT /work-entries/:entryId/confirm`. Guarded by `SUPER_ADMIN | TOLI_LEADER`, always scoped to `req.auth.toliId`.

### Reports — `/api/reports`
- `GET /:type` — JSON report data
- `GET /:type/excel` — XLSX download (exceljs)
- `GET /:type/pdf` — PDF download (pdfkit)
- `GET /meta/types` — report types allowed for the caller's role

Types & access are listed in [§8](#8-reports--exports); every report is **role-scoped** (`ReportScope` resolves the caller's facility/company/supplier/toli visibility).

### Sales — `/api/sales`
`buyers`, `orders` (create/list/detail, status transitions), `dispatches` (create against orders), `payments` (record order payments), `summary`. Guarded by `SUPER_ADMIN | COMPANY_ADMIN | FACILITY_ADMIN`.

### Subscriptions — `/api/subscriptions`
`plans`, `manage` (subscribe/renew), `payments`, `status`, `alerts`. Public list of plans; management requires auth.

### GitHub — `/api/super-admin`
Super Admin can push the project to a GitHub repo (token via `GITHUB_TOKEN` env).

### Misc
- `GET /api/health` — liveness check `{ ok: true, name: "onion-facility-center", time }`.

---

## 7. Security model

- **Password hashing** — bcrypt (`server/src/auth/password.ts`).
- **JWT** — access tokens carry `sub`, `role`, and scope IDs (`companyId`, `facilityId`, `supplierId`, `toliId`); refresh tokens are stored **hashed** in DB and rotated on use; revocable.
- **RBAC middleware** — `requireAuth` (verifies JWT), `requireRole(...)` (role allow-list), `requireCompanyAccess` (company admin sees only own company), `requireFacilityAccess` (facility admin sees own facility; company admin sees own company's facilities; super admin everything).
- **Data-scoping in reports** — even where roles overlap, every query is filtered by the resolved `ReportScope`.
- **Rate limiting** on auth endpoints (express-rate-limit); **helmet** security headers (CSP/COEP relaxed so the Vite SPA works); CORS enabled; 1 MB body cap.
- **Audit logging** — every CREATE/UPDATE/DELETE/APPROVE/REJECT/COLLECT/DISTRIBUTE/LOGIN writes an `audit_logs` row with old/new values.
- **Idempotent money code** — unique indexes on `(toli, week)` summaries and `(supplier, week)` payments make re-runs safe; advance deletion is guarded once recovery has begun.

---

## 8. Reports & exports

| Type | What it shows | Who |
| --- | --- | --- |
| `payments` | Supplier payment ledger with earnings, rent, advance deductions, net | SA, CA, FA |
| `drops` | Supplier drops ledger | SA, CA, FA, SUP |
| `work` | Work entries ledger | SA, CA, FA, SUP |
| `summaries` | Weekly work summaries | SA, CA, FA, TL |
| `distributions` | Supplier → toli distributions | SA, CA, SUP, TL |
| `supplier-statements` | Per-supplier weekly statements | SA, CA, SUP |
| `rent` | Rent summary by facility | SA, CA, FA |
| `supplier-invoice` | Earnings + rent − advances per supplier | SA, CA, FA, SUP |
| `supplier-advance-statement` | Advance ledger: given, recovered, running + outstanding balance | SA, CA, FA, SUP |
| `subscription-earnings` | Subscription revenue | SA |
| `subscription-monthly` | Monthly revenue trend | SA |

*(SA = Super Admin, CA = Company Admin, FA = Facility Admin, SUP = Supplier, TL = Toli Leader)*

**Builders** live in `server/src/lib/reports/` (`payments.ts`, `drops.ts`, `work.ts`, `invoices.ts`, `advances.ts`, `subscriptions.ts`, `exports.ts`) and produce a uniform `Report` object rendered to **Excel** (exceljs) or **PDF** (pdfkit). In-browser invoices/statements additionally print via a dedicated print stylesheet (`.invoice-print`) for Save-as-PDF.

---

## 9. Internationalization

- Client has a lightweight i18n layer (`client/src/i18n/index.tsx`) with **English** keys inline and a full **Marathi** translation in `client/src/i18n/mr.ts`.
- A language picker in the app shell switches between the two; new user-facing strings should be added to `mr.ts` to keep translations complete.

---

## 10. Frontend architecture

- **Lazy-loaded routes** — every page is a separate chunk (React `lazy` + `Suspense`).
- **Protected shell** (`App.tsx`) — unauthenticated visitors redirect to `/login`; each route is wrapped in `RequireRole`; a wildcard redirects to each role's home.
- **Facility scope** — facility-admin routes bind to the admin's own facility; company admins pick a facility via the URL (`/company/facility/:facilityId/…`) with workspace tabs (`FacilityTabs`).
- **Session** — `client/src/lib/auth.tsx` exposes a `useAuth()` context; `api.ts` stores tokens in localStorage, attaches the bearer header, and transparently refreshes on 401.
- **Design system** — `client/src/components/ui.tsx` provides Button, Card, Input/Select/Textarea/Field, Badge, StatCard, Modal (bottom-sheet on mobile, Esc to close), SearchableSelect, Table, Pagination, EmptyState, Tabs. Tailwind CSS 4 tokens are defined in `client/src/index.css` (onion-green brand, elevation shadows, safe-area + touch-target utilities for phones, reduced-motion support).

---

## 11. Deployment notes

- **One process** — the production build (`npm run build` → tsc server + vite client) serves the SPA and API from the single Express app; `npm start` / `npm run preview` runs it.
- **Migrations** run automatically at startup; set `SEED_DEMO=false` in production so no default credentials are created on a hosted database.
- **Environment** — provide `DATABASE_URL`, JWT secrets, `APP_BASE_URL` (for reset links), `RESEND_API_KEY` (real email), and optionally GitHub vars. Local `.env.local` values are dev values only.
- **Hosting** — the build image is Node-only; install runs `npm install`, build runs `vite build` (static `dist/`); the server starts via the preview command. `scripts/ensure-pg.sh` is a sandbox-only guard and no-ops where Postgres is hosted.

---

## 12. Roadmap

- Advanced search/filter refinements and bulk actions on large lists
- Supplier-facing mobile-first enhancements and offline work entry capture
- Automated rent-charge reconciliation against drops
- Payment gateway integration for subscription/order payments (currently cash/bank only)
- Granular audit dashboards and retention reports
- More report types (facility P&L, worker productivity, seasonal trends)
