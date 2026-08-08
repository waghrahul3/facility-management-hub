import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../lib/api";
import { useI18n } from "../i18n";
import { Button, Field, Input } from "../components/ui";
import { LanguagePicker } from "../components/LanguagePicker";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      await resetPassword(token, password);
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Reset failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-field-400">
            {t("Language")}
          </p>
          <LanguagePicker />
        </div>

        <div className="mb-8 flex flex-col items-center text-center">
          <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg shadow-onion-900/20 ring-1 ring-white/20">
            🧅
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-field-900">
            {t("Onion Facility Center")}
          </h1>
        </div>

        <div className="card-surface p-6 sm:p-8">
          {!token ? (
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl ring-1 ring-red-100">
                ⚠️
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-field-900">
                {t("Invalid reset link")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-field-500">
                {t("This link is missing its reset token. Request a new one to continue.")}
              </p>
              <Link
                to="/forgot-password"
                className="mt-5 inline-block text-sm font-semibold text-onion-700 hover:text-onion-800 hover:underline"
              >
                {t("Request a new link")}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-lg font-bold text-field-900">
                {t("Set a new password")}
              </h2>
              <p className="mb-5 mt-0.5 text-xs text-field-500">
                {t("Choose a strong password — at least 8 characters")}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <Button type="submit" size="lg" loading={busy} className="w-full">
                  {busy ? t("Saving…") : t("Reset password")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
