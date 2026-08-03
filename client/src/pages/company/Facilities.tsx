import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, post, put, del } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageHeader,
  SearchableSelect,
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

interface FacilityAdminRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  facility_id: string | null;
  created_at: string;
}

const emptyFacilityForm = {
  name: "",
  location: "",
  city: "",
  capacity: 0,
};

const emptyAdminForm = { name: "", email: "", phone: "", password: "" };

export default function CompanyFacilitiesPage() {
  const { user } = useAuth();
  const cid = user?.companyId;
  const [rows, setRows] = useState<FacilityRow[] | null>(null);
  const [admins, setAdmins] = useState<FacilityAdminRow[]>([]);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Add / edit facility
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [editingFacility, setEditingFacility] = useState<FacilityRow["facility"] | null>(null);
  const [facilityForm, setFacilityForm] = useState(emptyFacilityForm);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [busy, setBusy] = useState(false);

  // Add admin
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminFacilityId, setAdminFacilityId] = useState("");
  const [addAdminForm, setAddAdminForm] = useState(emptyAdminForm);
  const [adminBusy, setAdminBusy] = useState(false);

  const load = useCallback(() => {
    if (!cid) return;
    api<{ facilities: FacilityRow[] }>(`/company/${cid}/facilities`).then((r) => setRows(r.facilities));
    api<{ facilityAdmins: FacilityAdminRow[] }>(`/company/${cid}/facility-admins`).then((r) =>
      setAdmins(r.facilityAdmins)
    );
  }, [cid]);

  useEffect(load, [load]);

  function openAddFacility() {
    setEditingFacility(null);
    setFacilityForm(emptyFacilityForm);
    setAdminForm(emptyAdminForm);
    setShowFacilityModal(true);
  }

  function openEditFacility(f: FacilityRow["facility"]) {
    setEditingFacility(f);
    setFacilityForm({
      name: f.name,
      location: f.location,
      city: f.city ?? "",
      capacity: f.capacity ?? 0,
    });
    setAdminForm(emptyAdminForm);
    setShowFacilityModal(true);
  }

  async function saveFacility(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        name: facilityForm.name,
        location: facilityForm.location,
        city: facilityForm.city || null,
        capacity: Number(facilityForm.capacity) || 0,
      };
      if (editingFacility) {
        await put(`/company/${cid}/facilities/${editingFacility.id}`, body);
        setNotice({ kind: "success", text: `Facility “${facilityForm.name}” updated.` });
      } else {
        await post(`/company/${cid}/facilities`, {
          ...body,
          admin:
            adminForm.name || adminForm.email || adminForm.password
              ? adminForm
              : undefined,
        });
        setNotice({
          kind: "success",
          text: adminForm.name
            ? `Facility “${facilityForm.name}” onboarded with admin ${adminForm.email}.`
            : `Facility “${facilityForm.name}” onboarded.`,
        });
      }
      setShowFacilityModal(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Failed to save facility" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteFacility(f: FacilityRow["facility"]) {
    if (!confirm(`Delete facility “${f.name}”? This also removes its rates and supplier drops.`)) return;
    setNotice(null);
    try {
      await del(`/company/${cid}/facilities/${f.id}`);
      setNotice({ kind: "success", text: `Facility “${f.name}” deleted.` });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Failed to delete facility" });
    }
  }

  function openAddAdmin(facilityId: string) {
    setAdminFacilityId(facilityId);
    setAddAdminForm(emptyAdminForm);
    setShowAdminModal(true);
  }

  async function saveAdmin(e: FormEvent) {
    e.preventDefault();
    setAdminBusy(true);
    setNotice(null);
    try {
      await post(`/company/${cid}/facility-admins`, {
        name: addAdminForm.name,
        email: addAdminForm.email,
        phone: addAdminForm.phone || null,
        password: addAdminForm.password,
        facilityId: adminFacilityId,
      });
      setNotice({ kind: "success", text: `Facility admin ${addAdminForm.email} created.` });
      setShowAdminModal(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Failed to create admin" });
    } finally {
      setAdminBusy(false);
    }
  }

  if (!rows) return <LoadingScreen label="Loading facilities…" />;

  return (
    <div>
      <PageHeader
        title="Facilities"
        subtitle="Onboard your facilities and facility admins, then run each facility directly."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowAdminModal(true)}>
              + Add facility admin
            </Button>
            <Button onClick={openAddFacility}>+ Onboard facility</Button>
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
            title="No facilities yet"
            hint="Onboard your first facility — you can create its admin right away"
          />
        </Card>
      ) : (
        <Card>
          <Table
            head={["Facility", "Location", "Capacity", "Admin", "Status", "Actions"]}
            empty={null}
          >
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
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/company/facility/${r.facility.id}/dashboard`}>
                      <Button size="sm" variant="success">Manage</Button>
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => openAddAdmin(r.facility.id)}>
                      Admin
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEditFacility(r.facility)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => deleteFacility(r.facility)}>
                      Delete
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
        <Card title="Facility admins" subtitle={`${admins.length} admin${admins.length === 1 ? "" : "s"} across your facilities`}>
          {admins.length === 0 ? (
            <EmptyState title="No facility admins yet" hint="Add admins from a facility row or the header button" />
          ) : (
            <Table head={["Name", "Email", "Phone", "Facility", "Created"]} empty={null}>
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-field-50/50">
                  <Td className="font-semibold text-field-900">{a.name}</Td>
                  <Td>{a.email}</Td>
                  <Td>{a.phone ?? "—"}</Td>
                  <Td>{rows.find((r) => r.facility.id === a.facility_id)?.facility.name ?? "—"}</Td>
                  <Td className="text-xs text-field-400">{fmtDate(a.created_at)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {/* Onboard / edit facility modal */}
      <Modal
        open={showFacilityModal}
        onClose={() => setShowFacilityModal(false)}
        title={editingFacility ? `Edit ${editingFacility.name}` : "Onboard facility"}
      >
        <form onSubmit={saveFacility} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Facility name">
              <Input
                value={facilityForm.name}
                onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                placeholder="e.g. Nashik Cold Store 1"
                required
              />
            </Field>
            <Field label="Location">
              <Input
                value={facilityForm.location}
                onChange={(e) => setFacilityForm({ ...facilityForm, location: e.target.value })}
                placeholder="e.g. Pimpalgaon, NH-60"
                required
              />
            </Field>
            <Field label="City">
              <Input
                value={facilityForm.city}
                onChange={(e) => setFacilityForm({ ...facilityForm, city: e.target.value })}
              />
            </Field>
            <Field label="Capacity (workers)">
              <Input
                type="number"
                min={0}
                value={facilityForm.capacity}
                onChange={(e) => setFacilityForm({ ...facilityForm, capacity: Number(e.target.value) })}
              />
            </Field>
          </div>

          {!editingFacility && (
            <>
              <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
                Optional: create this facility's admin login right away.
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Admin name">
                  <Input
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </Field>
                <Field label="Admin email">
                  <Input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                    placeholder="admin@facility.local"
                  />
                </Field>
                <Field label="Admin phone">
                  <Input
                    value={adminForm.phone}
                    onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  />
                </Field>
                <Field label="Admin password" hint="Min 8 characters">
                  <Input
                    type="password"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </Field>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowFacilityModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editingFacility ? "Save changes" : "Onboard facility"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add facility admin modal */}
      <Modal open={showAdminModal} onClose={() => setShowAdminModal(false)} title="Add facility admin">
        <form onSubmit={saveAdmin} className="space-y-4">
          <Field label="Facility">
            <SearchableSelect
              value={adminFacilityId}
              onChange={setAdminFacilityId}
              options={rows.map((r) => ({ value: r.facility.id, label: r.facility.name }))}
              placeholder="Select facility…"
              searchPlaceholder="Search facilities…"
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={addAdminForm.name}
                onChange={(e) => setAddAdminForm({ ...addAdminForm, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={addAdminForm.email}
                onChange={(e) => setAddAdminForm({ ...addAdminForm, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Phone">
              <Input
                value={addAdminForm.phone}
                onChange={(e) => setAddAdminForm({ ...addAdminForm, phone: e.target.value })}
              />
            </Field>
            <Field label="Password" hint="Min 8 characters">
              <Input
                type="password"
                value={addAdminForm.password}
                onChange={(e) => setAddAdminForm({ ...addAdminForm, password: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAdminModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adminBusy}>
              Create admin
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
