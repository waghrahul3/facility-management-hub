export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function cycleLabel(cycle: string): string {
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

export function statusColor(status: string): string {
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
