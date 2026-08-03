import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Button, Card, EmptyState, LoadingScreen, StatCard } from "../../components/ui";

interface DashboardData {
  facilityCount: number;
  supplierCount: number;
  adminCount: number;
  facilities: Array<{
    id: string;
    name: string;
    location: string;
    city: string | null;
    capacity: number | null;
    is_active: boolean;
    admin?: { id: string; name: string; email: string } | null;
  }>;
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardData>("/super-admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <LoadingScreen label="Loading global overview…" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-field-900">Global Overview</h1>
        <p className="mt-1 text-sm text-field-500">
          All facilities, suppliers, and admins across the network.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Facilities" value={data.facilityCount} tone="green" icon={<span>🏭</span>} />
        <StatCard label="Suppliers" value={data.supplierCount} tone="amber" icon={<span>🚚</span>} />
        <StatCard label="Facility Admins" value={data.adminCount} tone="blue" icon={<span>👥</span>} />
      </div>

      <div className="mt-6">
        <Card
          title="Recent facilities"
          subtitle="Newest facilities registered in the network"
          action={
            <Link to="/facilities">
              <Button variant="secondary" size="sm">Manage</Button>
            </Link>
          }
        >
          {data.facilities.length === 0 ? (
            <EmptyState title="No facilities yet" hint="Create your first facility to get started" />
          ) : (
            <div className="divide-y divide-field-100">
              {data.facilities.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-field-800">{f.name}</p>
                    <p className="text-xs text-field-500">
                      {f.location}
                      {f.city ? `, ${f.city}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-field-500">
                      {f.admin ? f.admin.name : "No admin assigned"}
                    </p>
                    <p className="text-[11px] text-field-400">Capacity: {f.capacity ?? 0}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
