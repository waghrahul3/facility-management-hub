import SubscriptionStatus from "../../components/SubscriptionStatus";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import {
  Button,
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  StatCard,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface DashboardData {
  weekStart: string;
  weekEnd: string;
  weekDropCount: number;
  weekToliCount: number;
  pendingPayments: Array<{ id: string; net_payment: number; collection_status: string }>;
}

interface ThisWeek {
  totalDrops: number;
  totalRent: number;
  totalWorkerEarnings: number;
  netPayment: number;
  summaries: Array<{
    summary: { total_earnings: number; approval_status: string };
    toli: { leader_name: string };
  }>;
}

export default function SupplierDashboard() {
  const { user } =useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [week, setWeek] = useState<ThisWeek | null>(null);

  useEffect(() => {
    api<DashboardData>("/supplier/dashboard").then(setData);
    api<ThisWeek>("/supplier/this-week").then(setWeek);
  }, []);

  if (!data || !week) return <LoadingScreen label={t("Loading supplier overview…")} />;

  const approvedCount = week.summaries.filter((s) => s.summary.approval_status === "APPROVED").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-field-900">
          {user?.supplierName ?? t("Supplier")} {t("Dashboard")}
        </h1>
        <p className="mt-1 text-sm text-field-500">
          {t("Week of {date}", { date: fmtDate(data.weekStart) })} — {t("collect and distribute on Sunday")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("Drops this week")} value={week.totalDrops} tone="green" icon={<span>🚛</span>} />
        <StatCard label={t("Tolis working")} value={data.weekToliCount} tone="blue" icon={<span>👥</span>} />
        <StatCard label={t("Approved summaries")} value={approvedCount} tone="amber" icon={<span>✅</span>} />
        <StatCard label={t("Net to collect")} value={<Money value={week.netPayment} />} tone="violet" icon={<span>💸</span>} />
      </div>

      {/* Subscription Status */}
      <div className="mt-6">
        <SubscriptionStatus />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("This week at a glance")} subtitle={t("Worker earnings − drop rent = net payment")}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-field-500">{t("Total worker earnings")}</span>
              <span className="font-semibold"><Money value={week.totalWorkerEarnings} /></span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-field-500">{t("Total rent charges ({count} drops)", { count: week.totalDrops })}</span>
              <span className="font-semibold text-red-600">− <Money value={week.totalRent} /></span>
            </div>
            <div className="flex justify-between border-t border-field-200 pt-3 text-base">
              <span className="font-semibold text-field-800">{t("Net payment to collect")}</span>
              <span className="font-bold text-onion-800"><Money value={week.netPayment} /></span>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/supplier/payments">
              <Button variant="success" className="w-full">{t("Collect & distribute payment")}</Button>
            </Link>
          </div>
        </Card>

        <Card title={t("Your tolis this week")} subtitle={t("Earnings per toli leader you dropped")}>
          {week.summaries.length === 0 ? (
            <EmptyState title={t("No toli summaries yet")} hint={t("Work entries appear once approved by the facility")} />
          ) : (
            <div className="divide-y divide-field-100">
              {week.summaries.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-field-700">{s.toli.leader_name}</span>
                  <span className="text-sm font-semibold"><Money value={s.summary.total_earnings} /></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
