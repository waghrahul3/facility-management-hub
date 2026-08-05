import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, Spinner } from "./ui";
import { useI18n } from "../i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionInfo {
  subscription: {
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    auto_renew: boolean;
    plan_name: string;
    plan_price: number;
    plan_cycle: string;
    plan_type: string;
  } | null;
  daysRemaining: number | null;
  isExpiringSoon: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cycleLabel(cycle: string): string {
  switch (cycle) {
    case "quarterly":
      return "quarter";
    case "half-yearly":
      return "6 months";
    case "yearly":
    case "annually":
      return "year";
    default:
      return "month";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800 border border-green-200";
    case "EXPIRED":
      return "bg-red-100 text-red-800 border border-red-200";
    case "PENDING":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "CANCELLED":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionStatus({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SubscriptionInfo>("/subscriptions/my-status")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  // No subscription
  if (!data?.subscription) {
    return (
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-sm font-semibold text-field-800">{t("No Active Subscription")}</p>
              <p className="text-xs text-field-500">{t("Contact admin to subscribe")}</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const { subscription, daysRemaining, isExpiringSoon } = data;

  if (compact) {
    return (
      <div className={`rounded-xl border p-3 ${isExpiringSoon ? "border-amber-300 bg-amber-50" : "border-field-200 bg-white"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(subscription.status)}`}>
              {subscription.status}
            </span>
            <span className="text-xs text-field-600">{subscription.plan_name}</span>
          </div>
          {daysRemaining !== null && (
            <span className={`text-xs font-medium ${isExpiringSoon ? "text-amber-600" : "text-field-500"}`}>
              {daysRemaining > 0 ? t("{n} days left", { n: daysRemaining }) : t("Expired")}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-field-900">{t("Subscription Status")}</h3>
            <p className="text-sm text-field-500">{t("Your active subscription plan")}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(subscription.status)}`}>
            {subscription.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase text-field-500">{t("Plan")}</p>
            <p className="mt-1 text-sm font-semibold text-field-800">{subscription.plan_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-field-500">{t("Price")}</p>
            <p className="mt-1 text-sm font-semibold text-field-800">
              {formatMoney(subscription.plan_price)}
              <span className="text-xs font-normal text-field-500">
                /{cycleLabel(subscription.plan_cycle)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-field-500">{t("Valid Until")}</p>
            <p className="mt-1 text-sm font-semibold text-field-800">{formatDate(subscription.end_date)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-field-500">{t("Days Remaining")}</p>
            <p className={`mt-1 text-sm font-semibold ${isExpiringSoon ? "text-amber-600" : "text-field-800"}`}>
              {daysRemaining !== null && daysRemaining > 0 ? daysRemaining : t("Expired")}
            </p>
          </div>
        </div>

        {/* Expiry Alert */}
        {isExpiringSoon && daysRemaining !== null && daysRemaining > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-600">⚠️</span>
              <p className="text-sm text-amber-800">
                {t("Your subscription expires in {n} days. Please renew to continue using all features.", { n: daysRemaining })}
              </p>
            </div>
          </div>
        )}

        {/* Auto-renew indicator */}
        <div className="mt-4 flex items-center gap-2 text-sm text-field-500">
          <span className={subscription.auto_renew ? "text-green-600" : "text-field-400"}>
            {subscription.auto_renew ? "🔄" : "⏸️"}
          </span>
          <span>
            {t("Auto-renewal:")} <strong>{subscription.auto_renew ? t("Enabled") : t("Disabled")}</strong>
          </span>
        </div>
      </div>
    </Card>
  );
}
