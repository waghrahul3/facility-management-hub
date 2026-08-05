import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  StatCard,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import SubscriptionStatus from "../../components/SubscriptionStatus";

interface CompanyDashboardData {
  company: { id: string; name: string; city: string | null };
  weekStart: string;
  weekEnd: string;
  facilityStats: Array<{
    facility: { id: string; name: string; location: string; city: string | null; is_active: boolean };
    weekDropCount: number;
    toliCount: number;
    pendingPaymentCount: number;
  }>;
  totals: {
    facilityCount: number;
    weekDropCount: number;
    toliCount: number;
    pendingSummaryCount: number;
    weekRentTotal: number;
    pendingPaymentCount: number;
  };
  pendingPayments: Array<{
    payment: {
      id: string;
      week_start_date: string;
      net_payment: number;
      collection_status: string;
    };
    supplier: { id: string; name: string };
    facility: { id: string; name: string };
  }>;
}

export default function CompanyDashboard() {
  const { user } = useAuth();
  const cid = user?.companyId;
  const [data, setData] = useState<CompanyDashboardData | null>(null);

  useEffect(() => {
    if (!cid) return;
    api<CompanyDashboardData>(`/company/${cid}/dashboard`).then(setData);
  }, [cid]);

  if (!data) return <LoadingScreen label="Loading company overview…" />;

  const t = data.totals;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-field-900">
          {data.company.name}
        </h1>
        <p className="mt-1 text-sm text-field-500">
          {data.company.city ?? "Company overview"} · Week of {fmtDate(data.weekStart)}
        </p>
      </div>

      {/* Subscription Status */}
      <SubscriptionStatus />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Facilities" value={t.facilityCount} tone="green" icon={<span>🏭</span>} />
        <StatCard label="Drops this week" value={t.weekDropCount} tone="blue" icon={<span>🚚</span>} />
        <StatCard label="Tolis" value={t.toliCount} tone="amber" icon={<span>👥</span>} />
        <StatCard label="Pending payments" value={t.pendingPaymentCount} tone="violet" icon={<span>💰</span>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Facilities"
          subtitle={`${t.facilityCount} facility${t.facilityCount === 1 ? "" : "s"} under ${data.company.name} · week rent ₹${t.weekRentTotal.toLocaleString("en-IN")}`}
          action={
            <Link to="/company/facilities">
              <Button variant="secondary" size="sm">View all</Button>
            </Link>
          }
        >
          {data.facilityStats.length === 0 ? (
            <EmptyState icon="🏭" title="No facilities yet" hint="Add your first facility" />
          ) : (
            <Table head={["Facility", "Drops", "Tolis", "Pending"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{h}</th>)}>
              {data.facilityStats.map((fs) => (
                <tr key={fs.facility.id} className="hover:bg-field-50/50">
                  <Td className="font-medium">{fs.facility.name}</Td>
                  <Td>{fs.weekDropCount}</Td>
                  <Td>{fs.toliCount}</Td>
                  <Td>
                    <Badge tone={fs.pendingPaymentCount > 0 ? "amber" : "green"}>
                      {fs.pendingPaymentCount}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Pending Payments" subtitle="Sunday collections ready">
          {data.pendingPayments.length === 0 ? (
            <EmptyState icon="💰" title="No pending payments" hint="All clear this week" />
          ) : (
            <Table head={["Supplier", "Facility", "Amount", "Status"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">{h}</th>)}>
              {data.pendingPayments.map((pp) => (
                <tr key={pp.payment.id} className="hover:bg-field-50/50">
                  <Td className="font-medium">{pp.supplier.name}</Td>
                  <Td>{pp.facility.name}</Td>
                  <Td><Money value={pp.payment.net_payment} /></Td>
                  <Td><StatusBadge status={pp.payment.collection_status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
