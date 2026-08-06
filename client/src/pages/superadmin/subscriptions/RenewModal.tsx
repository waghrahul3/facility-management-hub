import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal } from "../../../components/ui";
import type { Subscription } from "./types";

interface Props {
  open: boolean;
  subscription: Subscription | null;
  onClose: () => void;
  onRenew: (notes: string) => void | Promise<void>;
}

export default function RenewModal({ open, subscription, onClose, onRenew }: Props) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  const close = () => {
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={t("Renew Subscription")}>
      <div className="p-6">
        {subscription && (
          <p className="mb-4 text-sm text-field-600">
            Renewing: {subscription.company_name || subscription.supplier_name} — {subscription.plan_name}
          </p>
        )}
        <div className="space-y-4">
          <Field label="Renewal Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this renewal"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => onRenew(notes)} className="bg-green-600 hover:bg-green-700">
              Renew Subscription
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
