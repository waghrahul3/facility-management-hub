import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Card, Spinner } from "../../../components/ui";
import { formatDate, formatMoney, statusColor } from "./helpers";
import type { Subscription, SubscriptionPayment } from "./types";

export default function SubscriptionPayments({ subscription }: { subscription: Subscription }) {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ payments: SubscriptionPayment[] }>(`/subscriptions/${subscription.id}/payments`)
      .then((r) => setPayments(r.payments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subscription.id]);

  if (loading) return <Spinner className="h-4 w-4" />;

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-field-800">
            {subscription.company_name || subscription.supplier_name}
          </h3>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(subscription.status)}`}>
            {subscription.status}
          </span>
        </div>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-field-500">No payments recorded yet</p>
        ) : (
          <div className="mt-3 space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-field-50 p-3">
                <div>
                  <p className="text-sm font-medium text-field-800">{formatMoney(p.amount)}</p>
                  <p className="text-xs text-field-500">{formatDate(p.payment_date)} • {p.payment_method}</p>
                </div>
                {p.reference_number && (
                  <span className="text-xs text-field-400">#{p.reference_number}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
