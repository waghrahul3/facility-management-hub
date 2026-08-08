import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, post, put, del, updateCompanyFacilityAdmin } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import { fmtDate } from "../../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListFilters,
  LoadingScreen,
  PageHeader,
  Pagination,
  Table,
  Td,
} from "../../components/ui";
import FacilityModal from "./facilities/FacilityModal";
import AdminModal from "./facilities/AdminModal";
import ResetPasswordModal from "../../components/ResetPasswordModal";
import EditUserModal from "../../components/EditUserModal";
import {
  ADMINS_PAGE_SIZE,
  type AdminSaveValues,
  type FacilityAdminRow,
  type FacilityRow,
  type FacilitySaveValues,
} from "./facilities/types";

export default function CompanyFacilitiesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const cid = user?.companyId;
  const [rows, setRows] = useState<FacilityRow[] | null>(null);
  const [admins, setAdmins] = useState<FacilityAdminRow[]>([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminQ, setAdminQ] = useState("");
  const [adminFacility, setAdminFacility] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Add / edit facility
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState<FacilityRow["facility"] | null>(null);
  const [busy, setBusy] = useState(false);

  // Add admin
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [presetFacilityId, setPresetFacilityId] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  // Reset a facility admin's password
  const [resetTarget, setResetTarget] = useState<FacilityAdminRow | null>(null);
  // Edit a facility admin's profile
  const [editTarget, setEditTarget] = useState<FacilityAdminRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(() => {
    if (!cid) return;
    api<{ facilities: FacilityRow[] }>(`/company/${cid}/facilities`).then((r) => setRows(r.facilities));
    api<{ facilityAdmins: FacilityAdminRow[]; total: number }>(
      `/company/${cid}/facility-admins?page=${adminPage}&pageSize=${ADMINS_PAGE_SIZE}&q=${encodeURIComponent(adminQ)}&facilityId=${adminFacility}`
    ).then((r) => {
      setAdmins(r.facilityAdmins);
      setAdminTotal(r.total);
      if (adminPage > Math.max(1, Math.ceil(r.total / ADMINS_PAGE_SIZE))) {
        setAdminPage(Math.max(1, Math.ceil(r.total / ADMINS_PAGE_SIZE)));
      }
    });
  }, [cid, adminPage, adminQ, adminFacility]);

  useEffect(load, [load]);

  function openAddFacility() {
    setEditingFacility(null);
    setShowFacilityModal(true);
  }

  function openEditFacility(f: FacilityRow["facility"]) {
    setEditingFacility(f);
    setShowFacilityModal(true);
  }

  async function saveFacility(values: FacilitySaveValues) {
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        name: values.name,
        location: values.location,
        city: values.city,
        capacity: values.capacity,
      };
      if (editingFacility) {
        await put(`/company/${cid}/facilities/${editingFacility.id}`, body);
        setNotice({ kind: "success", text: t("Facility “{name}” updated.", { name: values.name }) });
      } else {
        await post(`/company/${cid}/facilities`, {
          ...body,
          admin: values.admin ?? undefined,
        });
        setNotice({
          kind: "success",
          text: values.admin?.name
            ? t("Facility “{name}” onboarded with admin {email}.", { name: values.name, email: values.admin.email })
            : t("Facility “{name}” onboarded.", { name: values.name }),
        });
      }
      setShowFacilityModal(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to save facility") });
    } finally {
      setBusy(false);
    }
  }

  async function deleteFacility(f: FacilityRow["facility"]) {
    if (!confirm(t("Delete facility “{name}”? This also removes its rates and supplier drops.", { name: f.name }))) return;
    setNotice(null);
    try {
      await del(`/company/${cid}/facilities/${f.id}`);
      setNotice({ kind: "success", text: t("Facility “{name}” deleted.", { name: f.name }) });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to delete facility") });
    }
  }

  function openAddAdmin(facilityId: string) {
    setPresetFacilityId(facilityId);
    setShowAdminModal(true);
  }

  async function handleEditAdmin(values: { name: string; phone: string; email: string }) {
    if (!editTarget || !cid) return;
    setEditBusy(true);
    try {
      await updateCompanyFacilityAdmin(cid, editTarget.id, {
        name: values.name,
        phone: values.phone.trim() || null,
        email: values.email,
      });
      setEditTarget(null);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to update admin") });
    } finally {
      setEditBusy(false);
    }
  }

  async function saveAdmin(values: AdminSaveValues) {
    setAdminBusy(true);
    setNotice(null);
    try {
      await post(`/company/${cid}/facility-admins`, {
        name: values.name,
        email: values.email,
        phone: values.phone || null,
        password: values.password,
        facilityId: values.facilityId,
      });
      setNotice({ kind: "success", text: t("Facility admin {email} created.", { email: values.email }) });
      setShowAdminModal(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to create admin") });
    } finally {
      setAdminBusy(false);
    }
  }

  if (!rows) return <LoadingScreen label={t("Loading facilities…")} />;

  return (
    <div>
      <PageHeader
        title={t("Facilities")}
        subtitle={t("Onboard your facilities and facility admins, then run each facility directly.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPresetFacilityId("");
                setShowAdminModal(true);
              }}
            >
              {t("+ Add facility admin")}
            </Button>
            <Button onClick={openAddFacility}>{t("+ Onboard facility")}</Button>
          </div>
        }
      />

      {notice && (
        <div
          className={`animate-fade-in mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={t("No facilities yet")}
            hint={t("Onboard your first facility — you can create its admin right away")}
          />
        </Card>
      ) : (
        <Card>
          <Table
            head={[t("Facility"), t("Location"), t("Capacity"), t("Admin"), t("Status"), t("Actions")]}
            empty={null}
          >
            {rows.map((r) => (
              <tr key={r.facility.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.facility.name}</Td>
                <Td>
                  {r.facility.location}
                  {r.facility.city ? <span className="text-field-400"> · {r.facility.city}</span> : null}
                </Td>
                <Td>{t("{n} workers", { n: r.facility.capacity ?? 0 })}</Td>
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
                  {r.facility.is_active ? <Badge tone="green">{t("Active")}</Badge> : <Badge tone="red">{t("Inactive")}</Badge>}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/company/facility/${r.facility.id}/dashboard`}>
                      <Button size="sm" variant="success">{t("Manage")}</Button>
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => openAddAdmin(r.facility.id)}>
                      {t("Admin")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEditFacility(r.facility)}>
                      {t("Edit")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => deleteFacility(r.facility)}>
                      {t("Delete")}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Facility admins */}
      <div className="mt-6">
        <Card title={t("Facility admins")} subtitle={t("{n} admins across your facilities", { n: adminTotal })}>
          <div className="mb-3">
            <ListFilters
              search={adminQ}
              onSearch={(v) => {
                setAdminQ(v);
                setAdminPage(1);
              }}
              status={adminFacility}
              onStatus={(v) => {
                setAdminFacility(v);
                setAdminPage(1);
              }}
              statusOptions={rows.map((r) => ({ value: r.facility.id, label: r.facility.name }))}
              searchPlaceholder={t("Search admin name or email…")}
              allLabel={t("All facilities")}
            />
          </div>
          {admins.length === 0 ? (
            adminQ || adminFacility ? (
              <EmptyState icon="🔍" title={t("No admins match")} hint={t("Try a different search or facility filter")} />
            ) : (
              <EmptyState title={t("No facility admins yet")} hint={t("Add admins from a facility row or the header button")} />
            )
          ) : (
            <>
              <Table head={[t("Name"), t("Email"), t("Phone"), t("Facility"), t("Created"), t("Actions")]} empty={null}>
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-field-50/50">
                    <Td className="font-semibold text-field-900">{a.name}</Td>
                    <Td>{a.email}</Td>
                    <Td>{a.phone ?? "—"}</Td>
                    <Td>{rows.find((r) => r.facility.id === a.facility_id)?.facility.name ?? "—"}</Td>
                    <Td className="text-xs text-field-400">{fmtDate(a.created_at)}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditTarget(a)}>
                          {t("Edit")}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setResetTarget(a)}>
                          {t("Reset password")}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
              <Pagination
                page={adminPage}
                totalPages={Math.max(1, Math.ceil(adminTotal / ADMINS_PAGE_SIZE))}
                total={adminTotal}
                pageSize={ADMINS_PAGE_SIZE}
                onChange={setAdminPage}
              />
            </>
          )}
        </Card>
      </div>

      {/* Onboard / edit facility modal */}
      <FacilityModal
        open={showFacilityModal}
        editing={editingFacility}
        saving={busy}
        onClose={() => setShowFacilityModal(false)}
        onSave={saveFacility}
      />

      {/* Reset facility admin password */}
      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userId={resetTarget?.id ?? null}
        userName={resetTarget?.name}
      />

      {/* Edit facility admin profile */}
      <EditUserModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={t("Edit facility admin")}
        initial={editTarget ? { name: editTarget.name, phone: editTarget.phone, email: editTarget.email } : null}
        saving={editBusy}
        onSave={handleEditAdmin}
      />

      {/* Add facility admin modal */}
      <AdminModal
        open={showAdminModal}
        facilities={rows}
        initialFacilityId={presetFacilityId}
        saving={adminBusy}
        onClose={() => setShowAdminModal(false)}
        onSave={saveAdmin}
      />
    </div>
  );
}
