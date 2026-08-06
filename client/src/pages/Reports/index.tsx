import { useCallback, useEffect, useState } from "react";
import { api, downloadReport, getAccessToken } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import { Card, Spinner } from "../../components/ui";
import { REPORT_DEFS } from "./defs";
import type { Report, ReportMeta } from "./types";
import ReportView from "./ReportView";

// ---------------------------------------------------------------------------
// Reports & Ledgers — main page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [types, setTypes] = useState<string[]>([]);
  const [activeType, setActiveType] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facLoading, setFacLoading] = useState(false);
  const [supLoading, setSupLoading] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Facilities + suppliers for filter dropdowns
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  // Fetch available report types for the current role
  useEffect(() => {
    api<ReportMeta>("/reports/meta/types")
      .then((r) => {
        setTypes(r.types);
        if (r.types.length > 0) setActiveType(r.types[0]);
      })
      .catch(() => {
        setTypes([]);
        setError(t("Failed to load report types"));
      });
  }, []);

  // Fetch facilities & suppliers for filters
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    setFacLoading(true);
    fetch("/api/facility", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: any) => setFacilities(d?.facilities || []))
      .catch(() => {})
      .finally(() => setFacLoading(false));
    setSupLoading(true);
    fetch("/api/supplier", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: any) => setSuppliers(d?.suppliers || []))
      .catch(() => {})
      .finally(() => setSupLoading(false));
  }, []);

  // Fetch report data when type or filters change
  const fetchReport = useCallback(async () => {
    if (!activeType) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (facilityId) params.set("facilityId", facilityId);
      if (supplierId) params.set("supplierId", supplierId);
      const qs = params.toString();
      const data = await api<Report>(`/reports/${activeType}${qs ? "?" + qs : ""}`);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || t("Failed to load report"));
    } finally {
      setLoading(false);
    }
  }, [activeType, dateFrom, dateTo, facilityId, supplierId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleDownload = async (format: "excel" | "pdf") => {
    try {
      const filters: Record<string, string> = {};
      if (dateFrom) filters.from = dateFrom;
      if (dateTo) filters.to = dateTo;
      if (facilityId) filters.facilityId = facilityId;
      if (supplierId) filters.supplierId = supplierId;
      await downloadReport(activeType, format, filters);
    } catch (err: any) {
      setError(err?.message || t("Download failed"));
    }
  };

  // Filter rows by search query
  const filteredRows = report?.rows.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return Object.values(row).some(
      (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-field-900">
            📊 {t("Reports & Ledgers")}
          </h1>
          <p className="mt-1 text-sm text-field-500">
            {t("Detailed financial records — download as PDF or Excel")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownload("excel")}
            disabled={!activeType || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {t("Excel")}
          </button>
          <button
            onClick={() => handleDownload("pdf")}
            disabled={!activeType || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {t("PDF")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Report type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {types.map((type) => {
          const def = REPORT_DEFS[type] || { label: type, icon: "📄", description: "" };
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                activeType === type
                  ? "bg-onion-600 text-white shadow-sm"
                  : "bg-white text-field-600 ring-1 ring-field-200 hover:bg-field-50"
              }`}
            >
              <span>{def.icon}</span>
              <span>{def.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-field-500">{t("From Date")}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-field-200 px-3 py-2 text-sm focus:border-onion-500 focus:outline-none focus:ring-1 focus:ring-onion-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-field-500">{t("To Date")}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-field-200 px-3 py-2 text-sm focus:border-onion-500 focus:outline-none focus:ring-1 focus:ring-onion-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-field-500">{t("Facility")}</label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="w-full rounded-lg border border-field-200 px-3 py-2 text-sm focus:border-onion-500 focus:outline-none focus:ring-1 focus:ring-onion-500"
            >
              <option value="">{facLoading ? t("Loading...") : t("All Facilities")}</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-field-500">{t("Supplier")}</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-lg border border-field-200 px-3 py-2 text-sm focus:border-onion-500 focus:outline-none focus:ring-1 focus:ring-onion-500"
            >
              <option value="">{supLoading ? t("Loading...") : t("All Suppliers")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-field-500">{t("Search")}</label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-field-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder={t("Search in results...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-field-200 py-2 pl-9 pr-3 text-sm focus:border-onion-500 focus:outline-none focus:ring-1 focus:ring-onion-500"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Report content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      ) : report ? (
        <ReportView report={report} rows={filteredRows ?? []} />
      ) : null}
    </div>
  );
}
