import { StatCard } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { Report } from "./types";
import { formatCell, formatTotal, getStatusColor } from "./format";

// ---------------------------------------------------------------------------
// Reports — rendered report content (header, summary cards, data table)
// ---------------------------------------------------------------------------

export default function ReportView({
  report,
  rows,
}: {
  report: Report;
  rows: Record<string, unknown>[];
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* Report header */}
      <div>
        <h2 className="font-display text-lg font-bold text-field-900">{report.title}</h2>
        <p className="text-sm text-field-500">{report.subtitle}</p>
      </div>

      {/* Summary cards */}
      {report.cards.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.cards.map((card, i) => (
            <StatCard key={i} label={card.label} value={card.value} tone={card.tone as any} />
          ))}
        </div>
      )}

      {/* Data table */}
      {report.rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-field-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-field-200">
              <thead>
                <tr className="bg-field-50">
                  {report.columns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-field-500"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-field-100">
                {rows.map((row, i) => (
                  <tr key={i} className="transition-colors hover:bg-field-50/50">
                    {report.columns.map((col) => (
                      <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-field-700">
                        {col.type === "status" ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                              String(row[col.key] || "")
                            )}`}
                          >
                            {formatCell(row[col.key], col)}
                          </span>
                        ) : col.type === "money" ? (
                          <span className="font-medium text-field-800">
                            {formatCell(row[col.key], col)}
                          </span>
                        ) : (
                          formatCell(row[col.key], col)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              {Object.keys(report.totals).length > 0 && (
                <tfoot>
                  <tr className="bg-onion-50 font-semibold">
                    {report.columns.map((col, ci) => (
                      <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-onion-800">
                        {ci === 0 ? t("TOTALS") : formatTotal(report.totals[col.key], col)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-field-200 bg-white p-12 text-center">
          <p className="text-lg text-field-400">{t("No data found for the selected filters")}</p>
          <p className="mt-1 text-sm text-field-400">{t("Try adjusting the date range or filters")}</p>
        </div>
      )}

      {/* Row count */}
      <p className="text-xs text-field-400">
        {t("{n} records · Generated {at}", {
          n: report.rows.length,
          at: new Date(report.generatedAt).toLocaleString("en-IN"),
        })}
      </p>
    </div>
  );
}
