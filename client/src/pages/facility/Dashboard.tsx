import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  StatCard,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface DashboardData {
  facility: { id: string; name: string; location: string; city: string | null };
  weekStart: string;
  weekEnd: string;
  weekDropCount: number;
  toliCount: number;
  pendingSummaryCount: number;
  weekRentTotal: number;
  pendingPayments: Array<{
    id: string;
    supplier_id: string;
    net_payment: number;
    collection_status: string;
    week_start_date: string;
  }>;
}

export default function FacilityDashboard() {
  const { facilityId, base } = useFacilityScope();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!facilityId) return;
    api<DashboardData>(`/facility/${facilityId}/dashboard`).then(setData);
  }, [facilityId]);

  if (!data) return <LoadingScreen label="Loading facility overview…" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-field-900">{data.facility.name}</h1>
        <p className="mt-1 text-sm text-field-500">
          {data.facility.location}
          {data.facility.city ? `, ${data.facility.city}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Drops this week" value={data.weekDropCount} tone="green" icon={<span>🚛</span>} />
        <StatCard label="Active tolis" value={data.toliCount} tone="blue" icon={<span>👥</span>} />
        <StatCard label="Pending approvals" value={data.pendingSummaryCount} tone="amber" icon={<span>📋</span>} />
        <StatCard label="Week rent charges" value={<Money value={data.weekRentTotal} />} tone="violet" icon={<span>🧾</span>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Pending supplier payments"
          subtitle={`Week of ${fmtDate(data.weekStart)}`}
          action={<Link to={`${base}/payments`}><Button variant="secondary" size="sm">Process</Button></Link>}
        >
          {data.pendingPayments.length === 0 ? (
            <EmptyState title="No pending payments" hint="Process Sunday payments when approved summaries exist" />
          ) : (
            <div className="divide-y divide-field-100">
              {data.pendingPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-field-800">Supplier payment</p>
                    <p className="text-xs text-field-500"><Badge tone="amber">PENDING</Badge></p>
                  </div>
                  <Money value={p.net_payment} className="text-sm" />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Quick actions">
          <div className="grid grid-cols-2 gap-3">
            <Link to={`${base}/drops`}><Button variant="secondary" className="w-full">Register drop</Button></Link>
            <Link to={`${base}/tolis`}><Button variant="secondary" className="w-full">Create toli</Button></Link>
            <Link to={`${base}/work-entries`}><Button variant="secondary" className="w-full">Record work</Button></Link>
            <Link to={`${base}/approvals`}><Button variant="secondary" className="w-full">Approve week</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
