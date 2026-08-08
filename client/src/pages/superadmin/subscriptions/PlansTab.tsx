import { useI18n } from "../../../i18n";
import { Button, Card } from "../../../components/ui";
import { cycleLabel, formatMoney } from "./helpers";
import type { SubscriptionPlan } from "./types";

interface Props {
  plans: SubscriptionPlan[];
  onAdd: () => void;
  onEdit: (plan: SubscriptionPlan) => void;
  onDeactivate: (planId: string) => void;
}

export default function PlansTab({ plans, onAdd, onEdit, onDeactivate }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Add Plan</Button>
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
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    plan.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {plan.is_active ? t("Active") : t("Inactive")}
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold text-onion-700">{formatMoney(plan.price)}</span>
                <span className="text-sm text-field-500">/{cycleLabel(plan.billing_cycle)}</span>
              </div>
              {plan.description && <p className="mt-2 text-sm text-field-600">{plan.description}</p>}
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => onEdit(plan)}>
                  {t("Edit")}
                </Button>
                {plan.is_active && (
                  <Button
                    variant="secondary"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => onDeactivate(plan.id)}
                  >
                    {t("Deactivate")}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
