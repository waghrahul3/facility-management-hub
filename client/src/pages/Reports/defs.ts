import type { ReportDef } from "./types";

// ---------------------------------------------------------------------------
// Reports — report type definitions
// ---------------------------------------------------------------------------

export const REPORT_DEFS: Record<string, ReportDef> = {
  payments: {
    label: "Supplier Payments",
    icon: "💰",
    description: "Weekly supplier settlements — earnings minus drop rent",
  },
  drops: {
    label: "Supplier Drops",
    icon: "📦",
    description: "All supplier drop registrations with rent charges",
  },
  work: {
    label: "Work Entries",
    icon: "📝",
    description: "Daily work recording — bags processed, quantities, rates",
  },
  summaries: {
    label: "Weekly Summaries",
    icon: "📊",
    description: "Per-toli weekly work summaries and approval status",
  },
  distributions: {
    label: "Payment Distributions",
    icon: "🔄",
    description: "Per-toli payment distribution records from suppliers",
  },
  "supplier-statements": {
    label: "Supplier Statements",
    icon: "📋",
    description: "Running balance statements per supplier with activity log",
  },
  rent: {
    label: "Rent Summary",
    icon: "🏢",
    description: "Rent charges per drop — facility-wise and supplier-wise breakdown",
  },
  "subscription-earnings": {
    label: "Subscription Earnings",
    icon: "💳",
    description: "Revenue from company & supplier subscription payments",
  },
  "subscription-monthly": {
    label: "Sub Revenue Trend",
    icon: "📈",
    description: "Monthly subscription revenue trend with payment counts",
  },
};
