import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  Badge,
  Card,
  EmptyState,
  LoadingScreen,
  PageHeader,
  Table,
  Td,
} from "../../components/ui";

interface FacilityRow {
  facility: {
    id: string;
    name: string;
    location: string;
    city: string | null;
    capacity: number | null;
    is_active: boolean;
  };
  admin: { id: string; name: string; email: string } | null;
}

export default function CompanyFacilitiesPage() {
  const { user } = useAuth();
  const cid = user?.companyId;
  const [rows, setRows] = useState<FacilityRow[] | null>(null);

  const load = useCallback(() => {
    if (!cid) return;
    api<{ facilities: FacilityRow[] }>(`/company/${cid}/facilities`).then((r) =>
      setRows(r.facilities)
    );
  }, [cid]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Facilities"
        subtitle="All facilities under your company — read-only overview"
      />

      {!rows ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No facilities yet" hint="The Super Admin assigns facilities to your company" /></Card>
      ) : (
        <Card>
          <Table head={["Facility", "Location", "Capacity", "Admin", "Status"]} empty={null}>
            {rows.map((r) => (
              <tr key={r.facility.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.facility.name}</Td>
                <Td>
                  {r.facility.location}
                  {r.facility.city ? <span className="text-field-400"> · {r.facility.city}</span> : null}
                </Td>
                <Td>{r.facility.capacity ?? 0} workers</Td>
                <Td>
                  {r.admin ? (
                    <span>
                      {r.admin.name}
                      <span className="block text-xs text-field-400">{r.admin.email}</span>
                    </span>
                  ) : (
                    <span className="text-field-400">—</span>
                  )}
                </Td>
                <Td>
                  {r.facility.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
