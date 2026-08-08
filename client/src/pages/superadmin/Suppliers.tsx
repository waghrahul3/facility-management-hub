import { useCallback, useEffect, useState } from "react";
import { api, post, updateSupplier } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingScreen,
  PageHeader,
  Pagination,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import SupplierFormModal from "./suppliers/SupplierFormModal";
import GenerateLoginModal from "./suppliers/GenerateLoginModal";
import ResetPasswordModal from "../../components/ResetPasswordModal";
import {
  PAGE_SIZE,
  type LoginFormValues,
  type SupplierFormValues,
  type SupplierRow,
} from "./suppliers/types";

export default function SuppliersPage() {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Generate-login (activation) state
  const [loginTarget, setLoginTarget] = useState<SupplierRow["supplier"] | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Reset-password state (only for suppliers that already have a login)
  const [resetTarget, setResetTarget] = useState<SupplierRow["user"] | null>(null);
  // Edit-supplier state
  const [editTarget, setEditTarget] = useState<SupplierRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(() => {
    api<{ suppliers: SupplierRow[]; total: number }>(`/super-admin/suppliers?page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setSuppliers(r.suppliers);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [page]);

  useEffect(load, [load]);

  async function handleSubmit(values: SupplierFormValues) {
    setBusy(true);
    setNotice(null);
    try {
      await post("/super-admin/suppliers", {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        contact_person: values.contact_person || null,
        address: values.address || null,
        city: values.city || null,
        create_login: values.create_login,
        password: values.create_login ? values.password : undefined,
      });
      const emailForLogin = values.email.trim().toLowerCase();
      setNotice(
        values.create_login
          ? {
              kind: "success",
              text: t("Supplier “{name}” created with a login for {email}.\n\nPassword: {password} — share these with the supplier.", { name: values.name, email: emailForLogin, password: values.password }),
            }
          : { kind: "success", text: t("Supplier “{name}” created.", { name: values.name }) }
      );
      setShowModal(false);
      load();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : t("Failed to create supplier"),
      });
    } finally {
      setBusy(false);
    }
  }

  function openLogin(target: SupplierRow["supplier"]) {
    setLoginTarget(target);
  }

  async function handleUpdateSupplier(values: SupplierFormValues) {
    if (!editTarget) return;
    setEditBusy(true);
    setNotice(null);
    try {
      await updateSupplier(editTarget.supplier.id, {
        name: values.name,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        contact_person: values.contact_person.trim() || null,
        address: values.address.trim() || null,
        city: values.city.trim() || null,
      });
      setNotice({ kind: "success", text: t("Supplier “{name}” updated.", { name: values.name }) });
      setEditTarget(null);
      load();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : t("Failed to update supplier"),
      });
    } finally {
      setEditBusy(false);
    }
  }

  async function handleGenerateLogin(values: LoginFormValues) {
    if (!loginTarget) return;
    setLoginBusy(true);
    setNotice(null);
    try {
      await post(`/super-admin/suppliers/${loginTarget.id}/generate-login`, {
        email: values.email,
        password: values.password,
      });
      setNotice({
        kind: "success",
        text: t("Login generated for “{name}”.\n\nEmail: {email}\nPassword: {password}\n\nShare these with the supplier — they are now active and selectable at every facility.", {
          name: loginTarget.name,
          email: values.email.trim().toLowerCase(),
          password: values.password,
        }),
      });
      setLoginTarget(null);
      load();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : t("Failed to generate login"),
      });
    } finally {
      setLoginBusy(false);
    }
  }

  const pendingCount = suppliers?.filter((r) => r.supplier.status === "PENDING").length ?? 0;

  return (
    <div>
      <PageHeader
        title={t("Suppliers")}
        subtitle={t("Global supplier registry — facility-added suppliers activate after a login is generated")}
        action={<Button onClick={() => setShowModal(true)}>{t("+ New supplier")}</Button>}
      />

      {notice && (
        <div
          className={`animate-fade-in mb-4 whitespace-pre-line rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="animate-fade-in mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
            {pendingCount}
          </span>
          <p>
            <strong>{t("Awaiting activation.")}</strong>{" "}
            {pendingCount === 1 ? t("This supplier was added by a facility") : t("These suppliers were added by facilities")}{" "}
            {t("and becomes selectable at every facility only after you generate their login below.")}
          </p>
        </div>
      )}

      {!suppliers ? (
        <LoadingScreen />
      ) : suppliers.length === 0 ? (
        <Card><EmptyState title={t("No suppliers yet")} hint={t("Register the first supplier")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Supplier"), t("Contact"), t("Phone"), t("Added by"), t("Status"), t("Login"), t("Actions")]} empty={null}>
            {suppliers.map((r) => (
              <tr key={r.supplier.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                <Td>
                  {r.supplier.contact_person ?? "—"}
                  {r.supplier.email ? (
                    <span className="block text-xs text-field-400">{r.supplier.email}</span>
                  ) : null}
                </Td>
                <Td>{r.supplier.phone ?? "—"}</Td>
                <Td>
                  {r.facility ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone="slate">{t("Facility")}</Badge>
                      <span className="text-xs text-field-600">{r.facility.name}</span>
                    </span>
                  ) : (
                    <Badge tone="slate">{t("Global")}</Badge>
                  )}
                </Td>
                <Td>
                  {r.supplier.status === "PENDING" ? (
                    <StatusBadge status="PENDING" />
                  ) : (
                    <Badge tone="green">{t("Active")}</Badge>
                  )}
                </Td>
                <Td>
                  {r.user ? (
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-1.5">
                        <Badge tone="green">{t("Has login")}</Badge>
                        <Button size="sm" variant="secondary" onClick={() => setResetTarget(r.user)}>
                          {t("Reset password")}
                        </Button>
                      </div>
                      <span className="text-[11px] text-field-400">{r.user.email}</span>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => openLogin(r.supplier)}>
                      {t("Generate login")}
                    </Button>
                  )}
                </Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => setEditTarget(r)}>
                    {t("Edit")}
                  </Button>
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

      <SupplierFormModal
        open={showModal}
        saving={busy}
        onClose={() => setShowModal(false)}
        onSave={handleSubmit}
      />

      <SupplierFormModal
        open={editTarget !== null}
        saving={editBusy}
        onClose={() => setEditTarget(null)}
        onSave={handleUpdateSupplier}
        editing={
          editTarget
            ? {
                name: editTarget.supplier.name,
                email: editTarget.supplier.email,
                phone: editTarget.supplier.phone,
                contact_person: editTarget.supplier.contact_person,
                address: editTarget.supplier.address,
                city: editTarget.supplier.city,
              }
            : null
        }
      />

      <GenerateLoginModal
        open={loginTarget !== null}
        supplier={loginTarget}
        saving={loginBusy}
        onClose={() => setLoginTarget(null)}
        onSave={handleGenerateLogin}
      />

      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userId={resetTarget?.id ?? null}
        userName={resetTarget?.name}
      />
    </div>
  );
}
