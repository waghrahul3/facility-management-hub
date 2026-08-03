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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Facilities" value={t.facilityCount} tone="green" icon={<span>🏭</span>} />
        <StatCard label="Drops this week" value={t.weekDropCount} tone="blue" icon={<span>🚚</span>} />
        <StatCard label="Tolis" value={t.toliCount} tone="amber" icon={<span>👥</span>} />
        <StatCard label="Pending payments" value={t.pendingPaymentCount} tone="violet" icon={<span>💰</span>} />
      </div>

      <Card
        title="Facilities"
        subtitle={`${t.facilityCount} facility${t.facilityCount === 1 ? "" : "s"} under ${data.company.name} · week rent ${`₹${t.weekRentTotal.toLocaleString("en-IN")}`}`}
        className="mt-6"
        action={
          <Link to="/company/facilities">
            <Button variant="secondary" size="sm">View all</Button>
          </Link>
        }
      >
        {data.facilityStats.length === 0 ? (
          <EmptyState title="No facilities yet" hint="The Super Admin assigns facilities to this company" />
        ) : (
          <Table head={["Facility", "Drops (week)", "Tolis", "Pending payments", "Status"]} empty={null}>
            {data.facilityStats.map((r) => (
              <tr key={r.facility.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.facility.name}</Td>
                <Td>{r.weekDropCount}</Td>
                <Td>{r.toliCount}</Td>
                <Td>
                  {r.pendingPaymentCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse-soft" />
                      {r.pendingPaymentCount}
                    </span>
                  ) : (
                    <span className="text-field-400">0</span>
                  )}
                </Td>
                <Td>
                  {r.facility.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Pending supplier payments" subtitle="Payments awaiting collection across your facilities" className="mt-6">
        {data.pendingPayments.length === 0 ? (
          <EmptyState title="No pending payments" hint="All settled — great week!" />
        ) : (
          <Table head={["Facility", "Supplier", "Week", "Net payment", "Status"]} empty={null}>
            {data.pendingPayments.map((r) => (
              <tr key={r.payment.id} className="hover:bg-field-50/50">
                <Td className="font-medium text-field-800">{r.facility.name}</Td>
                <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                <Td>{fmtDate(r.payment.week_start_date)}</Td>
                <Td className="font-semibold text-onion-800"><Money value={r.payment.net_payment} /></Td>
                <Td><StatusBadge status={r.payment.collection_status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
