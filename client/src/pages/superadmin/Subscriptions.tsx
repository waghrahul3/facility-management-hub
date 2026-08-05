import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  Card,
  StatCard,
  Modal,
  Button,
  Field,
  Input,
  Select,
  StatusBadge,
  EmptyState,
  Spinner,
} from "../../components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionPlan {
  id: string;
  name: string;
  type: "COMPANY" | "SUPPLIER";
  price: number;
  billing_cycle: string;
  description: string | null;
  features: string[] | null;
  is_active: boolean;
  created_at: string;
}

interface Subscription {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "PENDING" | "CANCELLED";
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  notes: string | null;
  created_at: string;
  plan_id: string;
  plan_name: string;
  plan_type: string;
  plan_price: number;
  company_id: string | null;
  company_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
}

interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

interface SubscriptionStats {
  active: number;
  expired: number;
  pending: number;
  totalRevenue: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cycleLabel(cycle: string): string {
  switch (cycle) {
    case "quarterly":
      return "quarter (3 mo)";
    case "half-yearly":
      return "6 months";
    case "yearly":
    case "annually":
      return "year";
    default:
      return "month";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800 border border-green-200";
    case "EXPIRED":
      return "bg-red-100 text-red-800 border border-red-200";
    case "PENDING":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "CANCELLED":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionsPage() {
  const [tab, setTab] = useState<"plans" | "subscriptions" | "payments">("plans");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewalNotes, setRenewalNotes] = useState("");
  const [expiringCount, setExpiringCount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);

  // Form states
  const [planForm, setPlanForm] = useState({
    name: "",
    type: "COMPANY" as "COMPANY" | "SUPPLIER",
    price: 500,
    billing_cycle: "monthly",
    description: "",
  });
  const [subForm, setSubForm] = useState({
    plan_id: "",
    company_id: "",
    supplier_id: "",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "CASH",
    reference_number: "",
    notes: "",
  });

  // Entity lists
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subsRes, statsRes, companiesRes, suppliersRes] = await Promise.all([
        api<{ plans: SubscriptionPlan[] }>("/subscriptions/plans"),
        api<{ subscriptions: Subscription[] }>("/subscriptions"),
        api<SubscriptionStats>("/subscriptions/stats"),
        api<{ companies: any[] }>("/super-admin/companies"),
        api<{ suppliers: any[] }>("/super-admin/suppliers"),
      ]);
      setPlans(plansRes.plans);
      setSubscriptions(subsRes.subscriptions);
      setStats(statsRes);
      setCompanies(companiesRes.companies.map((c) => ({ id: c.company.id, name: c.company.name })));
      setSuppliers(suppliersRes.suppliers.map((s) => ({ id: s.id, name: s.name })));
    } catch (err) {
      console.error("Failed to fetch subscriptions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Plan CRUD
  const handleCreatePlan = async () => {
    try {
      await api("/subscriptions/plans", { method: "POST", body: planForm });
      setShowPlanModal(false);
      setPlanForm({ name: "", type: "COMPANY", price: 500, billing_cycle: "monthly", description: "" });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdatePlan = async () => {
    if (!editingPlan) return;
    try {
      await api(`/subscriptions/plans/${editingPlan.id}`, { method: "PUT", body: planForm });
      setShowPlanModal(false);
      setEditingPlan(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeactivatePlan = async (planId: string) => {
    if (!confirm("Deactivate this plan?")) return;
    try {
      await api(`/subscriptions/plans/${planId}`, { method: "DELETE" });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Subscription CRUD
  const handleCreateSub = async () => {
    try {
      await api("/subscriptions", { method: "POST", body: subForm });
      setShowSubModal(false);
      setSubForm({ plan_id: "", company_id: "", supplier_id: "", start_date: "", end_date: "", notes: "" });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateStatus = async (subId: string, status: string) => {
    try {
      await api(`/subscriptions/${subId}/status`, { method: "PUT", body: { status } });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRenew = async () => {
    if (!selectedSub) return;
    try {
      await api(`/subscriptions/${selectedSub.id}/renew`, { method: "POST", body: { notes: renewalNotes } });
      setShowRenewModal(false);
      setSelectedSub(null);
      setRenewalNotes("");
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAutoExpire = async () => {
    try {
      const result = await api<{ expiredCount: number }>("/subscriptions/auto-expire", { method: "POST" });
      alert(`Expired ${result.expiredCount} subscriptions`);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Payment recording
  const handleRecordPayment = async () => {
    if (!selectedSub) return;
    try {
      await api(`/subscriptions/${selectedSub.id}/payments`, { method: "POST", body: paymentForm });
      setShowPaymentModal(false);
      setSelectedSub(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-field-900">📋 Subscriptions & Billing</h1>
          {expiringCount > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-600">⚠️</span>
                <p className="text-sm text-amber-800">
                  <strong>{expiringCount}</strong> subscription{expiringCount !== 1 ? 's' : ''} expiring within 7 days
                </p>
                <button
                  onClick={handleAutoExpire}
                  className="ml-auto rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700"
                >
                  Auto-Expire
                </button>
              </div>
            </div>
          )}
          <p className="mt-1 text-sm text-field-500">Manage subscription plans, active subscriptions, and payments</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Active" value={stats.active} tone="green" icon="✅" />
          <StatCard label="Expired" value={stats.expired} tone="red" icon="⏰" />
          <StatCard label="Pending" value={stats.pending} tone="amber" icon="⏳" />
          <StatCard label="Revenue" value={formatMoney(stats.totalRevenue)} tone="blue" icon="💰" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-field-200 pb-2">
        {(["plans", "subscriptions", "payments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-onion-600 text-white"
                : "text-field-600 hover:bg-field-50"
            }`}
          >
            {t === "plans" ? "📦 Plans" : t === "subscriptions" ? "🔗 Subscriptions" : "💳 Payments"}
          </button>
        ))}
      </div>

      {/* Plans Tab */}
      {tab === "plans" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingPlan(null); setShowPlanModal(true); }}>
              + Add Plan
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-field-900">{plan.name}</h3>
                      <p className="text-sm text-field-500">{plan.type} Plan • {cycleLabel(plan.billing_cycle)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${plan.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-onion-700">{formatMoney(plan.price)}</span>
                    <span className="text-sm text-field-500">/{cycleLabel(plan.billing_cycle)}</span>
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-sm text-field-600">{plan.description}</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingPlan(plan);
                        setPlanForm({
                          name: plan.name,
                          type: plan.type,
                          price: plan.price,
                          billing_cycle: plan.billing_cycle,
                          description: plan.description || "",
                        });
                        setShowPlanModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    {plan.is_active && (
                      <Button
                        variant="secondary"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDeactivatePlan(plan.id)}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {tab === "subscriptions" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowSubModal(true)}>+ Add Subscription</Button>
          </div>
          {subscriptions.length === 0 ? (
            <EmptyState title="No subscriptions yet" hint="Create a plan and add subscriptions" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-field-200 bg-white">
              <table className="min-w-full divide-y divide-field-200">
                <thead>
                  <tr className="bg-field-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-field-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-field-100">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-field-50/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-field-800">
                          {sub.company_name || sub.supplier_name || "—"}
                        </p>
                        <p className="text-xs text-field-500">{sub.plan_type}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-field-700">{sub.plan_name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-field-800">{formatMoney(sub.plan_price)}</td>
                      <td className="px-4 py-3 text-sm text-field-600">
                        {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {sub.status !== "ACTIVE" && (
                            <button
                              onClick={() => handleUpdateStatus(sub.id, "ACTIVE")}
                              className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                            >
                              Activate
                            </button>
                          )}
                          {sub.status === "ACTIVE" && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(sub.id, "EXPIRED")}
                                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                Expire
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedSub(sub);
                                  setPaymentForm({
                                    amount: sub.plan_price,
                                    payment_date: new Date().toISOString().split("T")[0],
                                    payment_method: "CASH",
                                    reference_number: "",
                                    notes: "",
                                  });
                                  setShowPaymentModal(true);
                                }}
                                className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              >
                                Record Payment
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {tab === "payments" && (
        <div className="space-y-4">
          {subscriptions.length === 0 ? (
            <EmptyState title="No subscriptions to show payments" hint="Add subscriptions first" />
          ) : (
            <div className="grid gap-4">
              {subscriptions.map((sub) => (
                <SubscriptionPayments key={sub.id} subscription={sub} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plan Modal */}
      <Modal open={showPlanModal} onClose={() => { setShowPlanModal(false); setEditingPlan(null); }} title="Plan">
        <div className="p-6">
          <h2 className="text-lg font-bold text-field-900">{editingPlan ? "Edit Plan" : "Add Plan"}</h2>
          <div className="mt-4 space-y-4">
            <Field label="Plan Name">
              <Input
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="e.g., Company Monthly"
              />
            </Field>
            <Field label="Type">
              <Select
                value={planForm.type}
                onChange={(e) => setPlanForm({ ...planForm, type: e.target.value as "COMPANY" | "SUPPLIER" })}
              >
                <option value="COMPANY">Company</option>
                <option value="SUPPLIER">Supplier</option>
              </Select>
            </Field>
            <Field label="Price (₹)">
              <Input
                type="number"
                value={planForm.price}
                onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
              />
            </Field>
            <Field label="Billing Cycle">
              <Select
                value={planForm.billing_cycle}
                onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly (3 months)</option>
                <option value="half-yearly">Half-Yearly (6 months)</option>
                <option value="yearly">Yearly (12 months)</option>
              </Select>
            </Field>
            <Field label="Description">
              <Input
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                placeholder="Optional description"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowPlanModal(false); setEditingPlan(null); }}>
                Cancel
              </Button>
              <Button onClick={editingPlan ? handleUpdatePlan : handleCreatePlan}>
                {editingPlan ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Subscription Modal */}
      <Modal open={showSubModal} onClose={() => setShowSubModal(false)} title="Add Subscription">
        <div className="p-6">
          <h2 className="text-lg font-bold text-field-900">Add Subscription</h2>
          <div className="mt-4 space-y-4">
            <Field label="Plan">
              <Select
                value={subForm.plan_id}
                onChange={(e) => setSubForm({ ...subForm, plan_id: e.target.value })}
              >
                <option value="">Select plan...</option>
                {plans.filter((p) => p.is_active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type}) — {formatMoney(p.price)}/{p.billing_cycle}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Company (for Company plans)">
              <Select
                value={subForm.company_id}
                onChange={(e) => setSubForm({ ...subForm, company_id: e.target.value })}
              >
                <option value="">Select company...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier (for Supplier plans)">
              <Select
                value={subForm.supplier_id}
                onChange={(e) => setSubForm({ ...subForm, supplier_id: e.target.value })}
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date">
                <Input
                  type="date"
                  value={subForm.start_date}
                  onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })}
                />
              </Field>
              <Field label="End Date">
                <Input
                  type="date"
                  value={subForm.end_date}
                  onChange={(e) => setSubForm({ ...subForm, end_date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Input
                value={subForm.notes}
                onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSubModal(false)}>Cancel</Button>
              <Button onClick={handleCreateSub}>Create</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={showPaymentModal} onClose={() => { setShowPaymentModal(false); setSelectedSub(null); }} title="Record Payment">
        <div className="p-6">
          <h2 className="text-lg font-bold text-field-900">Record Payment</h2>
          {selectedSub && (
            <p className="mt-1 text-sm text-field-500">
              {selectedSub.company_name || selectedSub.supplier_name} — {selectedSub.plan_name}
            </p>
          )}
          <div className="mt-4 space-y-4">
            <Field label="Amount (₹)">
              <Input
                type="number"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Payment Date">
              <Input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
            </Field>
            <Field label="Payment Method">
              <Select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="UPI">UPI</option>
              </Select>
            </Field>
            <Field label="Reference Number">
              <Input
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                placeholder="Optional reference"
              />
            </Field>
            <Field label="Notes">
              <Input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowPaymentModal(false); setSelectedSub(null); }}>
                Cancel
              </Button>
              <Button onClick={handleRecordPayment}>Record Payment</Button>
            </div>
          </div>
        </div>
      </Modal>
      {/* Renew Modal */}
      <Modal open={showRenewModal} onClose={() => { setShowRenewModal(false); setSelectedSub(null); }} title="Renew Subscription">
        <div className="p-6">
          {selectedSub && (
            <p className="mb-4 text-sm text-field-600">
              Renewing: {selectedSub.company_name || selectedSub.supplier_name} — {selectedSub.plan_name}
            </p>
          )}
          <div className="space-y-4">
            <Field label="Renewal Notes">
              <Input
                value={renewalNotes}
                onChange={(e) => setRenewalNotes(e.target.value)}
                placeholder="Optional notes for this renewal"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowRenewModal(false); setSelectedSub(null); }}>
                Cancel
              </Button>
              <Button onClick={handleRenew} className="bg-green-600 hover:bg-green-700">
                Renew Subscription
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Subscription Payments List
// ---------------------------------------------------------------------------

function SubscriptionPayments({ subscription }: { subscription: Subscription }) {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ payments: SubscriptionPayment[] }>(`/subscriptions/${subscription.id}/payments`)
      .then((r) => setPayments(r.payments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subscription.id]);

  if (loading) return <Spinner className="h-4 w-4" />;

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-field-800">
            {subscription.company_name || subscription.supplier_name}
          </h3>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(subscription.status)}`}>
            {subscription.status}
          </span>
        </div>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-field-500">No payments recorded yet</p>
        ) : (
          <div className="mt-3 space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-field-50 p-3">
                <div>
                  <p className="text-sm font-medium text-field-800">{formatMoney(p.amount)}</p>
                  <p className="text-xs text-field-500">{formatDate(p.payment_date)} • {p.payment_method}</p>
                </div>
                {p.reference_number && (
                  <span className="text-xs text-field-400">#{p.reference_number}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
