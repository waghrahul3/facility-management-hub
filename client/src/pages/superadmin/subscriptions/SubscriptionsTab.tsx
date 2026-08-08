import { useI18n } from "../../../i18n";
import { Button, EmptyState, Pagination } from "../../../components/ui";
import { formatDate, formatMoney, statusColor } from "./helpers";
import type { Subscription } from "./types";

interface Props {
  subscriptions: Subscription[];
  page: number;
  total: number;
  onChangePage: (page: number) => void;
  onAdd: () => void;
  onActivate: (subId: string) => void;
  onExpire: (subId: string) => void;
  onRecordPayment: (sub: Subscription) => void;
  onRenew: (sub: Subscription) => void;
}

const PAGE_SIZE = 50;

export default function SubscriptionsTab({
  subscriptions,
  page,
  total,
  onChangePage,
  onAdd,
  onActivate,
  onExpire,
  onRecordPayment,
  onRenew,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Add Subscription</Button>
      </div>
      {subscriptions.length === 0 ? (
        <EmptyState title={t("No subscriptions yet")} hint={t("Create a plan and add subscriptions")} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-field-200 bg-white">
          <table className="min-w-full divide-y divide-field-200">
            <thead>
              <tr className="bg-field-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Entity")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Plan")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Amount")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Period")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Status")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-field-100">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-field-50/50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-field-800">
                      {sub.company_name || sub.supplier_name || "—"}
                    </p>
                    <p className="text-xs text-field-500">{sub.plan_type}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-field-700">{sub.plan_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-field-800">{formatMoney(sub.plan_price)}</td>
                  <td className="px-4 py-3 text-sm text-field-600">
                    {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(sub.status)}`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {sub.status !== "ACTIVE" && (
                        <button
                          onClick={() => onActivate(sub.id)}
                          className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                        >
                          {t("Activate")}
                        </button>
                      )}
                      {sub.status === "ACTIVE" && (
                        <>
                          <button
                            onClick={() => onExpire(sub.id)}
                            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            {t("Expire")}
                          </button>
                          <button
                            onClick={() => onRecordPayment(sub)}
                            className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            {t("Record Payment")}
                          </button>
                          <button
                            onClick={() => onRenew(sub)}
                            className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                          >
                            {t("Renew")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        pageSize={PAGE_SIZE}
        onChange={onChangePage}
      />
    </div>
  );
}
