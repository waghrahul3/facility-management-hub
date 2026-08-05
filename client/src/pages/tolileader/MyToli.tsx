import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import { Card, LoadingScreen, Money, PageHeader, StatCard } from "../../components/ui";
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
  facility: { name: string; location: string; city: string | null } | null;
  drop: { rent_per_drop: number; drop_date: string } | null;
}

export default function MyToliPage() {
  const { t } = useI18n();
  const [data, setData] = useState<MyToli | null>(null);

  useEffect(() => {
    api<MyToli>("/toli-leader/my-toli").then(setData);
  }, []);

  if (!data) return <LoadingScreen label={t("Loading toli details…")} />;

  return (
    <div>
      <PageHeader title={t("My Toli")} subtitle={t("Your group, charges, and drop details")} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("Leader")} value={data.toli.leader_name} tone="green" icon={<span>🪖</span>} />
        <StatCard label={t("Workers")} value={data.toli.worker_count} tone="blue" icon={<span>🧑‍🌾</span>} />
        <StatCard label={t("Day charge")} value={<Money value={data.toli.daily_charge} />} tone="amber" icon={<span>💰</span>} />
        <StatCard label={t("Status")} value={data.toli.status.replace("_", " ")} tone="slate" icon={<span>📍</span>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("Facility")}>
          <p className="font-semibold text-field-900">{data.facility?.name ?? "—"}</p>
          <p className="mt-1 text-sm text-field-500">
            {data.facility?.location}
            {data.facility?.city ? `, ${data.facility.city}` : ""}
          </p>
        </Card>
        <Card title={t("Supplier drop")}>
          {data.drop ? (
            <>
              <p className="text-sm text-field-600">{t("Drop date: {date}", { date: fmtDate(data.drop.drop_date) })}</p>
              <p className="mt-1 text-sm text-field-600">
                {t("Rent paid by supplier:")} <Money value={data.drop.rent_per_drop} />
              </p>
            </>
          ) : (
            <p className="text-sm text-field-400">{t("No supplier drop linked to this toli.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
