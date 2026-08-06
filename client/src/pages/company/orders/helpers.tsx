import type { ReactElement } from "react";
import { StatusBadge } from "../../../components/ui";

export const vehicleTypes = ["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"];

export function vehicleLabel(v: string, tr: (s: string) => string): string {
  switch (v) {
    case "TRUCK": return "🚛 " + tr("Truck");
    case "CONTAINER": return "🚢 " + tr("Container");
    case "TRACTOR": return "🚜 " + tr("Tractor");
    case "TEMPO": return "🛺 " + tr("Tempo");
    default: return "🚚 " + tr("Other");
  }
}

export function statusBadge(status: string): ReactElement {
  return <StatusBadge status={status} />;
}
