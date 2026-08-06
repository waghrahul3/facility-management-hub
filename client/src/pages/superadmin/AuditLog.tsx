import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  LoadingScreen,
  PageHeader,
  Pagination,
  SearchableSelect,
  Table,
  Td,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

interface AuditRow {
  log: {
    id: string;
    action: string;
    user_role: string | null;
    entity_type: string;
    entity_id: string | null;
    old_values: unknown;
    new_values: unknown;
    timestamp: string;
    ip_address: string | null;
  };
  user: { id: string; name: string } | null;
}

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "COLLECT", "DISTRIBUTE", "LOGIN", "LOGOUT"];
const ENTITIES = ["FACILITY", "FACILITY_ADMIN", "BAG_SIZE", "RATE", "SUPPLIER", "SUPPLIER_DROP", "TOLI", "WORK_ENTRY", "WEEKLY_SUMMARY", "SUPPLIER_PAYMENT", "USER"];

const actionTone: Record<string, "green" | "amber" | "red" | "blue" | "slate" | "violet"> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  APPROVE: "green",
  REJECT: "red",
  COLLECT: "violet",
  DISTRIBUTE: "violet",
  LOGIN: "slate",
  LOGOUT: "slate",
};

export default function AuditLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  const PAGE_SIZE = 50;

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    api<{ logs: AuditRow[]; total: number }>(`/super-admin/audit-logs?${params}`).then((r) => {
      setLogs(r.logs);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [action, entityType, page, PAGE_SIZE]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title={t("Audit Log")}
        subtitle={t("Every create, update, approve, collect, and distribute across the system ({n} events)", { n: total })}
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("Action")}>
            <SearchableSelect
              value={action}
              onChange={(v) => {
                setAction(v);
                setPage(1);
              }}
              options={ACTIONS.map((a) => ({ value: a, label: a }))}
              placeholder={t("All actions")}
              searchPlaceholder={t("Search actions…")}
              allowClear
              className="w-44"
            />
          </Field>
          <Field label={t("Entity")}>
            <SearchableSelect
              value={entityType}
              onChange={(v) => {
                setEntityType(v);
                setPage(1);
              }}
              options={ENTITIES.map((e) => ({ value: e, label: e }))}
              placeholder={t("All entities")}
              searchPlaceholder={t("Search entities…")}
              allowClear
              className="w-48"
            />
          </Field>
        </div>
      </Card>

      {!logs ? (
        <LoadingScreen />
      ) : logs.length === 0 ? (
        <Card><EmptyState title={t("No audit events")} hint={t("Mutating actions are logged automatically")} /></Card>
      ) : (
        <Card>
          <Table head={[t("When"), t("User"), t("Role"), t("Action"), t("Entity"), t("Details")]} empty={null}>
            {logs.map((r) => (
              <tr key={r.log.id} className="hover:bg-field-50/50">
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.log.timestamp)}</Td>
                <Td className="font-medium text-field-800">{r.user?.name ?? "—"}</Td>
                <Td><Badge tone="slate">{r.log.user_role ?? "—"}</Badge></Td>
                <Td><Badge tone={actionTone[r.log.action] ?? "slate"}>{r.log.action}</Badge></Td>
                <Td className="text-xs">{r.log.entity_type}</Td>
                <Td className="max-w-[220px] truncate text-xs text-field-400">
                  {r.log.new_values ? JSON.stringify(r.log.new_values).slice(0, 120) : r.log.entity_id ?? "—"}
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </Card>
      )}
    </div>
  );
}
