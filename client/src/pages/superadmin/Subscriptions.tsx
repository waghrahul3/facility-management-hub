import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import { Button, Card, EmptyState, Modal, Spinner, StatCard } from "../../components/ui";
import ExportButtons from "../../components/ExportButtons";
import PlanModal from "./subscriptions/PlanModal";
import SubscriptionModal from "./subscriptions/SubscriptionModal";
import PaymentModal from "./subscriptions/PaymentModal";
import RenewModal from "./subscriptions/RenewModal";
import SubscriptionPayments from "./subscriptions/SubscriptionPayments";
import { cycleLabel, formatDate, formatMoney, statusColor } from "./subscriptions/helpers";
import type { EntityOption, Subscription, SubscriptionPlan, SubscriptionStats } from "./subscriptions/types";

export default function SubscriptionsPage() {
  const { t } = useI18n();
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
  const [expiringCount, setExpiringCount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);

  // Entity lists
  const [companies, setCompanies] = useState<EntityOption[]>([]);
  const [suppliers, setSuppliers] = useState<EntityOption[]>([]);

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
      void api<{ expiring: unknown[] }>("/subscriptions/alerts/expiring?days=7").then((r) =>
        setExpiringCount(r.expiring.length)
      );
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
  const handleCreatePlan = async (values: Parameters<Parameters<typeof PlanModal>[0]["onSave"]>[0]) => {
    try {
      await api("/subscriptions/plans", { method: "POST", body: values });
      setShowPlanModal(false);
      setEditingPlan(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdatePlan = async (values: Parameters<Parameters<typeof PlanModal>[0]["onSave"]>[0]) => {
    if (!editingPlan) return;
    try {
      await api(`/subscriptions/plans/${editingPlan.id}`, { method: "PUT", body: values });
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
  const handleCreateSub = async (values: Parameters<Parameters<typeof SubscriptionModal>[0]["onSave"]>[0]) => {
    try {
      await api("/subscriptions", { method: "POST", body: values });
      setShowSubModal(false);
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

  const handleRenew = async (notes: string) => {
    if (!selectedSub) return;
    try {
      await api(`/subscriptions/${selectedSub.id}/renew`, { method: "POST", body: { notes } });
      setShowRenewModal(false);
      setSelectedSub(null);
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
  const handleRecordPayment = async (values: Parameters<Parameters<typeof PaymentModal>[0]["onSave"]>[0]) => {
    if (!selectedSub) return;
    try {
      await api(`/subscriptions/${selectedSub.id}/payments`, { method: "POST", body: values });
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
          <h1 className="font-display text-2xl font-bold text-field-900">📋 {t("Subscriptions & Billing")}</h1>
          {expiringCount > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-600">⚠️</span>
                <p className="text-sm text-amber-800">
                  <strong>{expiringCount}</strong> {t("subscriptions expiring within 7 days")}
                </p>
                <button
                  onClick={handleAutoExpire}
                  className="ml-auto rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700"
                >
                  {t("Auto-Expire")}
                </button>
              </div>
            </div>
          )}
          <p className="mt-1 text-sm text-field-500">{t("Manage subscription plans, active subscriptions, and payments")}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <ExportButtons reportType="subscription-earnings" />
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("Active")} value={stats.active} tone="green" icon="✅" />
          <StatCard label={t("Expired")} value={stats.expired} tone="red" icon="⏰" />
          <StatCard label={t("Pending")} value={stats.pending} tone="amber" icon="⏳" />
          <StatCard label={t("Revenue")} value={formatMoney(stats.totalRevenue)} tone="blue" icon="💰" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-field-200 pb-2">
        {(["plans", "subscriptions", "payments"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === tabKey
                ? "bg-onion-600 text-white"
                : "text-field-600 hover:bg-field-50"
            }`}
          >
            {tabKey === "plans" ? "📦 " + t("Plans") : tabKey === "subscriptions" ? "🔗 " + t("Subscriptions") : "💳 " + t("Payments")}
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
            <EmptyState title={t("No subscriptions yet")} hint={t("Create a plan and add subscriptions")} />
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
                                  setShowPaymentModal(true);
                                }}
                                className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              >
                                Record Payment
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedSub(sub);
                                  setShowRenewModal(true);
                                }}
                                className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                              >
                                Renew
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
            <EmptyState title={t("No subscriptions to show payments")} hint={t("Add subscriptions first")} />
          ) : (
            <div className="grid gap-4">
              {subscriptions.map((sub) => (
                <SubscriptionPayments key={sub.id} subscription={sub} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <PlanModal
        open={showPlanModal}
        plan={editingPlan}
        onClose={() => { setShowPlanModal(false); setEditingPlan(null); }}
        onSave={editingPlan ? handleUpdatePlan : handleCreatePlan}
      />
      <SubscriptionModal
        open={showSubModal}
        plans={plans}
        companies={companies}
        suppliers={suppliers}
        onClose={() => setShowSubModal(false)}
        onSave={handleCreateSub}
      />
      <PaymentModal
        open={showPaymentModal}
        subscription={selectedSub}
        onClose={() => { setShowPaymentModal(false); setSelectedSub(null); }}
        onSave={handleRecordPayment}
      />
      <RenewModal
        open={showRenewModal}
        subscription={selectedSub}
        onClose={() => { setShowRenewModal(false); setSelectedSub(null); }}
        onRenew={handleRenew}
      />
    </div>
  );
}
