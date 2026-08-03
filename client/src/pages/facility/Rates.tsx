import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingScreen,
  Money,
  PageHeader,
  SearchableSelect,
  Table,
  Td,
} from "../../components/ui";

interface RateRow {
  rate: { id: string; rate_amount: number };
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function FacilityRatesPage() {
  const { user } = useAuth();
  const fid = user?.facilityId;
  const [facilityRates, setFacilityRates] = useState<RateRow[] | null>(null);
  const [globalRates, setGlobalRates] = useState<RateRow[]>([]);
  const [form, setForm] = useState({ bag_size_id: "", rate_amount: 0 });

  const load = useCallback(() => {
    if (!fid) return;
    api<{ facilityRates: RateRow[]; globalRates: RateRow[] }>(`/facility/${fid}/rates`).then(
      (r) => {
        setFacilityRates(r.facilityRates);
        setGlobalRates(r.globalRates);
      }
    );
  }, [fid]);

  useEffect(load, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await post(`/facility/${fid}/rates`, form);
    setForm({ bag_size_id: "", rate_amount: 0 });
    load();
  }

  if (!facilityRates) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title="Facility Rates"
        subtitle="Facility-specific per-bag rates override the global defaults"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Facility-specific rates" subtitle="These apply before global defaults">
          <Table head={["Bag size", "Rate", "Scope"]} empty={null}>
            {facilityRates.map((r) => (
              <tr key={r.rate.id}>
                <Td className="font-semibold text-field-900">{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                <Td><Money value={r.rate.rate_amount} /></Td>
                <Td><Badge tone="blue">This facility</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="space-y-6">
          <Card title="Global default rates" subtitle="Used when no facility rate exists">
            <Table head={["Bag size", "Rate"]} empty={null}>
              {globalRates.map((r) => (
                <tr key={r.rate.id}>
                  <Td className="font-semibold text-field-900">{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                  <Td><Money value={r.rate.rate_amount} /></Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Set facility rate" subtitle="Override the global rate for a bag size">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Bag size">
                <SearchableSelect
                  value={form.bag_size_id}
                  onChange={(v) => setForm({ ...form, bag_size_id: v })}
                  options={globalRates.map((r) => ({
                    value: r.bagSize.id,
                    label: `${r.bagSize.size_name} (${r.bagSize.weight_kg}kg)`,
                  }))}
                  placeholder="Select bag size…"
                  searchPlaceholder="Search bag sizes…"
                  required
                />
              </Field>
              <Field label="Facility rate (₹)">
                <Input type="number" min={0} value={form.rate_amount} onChange={(e) => setForm({ ...form, rate_amount: Number(e.target.value) })} required />
              </Field>
              <Button type="submit">Save facility rate</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
