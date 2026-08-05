import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  PageHeader,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

interface Distribution {
  id: string;
  amount_distributed: number;
  distribution_date: string;
  payment_method: string;
  notes: string | null;
}

export default function LeaderPaymentHistoryPage() {
  const { t } = useI18n();
  const [distributions, setDistributions] = useState<Distribution[] | null>(null);

  useEffect(() => {
    api<{ distributions: Distribution[] }>("/toli-leader/payment-history").then((r) =>
      setDistributions(r.distributions)
    );
  }, []);

  if (!distributions) return <LoadingScreen label={t("Loading payment history…")} />;

  return (
    <div>
      <PageHeader
        title={t("Payment History")}
        subtitle={t("Amounts distributed to your toli by the supplier")}
        action={<ExportButtons reportType="distributions" />}
      />

      {distributions.length === 0 ? (
        <Card>
          <EmptyState title={t("No payments yet")} hint={t("Distributions appear after Sunday settlement")} />
        </Card>
      ) : (
        <Card>
          <Table head={[t("Date"), t("Method"), t("Amount"), t("Notes")]} empty={null}>
            {distributions.map((d) => (
              <tr key={d.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(d.distribution_date)}</Td>
                <Td><StatusBadge status={d.payment_method.replace("_", " ")} /></Td>
                <Td className="font-semibold text-onion-800"><Money value={d.amount_distributed} /></Td>
                <Td className="text-xs text-field-400">{d.notes ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
