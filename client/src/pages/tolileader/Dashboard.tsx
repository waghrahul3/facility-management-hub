import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import { Button, Card, LoadingScreen, Money, StatCard } from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface MyToli {
  toli: {
    id: string;
    leader_name: string;
    worker_count: number;
    daily_charge: number;
    date: string;
    status: string;
  };
  facility: { name: string; location: string } | null;
  drop: { rent_per_drop: number; drop_date: string } | null;
}

interface Earnings {
  summaries: Array<{ id: string; total_earnings: number; approval_status: string }>;
  weekStart: string;
}

export default function ToliLeaderDashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [myToli, setMyToli] = useState<MyToli | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);

  useEffect(() => {
    api<MyToli>("/toli-leader/my-toli").then(setMyToli);
    api<Earnings>("/toli-leader/weekly-earnings").then(setEarnings);
  }, []);

  if (!myToli || !earnings) return <LoadingScreen label={t("Loading your toli…")} />;

  const approved = earnings.summaries.filter((s) => s.approval_status === "APPROVED");
  const weekEarnings = approved.reduce((s, r) => s + r.total_earnings, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-field-900">
          Namaste, {user?.name?.split(" ")[0]} 🙏
        </h1>
        <p className="mt-1 text-sm text-field-500">
          {myToli.facility?.name ?? t("Facility")} · {t("Week of {date}", { date: fmtDate(earnings.weekStart) })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("My toli")} value={myToli.toli.leader_name} tone="green" icon={<span>👥</span>} />
        <StatCard label={t("Workers")} value={myToli.toli.worker_count} tone="blue" icon={<span>🧑‍🌾</span>} />
        <StatCard label={t("Day charge")} value={<Money value={myToli.toli.daily_charge} />} tone="amber" icon={<span>💰</span>} />
        <StatCard label={t("Week earnings")} value={<Money value={weekEarnings} />} tone="violet" icon={<span>📈</span>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("This week")} subtitle={t("Your earnings from approved work")}>
          {earnings.summaries.length === 0 ? (
            <p className="text-sm text-field-400">{t("No weekly summaries yet.")}</p>
          ) : (
            <div className="divide-y divide-field-100">
              {earnings.summaries.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-field-400">
                    {s.approval_status}
                  </span>
                  <Money value={s.total_earnings} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t("Quick links")}>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/leader/today-work"><Button variant="secondary" className="w-full">{t("Today's work")}</Button></Link>
            <Link to="/leader/earnings"><Button variant="secondary" className="w-full">{t("Weekly earnings")}</Button></Link>
            <Link to="/leader/payments-history"><Button variant="secondary" className="w-full">{t("Payments")}</Button></Link>
            <Link to="/leader/my-toli"><Button variant="secondary" className="w-full">{t("My toli")}</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
