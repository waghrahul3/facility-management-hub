export function vehicleLabel(v: string, tr: (s: string) => string): string {
  switch (v) {
    case "TRUCK":
      return "🚛 " + tr("Truck");
    case "CONTAINER":
      return "🚢 " + tr("Container");
    case "TRACTOR":
      return "🚜 " + tr("Tractor");
    case "TEMPO":
      return "🛺 " + tr("Tempo");
    default:
      return "🚚 " + tr("Other");
  }
}
