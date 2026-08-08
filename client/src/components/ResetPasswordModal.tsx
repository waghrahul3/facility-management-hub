import { useState } from "react";
import type { FormEvent } from "react";
import { adminResetPassword } from "../lib/api";
import { useI18n } from "../i18n";
import { Button, Field, Input, Modal } from "./ui";

interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Target user's id (from the users table). */
  userId: string | null;
  /** Display name for the confirmation copy. */
  userName?: string;
  /** Called after a successful reset so the page can reload its data. */
  onSaved?: () => void;
}

/**
 * Shared admin "reset this user's password" modal. The new password is set
 * directly and all of the target's sessions are revoked.
 */
export default function ResetPasswordModal({
  open,
  onClose,
  userId,
  userName,
  onSaved,
}: ResetPasswordModalProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setPassword("");
    setConfirm("");
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) return;
    if (password.length < 8) {
      setError(t("Password must be at least 8 characters"));
      return;
    }
    if (password !== confirm) {
      setError(t("Passwords do not match"));
      return;
    }
    setBusy(true);
    try {
      await adminResetPassword(userId, password);
      resetForm();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to reset password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("Reset password")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs leading-relaxed text-field-500">
          {userName
            ? t("Set a new password for {name}. They'll be signed out and must use the new password.", { name: userName })
            : t("Set a new password. The user will be signed out and must use the new password.")}
        </p>

        <Field label={t("New password")}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        {error && (
          <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={busy}>
            {t("Reset password")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
