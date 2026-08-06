// ---------------------------------------------------------------------------
// Reports — shared types
// ---------------------------------------------------------------------------

export interface ReportColumn {
  key: string;
  label: string;
  type: "text" | "money" | "number" | "date" | "datetime" | "status" | "bool";
}

export interface ReportCard {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red" | "slate" | "blue" | "violet";
}

export interface Report {
  type: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  cards: ReportCard[];
}

export interface ReportMeta {
  types: string[];
}

export interface ReportDef {
  label: string;
  icon: string;
  description: string;
}
