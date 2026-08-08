# 🧅 Onion Facility Center

A multi-facility onion **storage & processing management** platform. It runs the entire weekly operation of an onion facility — supplier drops, toli (worker-group) assignments, daily work recording (grading / packing / bagging), weekly approval, Sunday payment settlement, advance payments, and worker distribution — plus **sales orders, dispatches, subscriptions, and printable reports**.

Built as a **React SPA (Vite + Tailwind) + Express API (TypeScript) + PostgreSQL (Drizzle ORM)** monorepo.

> **📖 Project document:** see [`PROJECT.md`](./PROJECT.md) for the full architecture, data model, API reference, and workflow walkthroughs.

---

## ✨ Features

| Area | Capabilities |
| --- | --- |
| **Facilities** | Multiple facilities owned by trading companies; per-facility admins, rates & dashboard |
| **Suppliers** | Global registry, per-drop **rent negotiation**, login generation, active/pending status |
| **Tolis** | Daily worker groups with leaders, worker count, day charge; leader registry kept in sync with login accounts |
| **Work recording** | Daily bagging entries (bag size × onion category × quantity), facility rate overrides global rate, leader confirmation |
| **Weekly cycle** | Auto-generated weekly summaries → admin approve/reject → **Sunday payment settlement** per supplier |
| **Payments** | Net payment = worker earnings − rent charges − **advance deduction**; supplier collects from facility, then distributes to toli leaders |
| **Advance payments** | Facility admin records cash/bank advances; outstanding balance is deducted manually each week; supplier sees balance + history + printable **advance statement** |
| **Sales** | Buyers, sales orders (multi-item, onion category + bag size), vehicle dispatches, order payments |
| **Subscriptions** | Plans (Company/Supplier × monthly→yearly), subscribe/renew, payments, expiry alerts |
| **Reports** | 11 report types → **Excel (exceljs)** and **PDF (pdfkit)** downloads + printable invoices/statements |
| **Auth & security** | JWT access + rotated refresh tokens, bcrypt hashing, role-based access on every route, full **audit log**, rate-limited auth |
| **Accounts** | Self-service profile editing, password change, email-only **password reset** (Resend), admin-driven password resets |
| **i18n** | English + **Marathi** (`मराठी`) with a language picker |
| **UX** | Mobile-first responsive UI (sidebar + bottom nav), search & status filters on every list, dark-green onion theme |

---

## 🧑‍🤝‍🧑 User roles

| Role | Scope |
| --- | --- |
| **Super Admin** | Everything — companies, facilities, admins, bag sizes/global rates, suppliers, payments history, subscriptions, audit log, reports, GitHub integration |
| **Company Admin** | Their company: facilities + facility admins, buyers, sales orders, plus **full facility-admin powers per facility** |
| **Facility Admin** | Their facility: drops, tolis, work entries, rates, approvals, Sunday payments, advances, sales |
| **Supplier** | Their drops, work entries, rent charges, weekly payments (collect → distribute), advance balance, invoices |
| **Toli Leader** | Their toli: today's work, weekly earnings, payment history, confirm work entries |

---

## 🚀 Quick start

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** running locally (default connection `postgres://onion:onionpass@127.0.0.1:5432/onionfacility`)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy your environment into `.env` / `.env.local`. All variables are optional in development — sensible fallbacks are built in:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://onion:onionpass@127.0.0.1:5432/onionfacility` | PostgreSQL connection |
| `PORT` | `3000` | API port (injected by the sandbox/host at runtime) |
| `JWT_ACCESS_SECRET` | dev fallback | Signs access tokens (set a real secret!) |
| `JWT_REFRESH_SECRET` | dev fallback | Signs refresh tokens (set a real secret!) |
| `ACCESS_TOKEN_TTL` | `1h` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | Refresh token lifetime |
| `APP_BASE_URL` | `http://localhost:3000` | Origin used in password-reset links |
| `RESEND_API_KEY` | *(empty)* | Transactional email (password reset). Without it, emails are **logged to the console** instead of sent |
| `RESEND_EMAIL_FROM` | `Onion Facility Center <no-reply@onionfacility.com>` | Sender address |
| `SEED_DEMO` | `true` | Auto-seed demo data on an empty database. Set `false` in production |
| `GITHUB_TOKEN` / `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | *(empty)* / `waghrahul3` / `facility-management-hub` | Super Admin "push to GitHub" integration |

### 3. Run

```bash
npm run dev          # API on :3001 (tsx watch) + Vite client on :3000
```

Migrations run automatically at boot. On a fresh database the app **auto-seeds demo data** (unless `SEED_DEMO=false`).

### 4. Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `superadmin@onionfacility.local` | `Onion@123` |
| Company Admin | `santosh@onionfacility.local` | `Onion@123` |
| Facility Admin | `admin@onionfacility.local` | `Onion@123` |
| Supplier | `rohidas@onionfacility.local` | `Onion@123` |
| Toli Leader | `mahesh@onionfacility.local` | `Onion@123` |

The seed also creates a demo company ("Latur Onion Traders"), one facility, bag sizes + global rates, subscription plans, a current-week supplier drop, toli, approved work entries, and a pending Sunday payment.

---

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API (`tsx watch`, port 3001) + Vite client (port 3000) concurrently |
| `npm run build` | Type-check the server, then build the client to `dist/` |
| `npm start` | Run the compiled API (`server/dist/index.js`) |
| `npm run preview` | ensure Postgres → build → serve production build on the API |
| `npm run typecheck` | Type-check server + client without emitting |
| `npm run db:generate` | Generate a Drizzle migration from `server/src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations (`tsx server/src/db/migrate.ts`) |
| `npm run seed` | Run the idempotent demo seeder manually |

---

## 🗂️ Project structure

```
├── server/                        # Express API (TypeScript, ESM)
│   ├── src/
│   │   ├── index.ts               # Boot: migrate → seed → listen (0.0.0.0)
│   │   ├── app.ts                 # Express app: helmet, CORS, request-id logging, SPA serving
│   │   ├── config.ts              # Central env config
│   │   ├── auth/                  # jwt.ts, password.ts (bcrypt), middleware.ts (requireAuth/Role/Access)
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema — all 25 tables + enums
│   │   │   ├── index.ts           # Pool + drizzle instance
│   │   │   └── migrate.ts         # Runner
│   │   ├── routes/                # auth, superadmin, company, facility, supplier,
│   │   │                          # tolileader, sales, subscription, reports, github
│   │   ├── services/              # payments.ts (weekly settlement engine), email.ts (Resend)
│   │   ├── lib/                   # audit, date, errors, format, logger, pagination, params
│   │   │   └── reports/           # report builders + excel/pdf exporters (types, invoices, advances…)
│   │   └── seed.ts                # Idempotent demo data
│   └── drizzle/                   # SQL migrations (0000…0009)
├── client/                        # React SPA (Vite + Tailwind)
│   └── src/
│       ├── main.tsx / App.tsx     # Entry + lazy-loaded, role-guarded routes
│       ├── components/            # ui.tsx design system, layout, modals, language picker
│       ├── pages/                 # One folder per role (superadmin, company, facility, supplier, tolileader)
│       ├── lib/                   # api.ts (fetch + token refresh), auth.tsx (context), facilityScope.tsx
│       └── i18n/                  # en (inline keys) + mr.ts (मराठी)
├── drizzle.config.ts              # Drizzle CLI config (dialect: postgresql)
└── scripts/ensure-pg.sh           # Sandbox guard that starts local Postgres
```

---

## 🧱 Tech stack

**Frontend** — React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · React Router 7 · custom component system (`ui.tsx`)

**Backend** — Express 5 · TypeScript · Drizzle ORM + PostgreSQL · JWT auth · Helmet · rate limiting · ExcelJS · PDFKit · Resend

**Tooling** — npm scripts · concurrently · drizzle-kit migrations · tsx

---

## 🔐 Security notes

- Passwords hashed with **bcrypt**; refresh & reset tokens stored **hashed at rest**
- **Role + scope middleware** on every route: `requireRole`, `requireCompanyAccess`, `requireFacilityAccess`
- Rate limiting on auth endpoints; helmet security headers; CORS; 1 MB JSON body cap
- Every money- and data-mutating action writes an **audit log** (actor, action, entity, old/new values)
- Payment processing is **idempotent**: weekly summaries & payments are keyed per toli/supplier + week (unique indexes)

---

## 📖 API documentation

Interactive **Swagger/OpenAPI docs** are served by the API itself:

- **UI:** `/api/docs/ui` (also linked from the app sidebar → “API Docs”)
- **Spec (JSON):** `/api/docs`

The spec covers every endpoint, role scope, request body and response schema, and lets you try authenticated requests directly from the browser.

---

## 📄 Reports & exports

| Report type | Available to |
| --- | --- |
| `payments`, `drops`, `work`, `summaries`, `distributions`, `supplier-statements`, `rent` | Super / Company / Facility admins |
| `supplier-invoice`, `supplier-advance-statement` | Super / Company / Facility admins **and the supplier** |
| `subscription-earnings`, `subscription-monthly` | Super Admin only |

Every report downloads as **Excel (XLSX)** and **PDF**, and invoices / advance statements also print from the browser.

---

## 🤝 Contributing & notes

- Keep server code under `server/src/routes/<role>/` with scope middleware; keep client pages under `client/src/pages/<role>/`.
- After changing `schema.ts`, run `npm run db:generate && npm run db:migrate`.
- New UI strings go into `client/src/i18n/mr.ts` to keep the Marathi translation complete.
- Full architecture documentation lives in [`PROJECT.md`](./PROJECT.md).
