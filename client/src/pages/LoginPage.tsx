import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button, Field, Input } from "../components/ui";

const demoAccounts = [
  { role: "Super Admin", email: "superadmin@onionfacility.local" },
  { role: "Company Admin", email: "santosh@onionfacility.local" },
  { role: "Facility Admin", email: "admin@onionfacility.local" },
  { role: "Supplier", email: "rohidas@onionfacility.local" },
  { role: "Toli Leader", email: "mahesh@onionfacility.local" },
];

const features = [
  {
    icon: "🚚",
    title: "Supplier drops",
    text: "Register drops with negotiated rent per drop.",
  },
  {
    icon: "🧑‍🌾",
    title: "Toli work recording",
    text: "Gridding, packaging & bagging per bag size.",
  },
  {
    icon: "💵",
    title: "Sunday settlements",
    text: "Earnings minus rent, collected & distributed.",
  },
  {
    icon: "📊",
    title: "Multi-facility",
    text: "Every center you run, on one platform.",
  },
];

function homeFor(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/dashboard";
    case "COMPANY_ADMIN":
      return "/company/dashboard";
    case "FACILITY_ADMIN":
      return "/facility/dashboard";
    case "SUPPLIER":
      return "/supplier/dashboard";
    case "TOLI_LEADER":
      return "/leader/dashboard";
    default:
      return "/login";
  }
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(emailOrPhone.trim(), password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-bg flex min-h-screen">
      {/* ------------------------------------------------------------ */}
      {/* Brand hero panel (desktop)                                    */}
      {/* ------------------------------------------------------------ */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        <div className="brand-gradient absolute inset-0" />
        {/* decorative glows */}
        <div className="absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-husk-400/20 blur-3xl" />
        <div className="absolute -right-16 bottom-1/4 h-96 w-96 rounded-full bg-onion-400/25 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-field-100/10 blur-3xl" />
        {/* faint field grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-2xl ring-1 ring-white/20 backdrop-blur">
              🧅
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-bold text-white">
                Onion Facility Center
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                Management Suite
              </p>
            </div>
          </div>

          <div>
            <h1 className="max-w-md font-display text-4xl font-bold leading-tight text-white xl:text-5xl">
              One field-to-payment platform for your onion centers.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
              Register supplier drops, track daily toli work, and settle Sunday
              payments — earnings minus rent — with full transparency for
              suppliers, leaders, and admins.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
              {features.map((f, i) => (
                <div
                  key={f.title}
                  className="animate-fade-up rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur transition-colors duration-150 hover:bg-white/10"
                  style={{ animationDelay: `${120 + i * 90}ms` }}
                >
                  <span className="text-xl">{f.icon}</span>
                  <p className="mt-2 text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/60">{f.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium text-white/50">
            <span>🔒 JWT-secured</span>
            <span>🗄️ PostgreSQL</span>
            <span>📱 Mobile-friendly</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Sign-in panel                                                */}
      {/* ------------------------------------------------------------ */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md animate-fade-up">
          {/* Brand (mobile only) */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg shadow-onion-900/20 ring-1 ring-white/20">
              🧅
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-field-900">
              Onion Facility Center
            </h1>
            <p className="mt-1 max-w-xs text-sm text-field-500">
              Drops, toli work recording, and Sunday payment settlements — all in
              one place.
            </p>
          </div>

          {/* Sign-in card */}
          <div className="card-surface p-6 sm:p-8">
            <h2 className="font-display text-lg font-bold text-field-900">Sign in</h2>
            <p className="mb-5 mt-0.5 text-xs text-field-500">
              Use your facility email or phone number
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email or phone">
                <Input
                  type="text"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  placeholder="you@facility.com or 98xxxxxx00"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>

              {error && (
                <div className="animate-fade-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" loading={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>

          {/* Demo accounts */}
          <div className="mt-6 rounded-2xl border border-dashed border-field-300 bg-white/70 p-4 backdrop-blur">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-field-400">
              Demo accounts · password{" "}
              <span className="text-onion-700">Onion@123</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {demoAccounts.map((d) => (
                <button
                  key={d.email}
                  onClick={() => {
                    setEmailOrPhone(d.email);
                    setPassword("Onion@123");
                  }}
                  className="rounded-lg border border-field-200 bg-white px-2 py-1.5 text-left transition-all duration-150 hover:-translate-y-px hover:border-onion-400 hover:bg-onion-50 hover:shadow-sm"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-onion-700">
                    {d.role}
                  </span>
                  <span className="block truncate text-[11px] text-field-500">
                    {d.email}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-field-400">
            Multi-facility onion processing management · Local PostgreSQL · JWT
            secured
          </p>
        </div>
      </div>
    </div>
  );
}
