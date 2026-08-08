import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../lib/api";
import { useI18n } from "../i18n";
import { Button, Field, Input } from "../components/ui";
import { LanguagePicker } from "../components/LanguagePicker";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Request failed"));
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
          {sent ? (
            <div className="animate-fade-in text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-onion-50 text-2xl ring-1 ring-onion-100">
                ✉️
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-field-900">
                {t("Check your email")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-field-500">
                {t(
                  "If an account exists for that email, we've sent a one-time password reset link. It expires in 1 hour."
                )}
              </p>
              <Link
                to="/login"
                className="mt-5 inline-block text-sm font-semibold text-onion-700 hover:text-onion-800 hover:underline"
              >
                {t("Back to sign in")}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-lg font-bold text-field-900">
                {t("Forgot password?")}
              </h2>
              <p className="mb-5 mt-0.5 text-xs text-field-500">
                {t("Enter your email and we'll send you a reset link")}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label={t("Email")}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@facility.com"
                    autoComplete="email"
                    required
                  />
                </Field>

                {error && (
                  <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {error}
                  </div>
                )}

                <Button type="submit" size="lg" loading={busy} className="w-full">
                  {busy ? t("Sending…") : t("Send reset link")}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm">
                <Link
                  to="/login"
                  className="font-semibold text-onion-700 hover:text-onion-800 hover:underline"
                >
                  {t("Back to sign in")}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
