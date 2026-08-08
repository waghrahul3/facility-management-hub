import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { changePassword, getSupplierProfile, updateProfile } from "../lib/api";
import { useI18n } from "../i18n";
import { Button, Card, Field, Input, PageHeader } from "../components/ui";

interface ProfileForm {
  name: string;
  phone: string;
  email: string;
  contact_person: string;
  address: string;
  city: string;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  FACILITY_ADMIN: "Facility Admin",
  TOLI_LEADER: "Toli Leader",
  SUPPLIER: "Supplier",
};

export default function AccountPage() {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const isSupplier = user?.role === "SUPPLIER";

  // Profile
  const [profile, setProfile] = useState<ProfileForm>({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    contact_person: "",
    address: "",
    city: "",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Suppliers keep extra contact fields on their supplier record.
  const loadSupplierExtras = useCallback(() => {
    if (!isSupplier) return;
    getSupplierProfile()
      .then((r) =>
        setProfile((p) => ({
          ...p,
          contact_person: r.supplier.contact_person ?? "",
          address: r.supplier.address ?? "",
          city: r.supplier.city ?? "",
        }))
      )
      .catch(() => {
        /* ignore — extras stay blank */
      });
  }, [isSupplier]);

  useEffect(loadSupplierExtras, [loadSupplierExtras]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileNotice(null);
    setProfileBusy(true);
    try {
      const data = await updateProfile({
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        email: profile.email.trim(),
        // Only suppliers carry these fields
        ...(isSupplier
          ? {
              contact_person: profile.contact_person.trim() || null,
              address: profile.address.trim() || null,
              city: profile.city.trim() || null,
            }
          : {}),
      });
      updateUser(data.user);
      setProfileNotice({ kind: "success", text: t("Profile updated.") });
    } catch (err) {
      setProfileNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to update profile") });
    } finally {
      setProfileBusy(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwNotice(null);
    if (newPassword.length < 8) {
      setPwNotice({ kind: "error", text: t("Password must be at least 8 characters") });
      return;
    }
    if (newPassword !== confirm) {
      setPwNotice({ kind: "error", text: t("Passwords do not match") });
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwNotice({ kind: "success", text: t("Password changed. You'll be asked to sign in again after your session expires.") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setPwNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to change password") });
    } finally {
      setPwBusy(false);
    }
  }

  const roleLabel = user ? roleLabels[user.role] ?? "" : "";

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("Account")} subtitle={t("Your profile and security settings")} />

      {/* Profile */}
      <Card className="space-y-5">
        <div className="flex items-center gap-4 rounded-xl border border-field-200 bg-field-50/60 p-4">
          <span className="brand-gradient flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ring-1 ring-white/20">
            {user?.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-field-900">{user?.name}</p>
            <p className="truncate text-xs text-field-500">
              {user?.email}
              {user?.phone ? ` · ${user.phone}` : ""}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-onion-700">
              {t(roleLabel)}
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <h3 className="font-display text-sm font-bold text-field-900">{t("Profile")}</h3>

          <Field label={t("Name")}>
            <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Email")} hint={t("Used to sign in")}>
              <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
            </Field>
            <Field label={t("Phone")}>
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </Field>
          </div>

          {isSupplier && (
            <>
              <Field label={t("Contact person")}>
                <Input value={profile.contact_person} onChange={(e) => setProfile({ ...profile, contact_person: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Address")}>
                  <Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
                </Field>
                <Field label={t("City")}>
                  <Input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                </Field>
              </div>
            </>
          )}

          {profileNotice && (
            <div
              className={`animate-fade-in rounded-lg border px-3 py-2 text-xs font-medium ${
                profileNotice.kind === "success"
                  ? "border-onion-200 bg-onion-50 text-onion-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {profileNotice.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={profileBusy}>
              {t("Save profile")}
            </Button>
          </div>
        </form>
      </Card>

      {/* Password */}
      <Card className="mt-6 space-y-5">
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <h3 className="font-display text-sm font-bold text-field-900">{t("Change password")}</h3>

          <Field label={t("Current password")}>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("New password")}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label={t("Confirm new password")}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>
          </div>

          {pwNotice && (
            <div
              className={`animate-fade-in rounded-lg border px-3 py-2 text-xs font-medium ${
                pwNotice.kind === "success"
                  ? "border-onion-200 bg-onion-50 text-onion-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {pwNotice.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={pwBusy}>
              {t("Update password")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
