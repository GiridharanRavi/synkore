// @ts-nocheck
// frontend/src/pages/admin/FabricPurchaseOrders.tsx
//
// Plan-link autofill chain:
//   Selecting an Order Plan No auto-fills:
//     • purchase_qty  (header field)
//     • items[0].sort_no       ← from plan.order_sort_no
//     • items[0].construction  ← from plan.constn_for_production
//     • items[0].qty           ← from plan.purchase_qty
//     • remarks                ← descriptive default (editable)
//   All autofilled fields remain editable after selection.
//
// Pending-purchase endpoint is now on the FPO router:
//   GET /api/fabric-purchase-orders/pending-purchase
//
// DIAGNOSTIC ADDITION (June 2026):
//   loadPendingPlans() now distinguishes two failure modes that look
//   identical in the UI but have completely different causes:
//     1. The HTTP request itself failed (wrong URL / 404 / 401 / 500)
//        → shown as a red banner with the exact status + server message.
//     2. The request SUCCEEDED but returned an empty array
//        → shown as an amber banner — this means the backend and DB
//          connection are fine, but no row in production_plans currently
//          satisfies "purchase_qty > 0 AND not yet linked to an FPO" in
//          the *database the API server is actually connected to* (which
//          can silently differ from the one you're viewing in Workbench).
//   This makes the empty "Order Plan No" dropdown self-diagnosing —
//   no DevTools Network tab needed to tell the two cases apart.

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Plus, Search, X, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, Info,
  AlertTriangle, Trash2, PlusCircle, Check,
  Printer, Download, FileSpreadsheet, FileText,
} from "lucide-react";

import {
  getFabricPurchaseOrders,
  getFabricPurchaseOrderById,
  createFabricPurchaseOrder,
  updateFabricPurchaseOrder,
  deleteFabricPurchaseOrder,
  getSuppliers,
  getNextFpoNo,
  getPendingPurchasePlans,
  getHsnCodes,
  FabricPurchaseOrderPayload,
  FpoItem,
} from "../../api/services";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: number;
  name: string;
  supplier_code?: string;
  city?: string;
}

interface PendingPlan {
  id: number;
  rec_no: string;
  rec_date?: string;
  order_type: string;
  order_no: string;
  customer_name?: string;
  order_sort_no?: string;
  constn_for_production?: string;
  purchase_qty: number | string;
  purchase_special_instruction?: string;
}

interface HsnEntry {
  code: string;
  description: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: "#f0fdf4", border: "#86efac", color: "#166534", icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: "#fef2f2", border: "#fca5a5", color: "#991b1b", icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e", icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: "#eff6ff", border: "#93c5fd", color: "#1e40af", icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360, pointerEvents: "none" }}>
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", pointerEvents: "all", fontFamily: "'DM Sans',sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: "2px 0 0", fontSize: 12, color: c.color, opacity: 0.8 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.color, opacity: 0.6 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Field Type Badge ─────────────────────────────────────────────────────────

const FT_CFG: Record<string, { label: string; bg: string; color: string }> = {
  lookup:   { label: "Lookup",   bg: "#ede9fe", color: "#6d28d9" },
  autofill: { label: "Autofill", bg: "#e0f2fe", color: "#0369a1" },
  computed: { label: "Computed", bg: "#fef9c3", color: "#92400e" },
  locked:   { label: "Locked",   bg: "#f1f5f9", color: "#475569" },
  select:   { label: "Select",   bg: "#f0fdf4", color: "#166534" },
  date:     { label: "Date",     bg: "#fff7ed", color: "#c2410c" },
  text:     { label: "Text",     bg: "#f8fafc", color: "#475569" },
  number:   { label: "Number",   bg: "#fdf4ff", color: "#86198f" },
};

function FTypeBadge({ type }: { type: string }) {
  const c = FT_CFG[type];
  if (!c) return null;
  return (
    <span style={{
      display: "inline-block", fontSize: 9, fontWeight: 700, padding: "1px 6px",
      borderRadius: 20, background: c.bg, color: c.color,
      letterSpacing: "0.04em", textTransform: "uppercase", marginLeft: 5, verticalAlign: "middle",
    }}>{c.label}</span>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

const FPO_EXPORT_COLUMNS = [
  { key: "fpo_no",        label: "FPO No" },
  { key: "fpo_date",      label: "FPO Date" },
  { key: "supplier",      label: "Supplier" },
  { key: "plan_rec_no",   label: "Plan No" },
  { key: "order_no",      label: "Order No" },
  { key: "purchase_qty",  label: "Purchase Qty" },
  { key: "billing_from",  label: "Billing From" },
  { key: "delivery_to",   label: "Delivery To" },
  { key: "pay_terms",     label: "Pay Terms" },
  { key: "rate_type",     label: "Rate Type" },
  { key: "freight",       label: "Freight" },
  { key: "delivery_dt",   label: "Delivery Date" },
  { key: "sub_total",     label: "Sub Total (₹)" },
  { key: "cgst_pct",      label: "CGST %" },
  { key: "sgst_pct",      label: "SGST %" },
  { key: "igst_pct",      label: "IGST %" },
  { key: "net_value",     label: "Net Value (₹)" },
  { key: "remarks",       label: "Remarks" },
];

function doExportCSV(data: FabricPurchaseOrderPayload[]) {
  const header = FPO_EXPORT_COLUMNS.map(c => c.label).join(",");
  const rows = data.map(row =>
    FPO_EXPORT_COLUMNS.map(c => {
      const val = String((row as any)[c.key] ?? "").replace(/"/g, '""');
      return `"${val}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FPO_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function doExportExcel(data: FabricPurchaseOrderPayload[]) {
  const cols = FPO_EXPORT_COLUMNS;
  const headerRow = cols.map(c =>
    `<th style="background:#7c3aed;color:#fff;padding:8px 10px;font-weight:bold;">${c.label}</th>`
  ).join("");
  const bodyRows = data.map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#faf5ff"}">` +
    cols.map(c => `<td style="padding:7px 10px;border:1px solid #e2e8f0;">${(row as any)[c.key] ?? ""}</td>`).join("") +
    "</tr>"
  ).join("");
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"/></head>
    <body>
      <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </body>
    </html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FPO_Export_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function doPrintTable(data: FabricPurchaseOrderPayload[], fmtDate: (v?: string | null) => string, fmt: (n: number) => string) {
  const cols = FPO_EXPORT_COLUMNS.slice(0, 11);
  const headerRow = cols.map(c => `<th>${c.label}</th>`).join("");
  const bodyRows = data.map((row, i) =>
    `<tr class="${i % 2 === 0 ? "" : "alt"}">` +
    cols.map(c => `<td>${(row as any)[c.key] ?? "—"}</td>`).join("") +
    `</tr>`
  ).join("");
  const win = window.open("", "_blank", "width=1100,height=700");
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html><html>
    <head>
      <title>Fabric Purchase Orders — Print</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1e293b;margin:0;padding:20px}
        h2{font-size:16px;color:#5b21b6;margin-bottom:4px}
        p{font-size:11px;color:#64748b;margin:0 0 14px}
        table{width:100%;border-collapse:collapse}
        th{background:#7c3aed;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
        td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
        tr.alt td{background:#faf5ff}
        @media print{body{padding:10px}}
      </style>
    </head>
    <body>
      <h2>Fabric Purchase Orders</h2>
      <p>Printed on ${new Date().toLocaleString()} — ${data.length} record(s)</p>
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>
  `);
  win.document.close();
}

// ─── Export Dropdown Menu ─────────────────────────────────────────────────────

function ExportMenu({ onCSV, onExcel, onPrint }: { onCSV: () => void; onExcel: () => void; onPrint: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} className="fpo-export-menu-btn" title="Export / Print">
        <Download size={14} />
        Export
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", zIndex: 9100, minWidth: 180, overflow: "hidden" }}>
          <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9", background: "#fafbfc" }}>
            Export / Print
          </div>
          {[
            { icon: <FileText size={14} color="#0369a1" />,       label: "Export as CSV",   action: () => { onCSV();   setOpen(false); }, color: "#0369a1" },
            { icon: <FileSpreadsheet size={14} color="#166534" />, label: "Export as Excel", action: () => { onExcel(); setOpen(false); }, color: "#166534" },
            { icon: <Printer size={14} color="#7c3aed" />,         label: "Print Table",     action: () => { onPrint(); setOpen(false); }, color: "#7c3aed" },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "#374151", fontFamily: "'DM Sans',sans-serif", textAlign: "left", fontWeight: 500 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; (e.currentTarget as HTMLElement).style.color = item.color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

const fmtDate = (raw?: string | null): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return "";
  if (s.includes("T") || s.endsWith("Z")) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  const parts = s.slice(0, 10).split("-");
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}`;
  }
  return s;
};

// ─── Factories ────────────────────────────────────────────────────────────────

const emptyItem = (): FpoItem => ({
  sort_no: "", construction: "", hsn_code: "", qty: 0, rate: 0, basic_value: 0,
});

const defaultForm = (): FabricPurchaseOrderPayload => ({
  fpo_no: "", fpo_date: today(), supplier: "", billing_from: "",
  delivery_to: "", pay_terms: "", pinning: "", packing_type: "",
  rate_type: "", freight: "", delivery_dt: today(), remarks: "",
  cgst_pct: 0, sgst_pct: 0, igst_pct: 0,
  sub_total: 0, cgst_amt: 0, sgst_amt: 0, igst_amt: 0, net_value: 0,
  items: [emptyItem()],
  plan_id: null,
  plan_rec_no: "",
  order_no: "",
  purchase_qty: 0,
});

// ─── Width hook ───────────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const sLabel: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#64748b",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
};

function FField({
  label, type, required, hint, children,
}: {
  label: string; type?: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={sLabel}>
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
        {type && <FTypeBadge type={type} />}
      </label>
      {children}
      {hint && <p className="fpo-hint">{hint}</p>}
    </div>
  );
}

function SectionHead({
  title, open, onToggle, accent,
}: {
  title: string; open: boolean; onToggle: () => void; accent?: string;
}) {
  return (
    <div
      className="fpo-section-head"
      style={{ borderLeft: `4px solid ${accent ?? "#7c3aed"}` }}
      onClick={onToggle}
    >
      <span className="fpo-section-title">{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

function GstRow({
  label, pct, amount, onPctChange,
}: {
  label: string; pct: number; amount: number; onPctChange: (v: number) => void;
}) {
  return (
    <div className="fpo-gst-row">
      <span className="fpo-gst-label">{label}</span>
      <input
        className="fpo-gst-input"
        type="number" min={0} max={100} step="0.01"
        value={pct || ""}
        onChange={e => onPctChange(parseFloat(e.target.value) || 0)}
      />
      <span className="fpo-gst-pct">%</span>
      <span className="fpo-gst-amt">₹{fmt(amount)}</span>
    </div>
  );
}

// ─── Supplier Dropdown ────────────────────────────────────────────────────────

interface SupplierDropdownProps {
  value: string;
  onChange: (name: string) => void;
  suppliers: Supplier[];
}
function SupplierDropdown({ value, onChange, suppliers }: SupplierDropdownProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef           = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const q = query.toLowerCase();
  const filtered = suppliers.filter(s =>
    (s.name ?? "").toLowerCase().includes(q) ||
    (s.supplier_code ?? "").toLowerCase().includes(q)
  );

  const highlight = (text: string) => {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <>{text}</>;
    return <>
      {text.slice(0, idx)}
      <strong style={{ color: "#7c3aed" }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>;
  };

  return (
    <div className="fpo-sup-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fpo-sup-trigger${open ? " open" : ""}${value ? " has-value" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="fpo-sup-content">
          {value
            ? <span className="fpo-sup-selected"><span className="fpo-sup-badge">{value}</span></span>
            : <span className="fpo-sup-placeholder">Type to search supplier…</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {value && (
            <span className="fpo-sup-clear" onClick={e => { e.stopPropagation(); onChange(""); setQuery(""); }} title="Clear supplier">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: "#64748b", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </span>
      </button>

      {open && (
        <div className="fpo-sup-panel">
          <div className="fpo-sup-search-wrap">
            <Search size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
            <input ref={inputRef} className="fpo-sup-search" placeholder="Search supplier name or code…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && (
              <button type="button" onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex", alignItems: "center" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <div className="fpo-sup-count">
            {filtered.length === 0
              ? <span style={{ color: "#c2410c" }}>No suppliers match "{query}"</span>
              : <span>{filtered.length} supplier{filtered.length !== 1 ? "s" : ""} found</span>}
          </div>
          <div className="fpo-sup-list">
            {value && (
              <div className="fpo-sup-option fpo-sup-clear-opt" onClick={() => { onChange(""); setOpen(false); setQuery(""); }}>
                — Clear selection —
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="fpo-sup-empty">
                <Search size={28} color="#cbd5e1" />
                <span>No suppliers found</span>
              </div>
            ) : filtered.map(s => (
              <div key={s.id} className={`fpo-sup-option${s.name === value ? " selected" : ""}`}
                onClick={() => { onChange(s.name); setOpen(false); setQuery(""); }}>
                <div className="fpo-sup-opt-left">
                  <span className="fpo-sup-opt-name">{highlight(s.name)}</span>
                </div>
                <div className="fpo-sup-opt-meta">
                  {s.supplier_code && <span className="fpo-sup-code">{s.supplier_code}</span>}
                  {s.city && <span className="fpo-sup-city">{s.city}</span>}
                </div>
                {s.name === value && <Check size={14} style={{ color: "#7c3aed", flexShrink: 0, marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {!open && value && (
        <p className="fpo-sup-status">
          <Check size={11} style={{ marginRight: 3 }} />
          {value} selected
        </p>
      )}
    </div>
  );
}

// ─── Plan Picker Dropdown ─────────────────────────────────────────────────────

interface PlanDropdownProps {
  value: number | null;
  planRecNo: string;
  onChange: (plan: PendingPlan | null) => void;
  plans: PendingPlan[];
  loading: boolean;
}
function PlanDropdown({ value, planRecNo, onChange, plans, loading }: PlanDropdownProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef           = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const q = query.toLowerCase();
  const filtered = plans.filter(p =>
    p.rec_no.toLowerCase().includes(q) ||
    p.order_no.toLowerCase().includes(q) ||
    (p.customer_name ?? "").toLowerCase().includes(q) ||
    (p.constn_for_production ?? "").toLowerCase().includes(q) ||
    (p.order_sort_no ?? "").toLowerCase().includes(q)
  );

  // Find selected plan for preview
  const selectedPlan = value ? plans.find(p => p.id === value) : null;

  return (
    <div className="fpo-sup-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fpo-sup-trigger${open ? " open" : ""}${value ? " has-value" : ""}`}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
      >
        <span className="fpo-sup-content">
          {loading ? (
            <span className="fpo-sup-placeholder" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading plans…
            </span>
          ) : value && planRecNo ? (
            <span className="fpo-sup-selected">
              <span className="fpo-plan-badge">{planRecNo}</span>
            </span>
          ) : (
            <span className="fpo-sup-placeholder">Search Plan No, Order No, Customer, Sort No…</span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {value && !loading && (
            <span className="fpo-sup-clear" onClick={e => { e.stopPropagation(); onChange(null); setQuery(""); }} title="Unlink plan">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} style={{ color: "#64748b", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </span>
      </button>

     
     

      {open && (
        <div className="fpo-sup-panel">
          <div className="fpo-sup-search-wrap">
            <Search size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
            <input ref={inputRef} className="fpo-sup-search" placeholder="Search plan no, order no, customer, sort no…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && (
              <button type="button" onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex", alignItems: "center" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <div className="fpo-sup-count">
            {filtered.length === 0
              ? plans.length === 0
                ? <span style={{ color: "#f59e0b" }}>No pending purchase plans</span>
                : <span style={{ color: "#c2410c" }}>No match for "{query}"</span>
              : <span>{filtered.length} plan{filtered.length !== 1 ? "s" : ""} pending purchase</span>}
          </div>
          <div className="fpo-sup-list">
            {value && (
              <div className="fpo-sup-option fpo-sup-clear-opt" onClick={() => { onChange(null); setOpen(false); setQuery(""); }}>
                — Clear selection —
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="fpo-sup-empty">
                <Search size={28} color="#cbd5e1" />
                <span>No plans found</span>
              </div>
            ) : filtered.map(p => (
              <div key={p.id} className={`fpo-sup-option fpo-plan-option${value === p.id ? " selected" : ""}`}
                onClick={() => { onChange(p); setOpen(false); setQuery(""); }}>
                {/* Row 1: Plan No + Order No */}
                <div className="fpo-plan-opt-row1">
                  <span className="fpo-plan-opt-no">{p.rec_no}</span>
                  {p.order_no && <span className="fpo-plan-opt-order">Order: {p.order_no}</span>}
                  {value === p.id && <Check size={14} style={{ color: "#0f766e", flexShrink: 0, marginLeft: "auto" }} />}
                </div>
                {/* Row 2: Autofill preview chips */}
                <div className="fpo-plan-opt-chips">
                  {p.order_sort_no && (
                    <span className="fpo-plan-chip fpo-plan-chip--sort">Sort: {p.order_sort_no}</span>
                  )}
                  {p.constn_for_production && (
                    <span className="fpo-plan-chip fpo-plan-chip--constn" title={p.constn_for_production}>
                      {p.constn_for_production.length > 30
                        ? p.constn_for_production.slice(0, 28) + "…"
                        : p.constn_for_production}
                    </span>
                  )}
                  <span className="fpo-plan-qty-badge">{fmt(Number(p.purchase_qty) || 0)} m</span>
                </div>
                {/* Row 3: Customer name */}
                {p.customer_name && (
                  <div className="fpo-plan-opt-customer">{p.customer_name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HSN Code Dropdown (position:fixed panel) ─────────────────────────────────

interface HsnDropdownProps {
  value: string;
  onChange: (code: string) => void;
  hsnCodes: HsnEntry[];
  loading: boolean;
}
function HsnDropdown({ value, onChange, hsnCodes, loading }: HsnDropdownProps) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const triggerRef              = useRef<HTMLButtonElement>(null);
  const panelRef                = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 340 });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false); setQuery("");
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setQuery(""); };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const openPanel = () => {
    if (loading) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const panelH     = Math.min(300, spaceBelow > 260 ? 260 : spaceBelow - 8);
      const top        = spaceBelow > 140 ? r.bottom + 2 : r.top - panelH - 2;
      setPanelPos({ top, left: r.left, width: Math.max(340, r.width) });
    }
    setOpen(o => !o);
  };

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const q        = query.toLowerCase();
  const filtered = hsnCodes.filter(h =>
    h.code.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)
  ).slice(0, 80);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); return; }
    if (e.key === "Enter" && query.trim()) {
      if (filtered.length === 1) { onChange(filtered[0].code); }
      else {
        const exact = hsnCodes.find(h => h.code.toLowerCase() === q);
        onChange(exact ? exact.code : query.trim().toUpperCase());
      }
      setOpen(false); setQuery("");
    }
  };

  const matchedHsn = hsnCodes.find(h => h.code === value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fpo-hsn-trigger${open ? " open" : ""}${value ? " has-value" : ""}`}
        onClick={openPanel}
        disabled={loading}
        title={matchedHsn ? `${matchedHsn.code} — ${matchedHsn.description}` : value || "Select HSN code"}
      >
        <span className="fpo-hsn-trigger-content">
          {loading ? (
            <span className="fpo-hsn-trigger-placeholder" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Loading…
            </span>
          ) : value ? (
            <span className="fpo-hsn-trigger-code">{value}</span>
          ) : (
            <span className="fpo-hsn-trigger-placeholder">Select HSN…</span>
          )}
        </span>
        <span className="fpo-hsn-trigger-icons">
          {value && !loading && (
            <span className="fpo-hsn-clear-icon" onClick={e => { e.stopPropagation(); onChange(""); setQuery(""); }} title="Clear HSN code">
              <X size={10} />
            </span>
          )}
          <ChevronDown size={10} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
        </span>
      </button>

      {!open && value && matchedHsn && (
        <p className="fpo-hsn-desc-hint" title={matchedHsn.description}>{matchedHsn.description}</p>
      )}

      {open && (
        <div ref={panelRef} className="fpo-hsn-panel"
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelPos.width, zIndex: 9998 }}>
          <div className="fpo-hsn-search-wrap">
            <Search size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input ref={inputRef} className="fpo-hsn-search-input"
              placeholder="Search code or description… (Enter = custom)"
              value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} />
            {query && (
              <button type="button" onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "#94a3b8" }}>
                <X size={11} />
              </button>
            )}
          </div>
          <div className="fpo-hsn-count">
            {hsnCodes.length === 0 ? (
              <span style={{ color: "#c2410c" }}>
                HSN master is empty — press <kbd className="fpo-hsn-kbd">Enter</kbd> to enter a code manually
              </span>
            ) : filtered.length === 0 && query ? (
              <span style={{ color: "#c2410c" }}>
                No match — press <kbd className="fpo-hsn-kbd">Enter</kbd> to use "{query}" as custom code
              </span>
            ) : (
              <span>{filtered.length} HSN code{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="fpo-hsn-list">
            {value && (
              <div className="fpo-hsn-option fpo-hsn-clear-opt"
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}>
                — Clear selection —
              </div>
            )}
            {filtered.length === 0 && !query ? (
              <div className="fpo-hsn-empty">
                <Search size={26} color="#cbd5e1" />
                <span>{hsnCodes.length === 0 ? "No HSN codes loaded" : "Start typing to filter"}</span>
              </div>
            ) : filtered.map(h => (
              <div key={h.code} className={`fpo-hsn-option${h.code === value ? " selected" : ""}`}
                onClick={() => { onChange(h.code); setOpen(false); setQuery(""); }}>
                <div className="fpo-hsn-opt-row">
                  <span className="fpo-hsn-opt-code">{h.code}</span>
                  {h.code === value && <Check size={13} color="#7c3aed" style={{ flexShrink: 0 }} />}
                </div>
                <div className="fpo-hsn-opt-desc">{h.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FabricPurchaseOrders() {
  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const [fpos,    setFpos]    = useState<FabricPurchaseOrderPayload[]>([]);
  const [allFpos, setAllFpos] = useState<FabricPurchaseOrderPayload[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const LIMIT = 10;

  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  // ── DIAGNOSTIC state — surfaces exactly why pendingPlans might be empty ──
  const [planLoadError, setPlanLoadError] = useState("");

  const [hsnCodes,        setHsnCodes]        = useState<HsnEntry[]>([]);
  const [hsnCodesLoading, setHsnCodesLoading] = useState(false);
  const [hsnCodesError,   setHsnCodesError]   = useState("");

  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState<FabricPurchaseOrderPayload>(defaultForm());
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState("");
  const [savedCode,     setSavedCode]     = useState("");
  const [fpoGenerating, setFpoGenerating] = useState(false);
  const [fpoGenError,   setFpoGenError]   = useState("");
  const [formSec, setFormSec] = useState({ details: true, construction: true, gst: true });

  const [showEditModal,   setShowEditModal]   = useState(false);
  const [editLoadingData, setEditLoadingData] = useState(false);
  const [editFpo,         setEditFpo]         = useState<FabricPurchaseOrderPayload | null>(null);
  const [editForm,        setEditForm]        = useState<FabricPurchaseOrderPayload>(defaultForm());
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState("");
  const [editSuccess,     setEditSuccess]     = useState(false);
  const [editSec, setEditSec] = useState({ details: true, construction: true, gst: true });
  const [editFpoGenerating, setEditFpoGenerating] = useState(false);
  const [editFpoGenError,   setEditFpoGenError]   = useState("");

  const [deleteTarget,     setDeleteTarget]     = useState<FabricPurchaseOrderPayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError,      setDeleteError]      = useState("");

  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load suppliers ──
  useEffect(() => {
    getSuppliers().then(res => {
      const raw: Record<string, unknown>[] = res.data ?? res;
      setSuppliers(
        raw
          .map(r => ({
            id:            (r.id ?? r.supplier_id ?? 0) as number,
            name:          ((r.name ?? r.supplier_name ?? r.supplierName ?? "") as string).trim(),
            supplier_code: ((r.supplier_code ?? r.code ?? "") as string).trim(),
            city:          ((r.city ?? "") as string).trim(),
          }))
          .filter(s => Boolean(s.name))
      );
    }).catch(() => {});
  }, []);

  // ── Load pending plans ──
  // DIAGNOSTIC VERSION: distinguishes "request failed" (red, with exact HTTP
  // status + server message) from "request succeeded but 0 rows" (amber,
  // means it's a data/DB-connection issue, not a routing/code issue).
  const loadPendingPlans = async () => {
    setLoadingPlans(true);
    setPlanLoadError("");
    try {
      const res = await getPendingPurchasePlans();
      const raw: any[] = Array.isArray(res) ? res : (res?.data ?? res?.plans ?? []);

      const list: PendingPlan[] = raw
        .filter(Boolean)
        .map((r: any) => ({
          id:                    Number(r.id ?? r.plan_id ?? 0),
          rec_no:                String(r.rec_no ?? r.plan_no ?? r.plan_rec_no ?? r.id ?? ""),
          rec_date:              r.rec_date ?? r.plan_date ?? "",
          order_type:            r.order_type ?? r.type ?? "",
          order_no:              String(r.order_no ?? r.customer_order_no ?? ""),
          customer_name:         r.customer_name ?? r.customer ?? "",
          // Normalise order_sort_no — MySQL may return as number
          order_sort_no:         r.order_sort_no != null
                                   ? String(r.order_sort_no)
                                   : r.sort_no != null ? String(r.sort_no) : "",
          // Normalise constn_for_production — check all column name variants
          constn_for_production: r.constn_for_production
                                   ?? r.construction
                                   ?? r.constn
                                   ?? "",
          purchase_qty:          Number(r.purchase_qty ?? r.qty ?? 0),
          purchase_special_instruction: r.purchase_special_instruction ?? r.special_instruction ?? "",
        }))
        .filter(p => p.rec_no);

      setPendingPlans(list);
      console.log(`[loadPendingPlans] ${list.length} plans loaded — raw response:`, res);

      if (list.length === 0) {
        // Request worked (no exception thrown) but returned nothing —
        // this is a DATA / DB-connection issue, not a routing bug.
        console.warn(
          "[loadPendingPlans] Request succeeded but returned 0 plans. " +
          "Check the backend terminal for the line " +
          '"[pending-purchase] connected database = ..." and compare it ' +
          "against the database name you used in MySQL Workbench. Also " +
          "verify production_plans has rows with purchase_qty > 0 that are " +
          "not yet linked to an FPO (fpo_id IS NULL/0)."
        );
        setPlanLoadError(
          "EMPTY_RESULT::Request succeeded (no error) but the server returned 0 plans. " +
          "This usually means the API is connected to a different database than the " +
          "one you checked in MySQL Workbench, or every plan with purchase_qty > 0 is " +
          "already linked to an FPO. Check the backend terminal log line starting with " +
          '"[pending-purchase]" for the exact counts and connected database name.'
        );
      }
    } catch (err: any) {
      console.error("❌ loadPendingPlans failed:", err);
      // Cover both axios-style and fetch-style error shapes generically.
      const status =
        err?.response?.status ??
        err?.status ??
        null;
      const serverMsg =
        err?.response?.data?.message ??
        err?.data?.message ??
        err?.message ??
        String(err);
      const url =
        err?.response?.config?.url ??
        err?.config?.url ??
        "(unknown — check Network tab for the exact request URL)";
      const detail = status
        ? `REQUEST_FAILED::HTTP ${status} from ${url} — ${serverMsg}`
        : `REQUEST_FAILED::Network/config error calling ${url} — ${serverMsg}`;
      setPlanLoadError(detail);
      pushToast("warning", "Plans Unavailable", "Could not load pending purchase plans — see banner below the Order Plan No field for details.");
    } finally {
      setLoadingPlans(false);
    }
  };
  useEffect(() => { loadPendingPlans(); }, []);

  // ── Load HSN master ──
  const loadHsnCodes = useCallback(async () => {
    setHsnCodesLoading(true); setHsnCodesError("");
    try {
      const res: any = await getHsnCodes({ status: "Active", limit: 1000 });
      const raw: Record<string, unknown>[] = res.data ?? res;
      const list: HsnEntry[] = (Array.isArray(raw) ? raw : [])
        .map(r => ({
          code:        String(r.hsn_code ?? "").trim(),
          description: String(r.hsn_short_desc ?? r.hsn_long_desc ?? "").trim(),
        }))
        .filter(h => h.code)
        .sort((a, b) => a.code.localeCompare(b.code));
      setHsnCodes(list);
    } catch {
      setHsnCodesError("Could not load HSN master — you can still type a code manually.");
      pushToast("warning", "HSN Master Unavailable", "Falling back to manual HSN code entry.");
    } finally { setHsnCodesLoading(false); }
  }, [pushToast]);
  useEffect(() => { loadHsnCodes(); }, [loadHsnCodes]);

  // ── Block body scroll when modal open ──
  useEffect(() => {
    document.body.style.overflow = (showModal || showEditModal) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal, showEditModal]);

  // ── Fetch list ──
  const fetchFpos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFabricPurchaseOrders();
      const all: FabricPurchaseOrderPayload[] = res.data ?? res;
      setAllFpos(all);
      const filtered = search
        ? all.filter(f =>
            f.fpo_no?.toLowerCase().includes(search.toLowerCase()) ||
            f.supplier?.toLowerCase().includes(search.toLowerCase()) ||
            f.plan_rec_no?.toLowerCase().includes(search.toLowerCase())
          )
        : all;
      const start = (page - 1) * LIMIT;
      setFpos(filtered.slice(start, start + LIMIT));
      setTotal(filtered.length);
    } catch {}
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchFpos(); }, [fetchFpos]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Item recalc ──
  const recalcItem = (item: FpoItem): FpoItem => ({
    ...item,
    basic_value: +(item.qty * item.rate).toFixed(2),
  });

  const makeUpdateItem = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    (idx: number, patch: Partial<FpoItem>) =>
      setter(f => {
        const items = [...f.items];
        items[idx] = recalcItem({ ...items[idx], ...patch });
        return { ...f, items };
      });

  const updateItem     = makeUpdateItem(setForm);
  const updateEditItem = makeUpdateItem(setEditForm);

  const makeAddItem    = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    () => setter(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const makeRemoveItem = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    (idx: number) => setter(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const addItem        = makeAddItem(setForm);
  const addEditItem    = makeAddItem(setEditForm);
  const removeItem     = makeRemoveItem(setForm);
  const removeEditItem = makeRemoveItem(setEditForm);

  // ── Totals ──
  const calcTotals = (f: FabricPurchaseOrderPayload) => {
    const sub  = +(f.items.reduce((s, i) => s + (Number(i.basic_value) || 0), 0)).toFixed(2);
    const cgst = +(sub * (Number(f.cgst_pct) || 0) / 100).toFixed(2);
    const sgst = +(sub * (Number(f.sgst_pct) || 0) / 100).toFixed(2);
    const igst = +(sub * (Number(f.igst_pct) || 0) / 100).toFixed(2);
    const net  = +(sub + cgst + sgst + igst).toFixed(2);
    return { sub, cgst, sgst, igst, net };
  };

  const ct  = useMemo(() => calcTotals(form),     [form]);
  const ect = useMemo(() => calcTotals(editForm),  [editForm]);

  // ── Auto-generate FPO No ──
  const generateFpoNo = async (
    setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>,
    setGen: (v: boolean) => void,
    setGenErr: (v: string) => void
  ) => {
    setGen(true); setGenErr("");
    try {
      const res: any = await getNextFpoNo();
      const no: string = res?.fpo_no ?? res?.next_fpo_no ?? res;
      setter(f => ({ ...f, fpo_no: no }));
    } catch {
      const yr = new Date().getFullYear();
      const ts = Date.now().toString().slice(-4);
      setter(f => ({ ...f, fpo_no: `FPO-${yr}-${ts}` }));
      setGenErr("Server unavailable — used local fallback. Verify before saving.");
    } finally { setGen(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Link plan — full autofill chain ──
  //    Autofills from production_plans into both the header and items[0]:
  //      Header : purchase_qty, order_no, plan_rec_no, remarks
  //      Item[0]: sort_no  ← plan.order_sort_no
  //               construction ← plan.constn_for_production
  //               qty          ← plan.purchase_qty
  // ─────────────────────────────────────────────────────────────────────────────
  const selectPlan = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    (plan: PendingPlan | null) => {
      if (!plan) {
        setter(f => ({
          ...f,
          plan_id: null, plan_rec_no: "", order_no: "", purchase_qty: 0,
          items: [emptyItem()],
        }));
        return;
      }

      const qty         = Number(plan.purchase_qty) || 0;
      const sortNo      = plan.order_sort_no        ? String(plan.order_sort_no).trim()        : "";
      const constn      = plan.constn_for_production ? String(plan.constn_for_production).trim() : "";

      console.log("[selectPlan] autofill →", { sortNo, constn, qty, plan_id: plan.id });

      const autofillItem = recalcItem({
        sort_no:      sortNo,   // ← from production_plans.order_sort_no
        construction: constn,   // ← from production_plans.constn_for_production
        hsn_code:     "",
        qty,                    // ← from production_plans.purchase_qty
        rate:         0,
        basic_value:  0,
      });

      setter(f => ({
        ...f,
        plan_id:      plan.id,
        plan_rec_no:  plan.rec_no,
        order_no:     plan.order_no,
        purchase_qty: qty,      // ← header field
        remarks: f.remarks ||
          `Purchase for ${plan.rec_no} (Order ${plan.order_no}${plan.customer_name ? " — " + plan.customer_name : ""})`,
        items: [autofillItem],  // replace items with the autofilled row
      }));

      // Confirm to developer via toast what was autofilled
      const chips: string[] = [];
      if (sortNo) chips.push(`Sort No: ${sortNo}`);
      if (constn) chips.push(`Construction: ${constn.slice(0, 30)}${constn.length > 30 ? "…" : ""}`);
      chips.push(`Qty: ${fmt(qty)} m`);
      pushToast(
        "info",
        `Plan ${plan.rec_no} linked`,
        `Autofilled → ${chips.join(" | ")}`
      );
    };

  // ── Open create ──
  const handleNewFpo = async () => {
    setForm(defaultForm());
    setSaveError(""); setSavedCode(""); setFpoGenError("");
    setFormSec({ details: true, construction: true, gst: true });
    setShowModal(true);
    await generateFpoNo(setForm, setFpoGenerating, setFpoGenError);
  };

  // ── Create save ──
  const handleSave = async () => {
    setSaveError("");
    if (!form.fpo_no || !form.supplier) { setSaveError("FPO No and Supplier are required."); return; }
    if (!form.plan_id)                  { setSaveError("Please select an Order Plan No to link this FPO."); return; }
    setSaving(true);
    try {
      const totals = calcTotals(form);
      const res: any = await createFabricPurchaseOrder({
        ...form,
        sub_total: totals.sub, cgst_amt: totals.cgst,
        sgst_amt: totals.sgst, igst_amt: totals.igst, net_value: totals.net,
      });
      setSavedCode(res.fpo_no ?? res.data?.fpo_no ?? form.fpo_no);
      pushToast("success", "FPO Created", `"${form.fpo_no}" created successfully.`);
      fetchFpos(); loadPendingPlans();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to save FPO.";
      setSaveError(msg); pushToast("error", "FPO Save Failed", msg);
    } finally { setSaving(false); }
  };

  const handleClose = () => {
    setShowModal(false); setForm(defaultForm());
    setSaveError(""); setSavedCode(""); setFpoGenError("");
  };

  // ── Sanitizers ──
  const sanitizeItem = (item?: Partial<FpoItem> | null): FpoItem => ({
    sort_no:      item?.sort_no ?? "",
    construction: item?.construction ?? "",
    hsn_code:     item?.hsn_code ?? "",
    qty:          Number(item?.qty) || 0,
    rate:         Number(item?.rate) || 0,
    basic_value:  Number(item?.basic_value) || 0,
  });

  const sanitizeFpo = (data: Partial<FabricPurchaseOrderPayload>): FabricPurchaseOrderPayload => ({
    ...defaultForm(),
    ...data,
    fpo_date:    data.fpo_date    ?? today(),
    delivery_dt: data.delivery_dt ?? today(),
    supplier:      data.supplier      ?? "",
    billing_from:  data.billing_from  ?? "",
    delivery_to:   data.delivery_to   ?? "",
    pay_terms:     data.pay_terms     ?? "",
    pinning:       data.pinning       ?? "",
    packing_type:  data.packing_type  ?? "",
    rate_type:     data.rate_type     ?? "",
    freight:       data.freight       ?? "",
    remarks:       data.remarks       ?? "",
    plan_rec_no:   data.plan_rec_no   ?? "",
    order_no:      data.order_no      ?? "",
    cgst_pct:      Number(data.cgst_pct)     || 0,
    sgst_pct:      Number(data.sgst_pct)     || 0,
    igst_pct:      Number(data.igst_pct)     || 0,
    purchase_qty:  Number(data.purchase_qty) || 0,
    plan_id:       data.plan_id ?? null,
    items: (data.items?.length ? data.items : [emptyItem()]).map(sanitizeItem),
  });

  // ── Open edit ──
  const handleOpenEdit = async (fpo: FabricPurchaseOrderPayload) => {
    setEditError(""); setEditSuccess(false); setEditFpoGenError("");
    setEditFpo(fpo);
    setEditForm(sanitizeFpo(fpo));
    setEditSec({ details: true, construction: true, gst: true });
    setShowEditModal(true); setEditLoadingData(true);
    try {
      const full = await getFabricPurchaseOrderById(fpo.id!);
      const data: FabricPurchaseOrderPayload = full.data ?? full;
      setEditFpo(data);
      setEditForm(sanitizeFpo(data));
    } catch {
      setEditError("Could not load full FPO details. You may still edit basic fields.");
    } finally { setEditLoadingData(false); }
  };

  const handleEditClose = () => {
    setShowEditModal(false); setEditFpo(null);
    setEditForm(defaultForm()); setEditError(""); setEditSuccess(false);
    setEditFpoGenError(""); setEditFpoGenerating(false);
  };

  // ── Update save ──
  const handleUpdate = async () => {
    setEditError("");
    if (!editForm.fpo_no || !editForm.supplier) { setEditError("FPO No and Supplier are required."); return; }
    setEditSaving(true);
    try {
      const totals = calcTotals(editForm);
      await updateFabricPurchaseOrder(editFpo!.id!, {
        ...editForm,
        sub_total: totals.sub, cgst_amt: totals.cgst,
        sgst_amt: totals.sgst, igst_amt: totals.igst, net_value: totals.net,
      });
      setEditSuccess(true);
      pushToast("success", "FPO Updated", `"${editFpo!.fpo_no}" updated successfully.`);
      fetchFpos();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to update FPO.";
      setEditError(msg); pushToast("error", "FPO Update Failed", msg);
    } finally { setEditSaving(false); }
  };

  // ── Delete ──
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true); setDeleteError("");
    try {
      await deleteFabricPurchaseOrder(deleteTarget.id!);
      pushToast("warning", "FPO Deleted", `"${deleteTarget.fpo_no}" has been permanently deleted.`);
      setDeleteTarget(null); fetchFpos(); loadPendingPlans();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to delete FPO.";
      setDeleteError(msg); pushToast("error", "Delete Failed", msg);
    } finally { setDeleteConfirming(false); }
  };

  // ── Export / Print ──
  const getExportData = () => allFpos.length ? allFpos : fpos;

  const handleExportCSV = () => {
    const data = getExportData();
    if (!data.length) { pushToast("info", "Nothing to Export", "No records available."); return; }
    doExportCSV(data);
    pushToast("success", "CSV Exported", `${data.length} record(s) downloaded.`);
  };

  const handleExportExcel = () => {
    const data = getExportData();
    if (!data.length) { pushToast("info", "Nothing to Export", "No records available."); return; }
    doExportExcel(data);
    pushToast("success", "Excel Exported", `${data.length} record(s) downloaded.`);
  };

  const handlePrintList = () => {
    const data = getExportData();
    if (!data.length) { pushToast("info", "Nothing to Print", "No records available."); return; }
    doPrintTable(data, fmtDate, fmt);
  };

  // ── Print single FPO ──
  const handlePrintFpo = (fpo: FabricPurchaseOrderPayload) => {
    const itemRows = (fpo.items ?? []).map((it, i) => `
      <tr>
        <td>${i + 1}</td><td>${it.sort_no ?? ""}</td><td>${it.construction ?? ""}</td>
        <td>${it.hsn_code ?? ""}</td>
        <td style="text-align:right">${it.qty}</td>
        <td style="text-align:right">${fmt(Number(it.rate) || 0)}</td>
        <td style="text-align:right"><strong>${fmt(Number(it.basic_value) || 0)}</strong></td>
      </tr>`).join("");
    const t = calcTotals({ ...fpo, items: fpo.items ?? [] });
    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>FPO — ${fpo.fpo_no}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:28px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #7c3aed;padding-bottom:14px}
        .co{font-size:18px;font-weight:800;color:#7c3aed}.dt h2{margin:0;font-size:20px}.dt .fno{font-size:15px;color:#7c3aed;font-weight:700}
        .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px;font-size:12px}
        .meta-item label{display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
        .meta-item span{font-weight:600}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{background:#7c3aed;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
        th.r{text-align:right}td{padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
        tr:nth-child(even) td{background:#f8fafc}
        .tots{float:right;width:280px;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
        .tots table{margin:0}.tots td{border:none;padding:4px 6px}
        .net{font-size:15px;font-weight:800;color:#7c3aed;border-top:2px solid #7c3aed;padding-top:6px;margin-top:4px}
        .foot{clear:both;margin-top:30px;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
        @media print{body{margin:12px}}
      </style>
    </head><body>
      <div class="hdr">
        <div class="co">FABRIC PURCHASE ORDER</div>
        <div class="dt"><h2>FPO</h2><div class="fno">${fpo.fpo_no}</div>
          <div style="font-size:11px;color:#64748b">Date: ${fpo.fpo_date ? fmtDate(fpo.fpo_date) : "—"}</div></div>
      </div>
      <div class="meta">
        <div class="meta-item"><label>Supplier</label><span>${fpo.supplier}</span></div>
        <div class="meta-item"><label>Order Plan No</label><span>${fpo.plan_rec_no || "—"}</span></div>
        <div class="meta-item"><label>Order No</label><span>${fpo.order_no ?? "—"}</span></div>
        <div class="meta-item"><label>Purchase Qty</label><span>${fpo.purchase_qty ? fmt(Number(fpo.purchase_qty)) : "—"}</span></div>
        <div class="meta-item"><label>Billing From</label><span>${fpo.billing_from ?? "—"}</span></div>
        <div class="meta-item"><label>Delivery To</label><span>${fpo.delivery_to ?? "—"}</span></div>
        <div class="meta-item"><label>Pay Terms</label><span>${fpo.pay_terms ?? "—"}</span></div>
        <div class="meta-item"><label>Rate Type</label><span>${fpo.rate_type ?? "—"}</span></div>
        <div class="meta-item"><label>Delivery Date</label><span>${fpo.delivery_dt ? fmtDate(fpo.delivery_dt) : "—"}</span></div>
        <div class="meta-item"><label>Pinning</label><span>${fpo.pinning ?? "—"}</span></div>
        <div class="meta-item"><label>Packing Type</label><span>${fpo.packing_type ?? "—"}</span></div>
        <div class="meta-item"><label>Freight</label><span>${fpo.freight ?? "—"}</span></div>
        ${fpo.remarks ? `<div class="meta-item" style="grid-column:1/-1"><label>Remarks</label><span>${fpo.remarks}</span></div>` : ""}
      </div>
      <table>
        <thead><tr><th>#</th><th>Sort No</th><th>Construction</th><th>HSN Code</th>
          <th class="r">Qty</th><th class="r">Rate (₹)</th><th class="r">Basic Value (₹)</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="tots"><table>
        <tr><td>Sub Total</td><td style="text-align:right">₹${fmt(t.sub)}</td></tr>
        ${fpo.cgst_pct ? `<tr><td>CGST (${fpo.cgst_pct}%)</td><td style="text-align:right">₹${fmt(t.cgst)}</td></tr>` : ""}
        ${fpo.sgst_pct ? `<tr><td>SGST (${fpo.sgst_pct}%)</td><td style="text-align:right">₹${fmt(t.sgst)}</td></tr>` : ""}
        ${fpo.igst_pct ? `<tr><td>IGST (${fpo.igst_pct}%)</td><td style="text-align:right">₹${fmt(t.igst)}</td></tr>` : ""}
        <tr class="net"><td><strong>Net Value</strong></td><td style="text-align:right"><strong>₹${fmt(t.net)}</strong></td></tr>
      </table></div>
      <div class="foot">
        <span>Printed: ${new Date().toLocaleString("en-IN")}</span>
        <span>System-generated document.</span>
      </div>
    </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  // ── Shared form body renderer ──
  const renderFormBody = (
    f: FabricPurchaseOrderPayload,
    setF: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>,
    updItem: (idx: number, patch: Partial<FpoItem>) => void,
    addIt: () => void,
    rmIt: (idx: number) => void,
    totals: { sub: number; cgst: number; sgst: number; igst: number; net: number },
    errMsg: string,
    isSaving: boolean,
    isEdit: boolean,
    onSave: () => void,
    onClose: () => void,
    sec: typeof formSec,
    setSec: React.Dispatch<React.SetStateAction<typeof formSec>>,
    fpoGen: boolean,
    fpoGenErr: string,
  ) => {
    const toggleSec = (k: keyof typeof formSec) => setSec(p => ({ ...p, [k]: !p[k] }));

    return (
      <div className="fpo-modal-body">

        {errMsg && (
          <div className="fpo-error-banner">
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{errMsg}</span>
            <button onClick={() => isEdit ? setEditError("") : setSaveError("")}
              style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ef4444", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── FPO Details ── */}
        <SectionHead title="FPO Details" open={sec.details} onToggle={() => toggleSec("details")} accent="#7c3aed" />
        {sec.details && (
          <div className="fpo-grid-3" style={{ paddingTop: 12, paddingBottom: 4 }}>

            <FField label="FPO No" type="locked">
              <div className={`fpo-display-field${fpoGen ? " fpo-display-field--loading" : (f.fpo_no ? " fpo-display-field--filled" : "")}`}>
                {fpoGen
                  ? <span className="fpo-display-fetching"><Loader2 size={11} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} /> Generating…</span>
                  : f.fpo_no
                    ? <span className="fpo-display-value">{f.fpo_no}</span>
                    : <span className="fpo-display-empty">Auto-generated</span>}
              </div>
              {fpoGenErr && <p className="fpo-hint fpo-hint--warn">⚠ {fpoGenErr}</p>}
              <p className="fpo-hint">Auto-generated on new FPO</p>
            </FField>

            <FField label="FPO Date" type="date">
              <input className="fpo-input" type="date"
                value={f.fpo_date} onChange={e => setF({ ...f, fpo_date: e.target.value })} />
            </FField>

            <FField label="Supplier" required type="lookup">
              <SupplierDropdown
                value={f.supplier}
                onChange={name => setF({ ...f, supplier: name })}
                suppliers={suppliers}
              />
            </FField>

           
            {!isEdit ? (
              <FField label="Order Plan No" required type="lookup"
                hint="">
                <PlanDropdown
                  value={f.plan_id ?? null}
                  planRecNo={f.plan_rec_no ?? ""}
                  onChange={selectPlan(setF)}
                  plans={pendingPlans}
                  loading={loadingPlans}
                />
                {/* ── DIAGNOSTIC BANNER ── tells you exactly why the list is empty ── */}
                {planLoadError && (
                  <div className={
                    planLoadError.startsWith("REQUEST_FAILED")
                      ? "fpo-plan-diag fpo-plan-diag--error"
                      : "fpo-plan-diag fpo-plan-diag--warn"
                  }>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{planLoadError.replace(/^(REQUEST_FAILED|EMPTY_RESULT)::/, "")}</span>
                    <button
                      type="button"
                      onClick={loadPendingPlans}
                      className="fpo-plan-diag-retry"
                      title="Retry loading plans"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </FField>
            ) : (
              f.plan_id && (
                <FField label="Order Plan No" type="locked">
                  <input className="fpo-input fpo-input--disabled fpo-input--plan" type="text" readOnly
                    value={f.plan_rec_no || "—"} />
                  <p className="fpo-hint">Plan link is permanent after creation</p>
                </FField>
              )
            )}

            {/* Purchase Qty */}
            {!isEdit ? (
              <FField label="Purchase Qty" type={f.plan_id ? "autofill" : "number"}>
                <input
                  className={`fpo-input${f.plan_id ? " fpo-input--autofill" : ""}`}
                  type="number" min={0} step="0.01"
                  placeholder="Auto-filled on plan selection"
                  value={f.purchase_qty > 0 ? f.purchase_qty : ""}
                  onChange={e => setF({ ...f, purchase_qty: parseFloat(e.target.value) || 0 })}
                />
                {f.plan_id && <p className="fpo-hint fpo-hint--ok">✓ Auto-filled from plan — editable</p>}
              </FField>
            ) : (
              f.plan_id && (
                <FField label="Purchase Qty" type="locked">
                  <input className="fpo-input fpo-input--disabled" type="text" readOnly
                    value={fmt(Number(f.purchase_qty) || 0)} />
                </FField>
              )
            )}

            <FField label="Billing From" type="text">
              <input className="fpo-input" type="text" placeholder="Billing location"
                value={f.billing_from} onChange={e => setF({ ...f, billing_from: e.target.value })} />
            </FField>

            <FField label="Delivery To" type="text">
              <input className="fpo-input" type="text" placeholder="Delivery location"
                value={f.delivery_to} onChange={e => setF({ ...f, delivery_to: e.target.value })} />
            </FField>

            <FField label="Pay Terms" type="select">
              <select className="fpo-input" value={f.pay_terms}
                onChange={e => setF({ ...f, pay_terms: e.target.value })}>
                <option value="">Select</option>
                {["Cash", "30 Days", "45 Days", "60 Days", "90 Days", "LC", "Advance"].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FField>

            <FField label="Pinning" type="select">
              <select className="fpo-input" value={f.pinning}
                onChange={e => setF({ ...f, pinning: e.target.value })}>
                <option value="">Select</option>
                {["Yes", "No"].map(t => <option key={t}>{t}</option>)}
              </select>
            </FField>

            <FField label="Packing Type" type="select">
              <select className="fpo-input" value={f.packing_type}
                onChange={e => setF({ ...f, packing_type: e.target.value })}>
                <option value="">Select</option>
                {["Roll", "Bale", "Box", "Loose"].map(t => <option key={t}>{t}</option>)}
              </select>
            </FField>

            <FField label="Rate Type" type="select">
              <select className="fpo-input" value={f.rate_type}
                onChange={e => setF({ ...f, rate_type: e.target.value })}>
                <option value="">Select</option>
                {["Per Meter", "Per Kg", "Per Piece"].map(t => <option key={t}>{t}</option>)}
              </select>
            </FField>

            <FField label="Freight" type="select">
              <select className="fpo-input" value={f.freight}
                onChange={e => setF({ ...f, freight: e.target.value })}>
                <option value="">Select</option>
                {["To Pay", "Paid", "To Be Billed"].map(t => <option key={t}>{t}</option>)}
              </select>
            </FField>

            <FField label="Delivery Date" type="date">
              <input className="fpo-input" type="date"
                value={f.delivery_dt} onChange={e => setF({ ...f, delivery_dt: e.target.value })} />
            </FField>

            <div className="fpo-col-full">
              <FField label="Remarks" type="text">
                <input className="fpo-input" type="text" placeholder="Additional remarks"
                  value={f.remarks} onChange={e => setF({ ...f, remarks: e.target.value })} />
              </FField>
            </div>
          </div>
        )}

        {/* ── Construction Items ── */}
        <SectionHead title="Construction Items" open={sec.construction} onToggle={() => toggleSec("construction")} accent="#7c3aed" />
        {sec.construction && (
          <div style={{ paddingTop: 10, paddingBottom: 8 }}>

           

            <div className="fpo-item-table-header">
              <span className="fpo-item-count">{f.items.length} item{f.items.length !== 1 ? "s" : ""}</span>
              <button type="button" className="fpo-add-row-btn" onClick={addIt}>
                <PlusCircle size={13} /> Add Row
              </button>
            </div>
            {hsnCodesError && (
              <p className="fpo-hint fpo-hint--warn" style={{ marginBottom: 8 }}>⚠ {hsnCodesError}</p>
            )}
            <div className="fpo-item-table-wrap">
              <table className="fpo-item-table">
                <thead>
                  <tr>
                    <th className="fpo-ith" style={{ width: 70 }}>
                      Sort No <FTypeBadge type={!isEdit && f.plan_id ? "autofill" : "text"} />
                    </th>
                    <th className="fpo-ith" style={{ minWidth: 220 }}>
                      Construction <FTypeBadge type={!isEdit && f.plan_id ? "autofill" : "text"} />
                    </th>
                    <th className="fpo-ith" style={{ minWidth: 160 }}>
                      HSN Code <FTypeBadge type="lookup" />
                    </th>
                    <th className="fpo-ith fpo-ith--r" style={{ width: 80 }}>
                      Qty <FTypeBadge type={!isEdit && f.plan_id ? "autofill" : "number"} />
                    </th>
                    <th className="fpo-ith fpo-ith--r" style={{ width: 90 }}>Rate</th>
                    <th className="fpo-ith fpo-ith--r" style={{ width: 110 }}>
                      Basic Value <FTypeBadge type="computed" />
                    </th>
                    <th className="fpo-ith fpo-ith--c" style={{ width: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {f.items.map((item, idx) => {
                    // First row is autofilled when plan is selected on create
                    const isAutofilled = !isEdit && idx === 0 && Boolean(f.plan_id);
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? "fpo-irow-even" : "fpo-irow-odd"}>
                        <td className="fpo-itd">
                          <input
                            className={`fpo-iinput${isAutofilled && item.sort_no ? " fpo-iinput--autofill" : ""}`}
                            type="text" placeholder="e.g. 30742"
                            value={item.sort_no}
                            onChange={e => updItem(idx, { sort_no: e.target.value })}
                          />
                        </td>
                        <td className="fpo-itd">
                          <input
                            className={`fpo-iinput${isAutofilled && item.construction ? " fpo-iinput--autofill" : ""}`}
                            type="text" placeholder="e.g. 30/1 ECOVERO × 30/1 HT / 68×56"
                            value={item.construction}
                            onChange={e => updItem(idx, { construction: e.target.value })}
                          />
                        </td>
                        <td className="fpo-itd fpo-itd--hsn">
                          <HsnDropdown
                            value={item.hsn_code}
                            onChange={code => updItem(idx, { hsn_code: code })}
                            hsnCodes={hsnCodes}
                            loading={hsnCodesLoading}
                          />
                        </td>
                        <td className="fpo-itd">
                          <input
                            className={`fpo-iinput fpo-iinput--r${isAutofilled && item.qty ? " fpo-iinput--autofill" : ""}`}
                            type="number" min={0}
                            value={item.qty || ""}
                            onChange={e => updItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="fpo-itd">
                          <input className="fpo-iinput fpo-iinput--r" type="number" min={0} step="0.01"
                            value={item.rate || ""}
                            onChange={e => updItem(idx, { rate: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="fpo-itd fpo-itd--bv">
                          ₹{fmt(item.basic_value)}
                        </td>
                        <td className="fpo-itd fpo-itd--c">
                          {f.items.length > 1 && (
                            <button className="fpo-del-row-btn" onClick={() => rmIt(idx)} title="Remove row">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sub-total bar */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, alignItems: "center", padding: "10px 4px", borderTop: "2px solid #e2e8f0", marginTop: 4, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Items</span>
                <strong style={{ fontSize: 14, fontWeight: 800, color: "#374151" }}>{f.items.length}</strong>
              </div>
              <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Sub Total</span>
                <strong style={{ fontSize: 15, fontWeight: 800, color: "#7c3aed" }}>₹ {fmt(totals.sub)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── GST & Totals ── */}
        <SectionHead title="GST & Totals" open={sec.gst} onToggle={() => toggleSec("gst")} accent="#0369a1" />
        {sec.gst && (
          <div className="fpo-gst-section">
            <div className="fpo-gst-grid">
              <GstRow label="CGST" pct={f.cgst_pct} amount={totals.cgst} onPctChange={v => setF({ ...f, cgst_pct: v })} />
              <GstRow label="SGST" pct={f.sgst_pct} amount={totals.sgst} onPctChange={v => setF({ ...f, sgst_pct: v })} />
              <GstRow label="IGST" pct={f.igst_pct} amount={totals.igst} onPctChange={v => setF({ ...f, igst_pct: v })} />
            </div>
            <div className="fpo-sub-row">
              <span className="fpo-sub-label">Sub Total</span>
              <span className="fpo-sub-val">₹{fmt(totals.sub)}</span>
            </div>
            <div className="fpo-net-row">
              <span className="fpo-net-label">Net Value</span>
              <span className="fpo-net-val">₹{fmt(totals.net)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ddSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        .fpo-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        .fpo-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .fpo-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#3b0764; }
        .fpo-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }

        .fpo-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

        .fpo-new-btn { display:flex; align-items:center; gap:6px; background:#7c3aed; color:#fff; border:none; border-radius:9px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 8px rgba(124,58,237,0.35); white-space:nowrap; }
        .fpo-new-btn:hover { background:#6d28d9; }

        .fpo-export-menu-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#374151; border:1.5px solid #cbd5e1; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; transition:border-color .15s, background .15s; }
        .fpo-export-menu-btn:hover { border-color:#7c3aed; color:#7c3aed; background:#faf5ff; }

        .fpo-btn-divider { width:1px; height:32px; background:#e2e8f0; }

        .fpo-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .fpo-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .fpo-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); }
        .fpo-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; background:#fff; }
        .fpo-search:focus { border-color:#7c3aed; }
        .fpo-rec-count { font-size:13px; color:#64748b; margin-left:auto; white-space:nowrap; }

        .fpo-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .fpo-table-wrap { overflow-x:auto; }
        .fpo-table { width:100%; border-collapse:collapse; font-size:13px; min-width:600px; }
        .fpo-table thead tr { background:#7c3aed; }
        .fpo-table th { padding:11px 12px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .fpo-table th.th-r { text-align:right; }
        .fpo-table th.th-c { text-align:center; }
        .fpo-table tbody tr:nth-child(odd)  td { background:#fff; }
        .fpo-table tbody tr:nth-child(even) td { background:#faf5ff; }
        .fpo-table tbody tr:hover td { filter:brightness(0.97); }
        .fpo-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .fpo-fpo-no { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#7c3aed; background:#faf5ff; border:1px solid #c4b5fd; border-radius:6px; padding:2px 7px; }
        .fpo-plan-rec { font-weight:600; color:#0f766e; }
        .fpo-td-num { text-align:right; font-family:'DM Mono',monospace; }
        .fpo-td-c { text-align:center; }
        .fpo-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }
        .fpo-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .fpo-edit-btn { display:inline-flex; align-items:center; gap:3px; background:#faf5ff; color:#7c3aed; border:1px solid #c4b5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
        .fpo-edit-btn:hover { background:#ede9fe; }
        .fpo-print-row-btn { display:inline-flex; align-items:center; gap:3px; background:#f0f9ff; color:#0284c7; border:1px solid #bae6fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
        .fpo-print-row-btn:hover { background:#e0f2fe; }
        .fpo-del-btn { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; }
        .fpo-del-btn:hover { background:#fee2e2; }

        .fpo-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#faf5ff; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .fpo-pg-btns { display:flex; gap:4px; align-items:center; }
        .fpo-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif; }
        .fpo-pg-btn:hover:not(:disabled) { background:#f1f5f9; }
        .fpo-pg-btn.active { background:#7c3aed; color:#fff; border-color:#7c3aed; font-weight:700; }
        .fpo-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .fpo-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; }
        .fpo-modal { background:#fff; border-radius:14px; width:100%; max-width:980px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        .fpo-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-radius:14px 14px 0 0; flex-shrink:0; }
        .fpo-modal-header--create { background:linear-gradient(135deg,#7c3aed,#5b21b6); }
        .fpo-modal-header--edit   { background:linear-gradient(135deg,#0f766e,#065f46); }
        .fpo-modal-title { color:#fff; font-weight:800; font-size:18px; margin:0; }
        .fpo-modal-subtitle { font-size:11px; color:rgba(255,255,255,.75); font-family:'DM Mono',monospace; margin-top:2px; }
        .fpo-modal-close-btn { background:none; border:none; padding:0 4px; cursor:pointer; display:flex; align-items:center; }
        .fpo-modal-body { padding:16px 20px; overflow-y:auto; flex:1; }
        .fpo-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }

        .fpo-section-head { display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; cursor:pointer; margin-top:18px; user-select:none; }
        .fpo-section-title { font-weight:700; font-size:13px; color:#1e293b; }

        .fpo-grid-3 { display:grid; grid-template-columns:1fr; gap:14px; }
        @media(min-width:480px){ .fpo-grid-3 { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:768px){ .fpo-grid-3 { grid-template-columns:repeat(3,1fr); } }
        .fpo-col-full { grid-column:1/-1; }

        .fpo-hint { margin:3px 0 0; font-size:11px; color:#94a3b8; }
        .fpo-hint--warn { color:#b45309; }
        .fpo-hint--ok   { color:#0f766e; }
        .fpo-input { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; }
        .fpo-input:focus { border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
        .fpo-input--disabled { background:#f1f5f9; color:#6b7280; cursor:not-allowed; }
        .fpo-input--autofill { border-color:#99f6e4; background:#f0fdfa; color:#0f766e; font-weight:700; }
        .fpo-input--plan  { color:#0f766e; font-weight:700; }
        .fpo-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }

        /* Autofill banner inside Construction Items section */
        .fpo-autofill-banner { display:flex; align-items:flex-start; gap:8px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; color:#0f766e; padding:9px 13px; margin-bottom:10px; font-size:12.5px; line-height:1.5; }

        /* DIAGNOSTIC banner — explains exactly why the plan list is empty */
        .fpo-plan-diag { display:flex; align-items:flex-start; gap:7px; border-radius:8px; padding:9px 11px; margin-top:6px; font-size:11.5px; line-height:1.5; }
        .fpo-plan-diag--error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; }
        .fpo-plan-diag--warn  { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
        .fpo-plan-diag-retry { margin-left:auto; flex-shrink:0; background:#fff; border:1px solid currentColor; color:inherit; border-radius:6px; padding:2px 9px; font-size:11px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-plan-diag-retry:hover { opacity:.8; }

        /* Plan autofill preview chips (below plan picker when plan is selected) */
        .fpo-plan-autofill-preview { margin-top:6px; }
        .fpo-plan-preview-row { display:flex; flex-wrap:wrap; gap:6px; }
        .fpo-plan-preview-chip { display:inline-flex; align-items:center; gap:4px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:3px 8px; font-size:11px; }
        .fpo-plan-preview-label { color:#64748b; font-weight:600; }
        .fpo-plan-preview-val { color:#0f766e; font-weight:700; font-family:'DM Mono',monospace; }

        .fpo-display-field { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; font-size:13px; font-family:'DM Sans',sans-serif; background:#f8fafc; color:#475569; min-height:38px; display:flex; align-items:center; gap:6px; cursor:not-allowed; }
        .fpo-display-field--loading { opacity:.75; }
        .fpo-display-field--filled { background:#f0fdf4; border-color:#6ee7b7; color:#166534; font-weight:700; }
        .fpo-display-value { font-family:'DM Mono',monospace; font-weight:700; font-size:13px; letter-spacing:.03em; }
        .fpo-display-empty { color:#94a3b8; }
        .fpo-display-fetching { display:flex; align-items:center; gap:5px; color:#94a3b8; font-size:12px; }

        .fpo-item-table-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .fpo-item-count { font-size:12px; color:#64748b; font-weight:600; }
        .fpo-add-row-btn { display:flex; align-items:center; gap:5px; background:#faf5ff; color:#7c3aed; border:1px solid #c4b5fd; border-radius:8px; padding:6px 13px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-add-row-btn:hover { background:#ede9fe; }
        .fpo-item-table-wrap { border:1px solid #e2e8f0; border-radius:10px; overflow-x:auto; overflow-y:visible; }
        .fpo-item-table { width:100%; border-collapse:collapse; font-size:12px; min-width:620px; }
        .fpo-ith { padding:8px 10px; background:#f5f3ff; color:#5b21b6; font-weight:700; text-align:left; border-bottom:1px solid #e2e8f0; white-space:nowrap; font-size:11px; }
        .fpo-ith--r { text-align:right; }
        .fpo-ith--c { text-align:center; }
        .fpo-irow-even td { background:#fff; }
        .fpo-irow-odd  td { background:#faf5ff; }
        .fpo-itd { padding:6px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
        .fpo-itd--hsn { vertical-align:top; padding:5px 8px; min-width:160px; }
        .fpo-itd--bv { text-align:right; font-family:'DM Mono',monospace; font-weight:700; color:#5b21b6; vertical-align:middle; }
        .fpo-itd--c { text-align:center; vertical-align:middle; }
        .fpo-iinput { width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:12px; font-family:'DM Sans',sans-serif; outline:none; color:#1e293b; background:#fff; }
        .fpo-iinput:focus { border-color:#7c3aed; }
        .fpo-iinput--r { text-align:right; }
        /* Teal highlight for autofilled item cells */
        .fpo-iinput--autofill { border-color:#99f6e4 !important; background:#f0fdfa !important; color:#0f766e !important; font-weight:700 !important; }
        .fpo-del-row-btn { background:#fff1f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .fpo-del-row-btn:hover { background:#fee2e2; }

        /* Plan option in dropdown — richer layout */
        .fpo-plan-option { flex-direction:column; align-items:flex-start; gap:4px; }
        .fpo-plan-opt-row1 { display:flex; align-items:center; gap:8px; width:100%; }
        .fpo-plan-opt-no { font-family:'DM Mono',monospace; font-size:13px; font-weight:700; color:#0f766e; }
        .fpo-plan-opt-order { font-size:11px; color:#64748b; }
        .fpo-plan-opt-chips { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
        .fpo-plan-chip { border-radius:4px; padding:1px 6px; font-size:10px; font-weight:700; }
        .fpo-plan-chip--sort { background:#ede9fe; color:#7c3aed; }
        .fpo-plan-chip--constn { background:#f0f9ff; color:#0284c7; font-family:'DM Mono',monospace; }
        .fpo-plan-opt-customer { font-size:11px; color:#94a3b8; }
        .fpo-plan-qty-badge { background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; border-radius:4px; padding:1px 6px; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; }

        .fpo-hsn-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:4px; padding:4px 7px; height:28px; border:1px solid #cbd5e1; border-radius:5px; background:#fff; cursor:pointer; font-family:'DM Sans',sans-serif; outline:none; text-align:left; transition:border-color .15s, box-shadow .15s; }
        .fpo-hsn-trigger:hover { border-color:#7c3aed; }
        .fpo-hsn-trigger.open { border-color:#7c3aed; box-shadow:0 0 0 2px rgba(124,58,237,.15); }
        .fpo-hsn-trigger.has-value { border-color:#c4b5fd; background:#faf5ff; }
        .fpo-hsn-trigger:disabled { cursor:not-allowed; opacity:.7; }
        .fpo-hsn-trigger-content { flex:1; overflow:hidden; min-width:0; }
        .fpo-hsn-trigger-code { font-family:'DM Mono',monospace; font-weight:700; font-size:12px; color:#7c3aed; white-space:nowrap; }
        .fpo-hsn-trigger-placeholder { color:#9ca3af; font-size:11px; white-space:nowrap; }
        .fpo-hsn-trigger-icons { display:flex; align-items:center; gap:3px; flex-shrink:0; color:#64748b; }
        .fpo-hsn-clear-icon { display:flex; align-items:center; cursor:pointer; color:#94a3b8; padding:1px; border-radius:2px; }
        .fpo-hsn-clear-icon:hover { color:#ef4444; }
        .fpo-hsn-desc-hint { margin:3px 0 0; font-size:10px; color:#7c3aed; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; line-height:1.3; }
        .fpo-hsn-panel { background:#fff; border:1px solid #c4b5fd; border-radius:10px; box-shadow:0 10px 30px rgba(124,58,237,.18); animation:ddSlide .15s ease; overflow:hidden; }
        .fpo-hsn-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #ede9fe; background:#faf5ff; }
        .fpo-hsn-search-input { flex:1; border:none; outline:none; font-size:12.5px; font-family:'DM Sans',sans-serif; color:#1e293b; background:transparent; }
        .fpo-hsn-count { padding:4px 10px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; background:#faf5ff; }
        .fpo-hsn-kbd { display:inline-block; background:#e2e8f0; color:#475569; border-radius:3px; padding:0 4px; font-size:10px; font-family:'DM Mono',monospace; font-style:normal; border:1px solid #cbd5e1; }
        .fpo-hsn-list { max-height:232px; overflow-y:auto; }
        .fpo-hsn-list::-webkit-scrollbar { width:5px; }
        .fpo-hsn-list::-webkit-scrollbar-thumb { background:#c4b5fd; border-radius:3px; }
        .fpo-hsn-option { padding:8px 12px; cursor:pointer; border-bottom:1px solid #f8f5ff; }
        .fpo-hsn-option:last-child { border-bottom:none; }
        .fpo-hsn-option:hover { background:#faf5ff; }
        .fpo-hsn-option.selected { background:#f5f3ff; }
        .fpo-hsn-option.fpo-hsn-clear-opt { font-size:12px; color:#64748b; font-style:italic; border-bottom:1px solid #ede9fe; }
        .fpo-hsn-opt-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:2px; }
        .fpo-hsn-opt-code { font-family:'DM Mono',monospace; font-weight:700; font-size:12px; color:#7c3aed; }
        .fpo-hsn-opt-desc { font-size:11px; color:#64748b; line-height:1.4; }
        .fpo-hsn-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }

        .fpo-gst-section { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-top:10px; }
        .fpo-gst-grid { display:grid; grid-template-columns:1fr; gap:12px; margin-bottom:12px; }
        @media(min-width:576px){ .fpo-gst-grid { grid-template-columns:repeat(3,1fr); } }
        .fpo-gst-row { display:flex; align-items:center; gap:8px; }
        .fpo-gst-label { width:38px; font-size:13px; font-weight:700; color:#475569; flex-shrink:0; }
        .fpo-gst-input { width:68px; border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; text-align:right; outline:none; background:#fff; flex-shrink:0; }
        .fpo-gst-input:focus { border-color:#7c3aed; }
        .fpo-gst-pct { font-size:12px; color:#94a3b8; flex-shrink:0; }
        .fpo-gst-amt { margin-left:auto; font-family:'DM Mono',monospace; font-size:13px; color:#334155; }
        .fpo-sub-row { display:flex; align-items:center; justify-content:space-between; border-top:1px solid #e2e8f0; padding-top:8px; margin-top:4px; }
        .fpo-sub-label { font-size:13px; color:#475569; }
        .fpo-sub-val { font-size:14px; font-weight:700; color:#334155; font-family:'DM Mono',monospace; }
        .fpo-net-row { display:flex; align-items:center; justify-content:space-between; border-top:2px solid #7c3aed; padding-top:10px; margin-top:8px; }
        .fpo-net-label { font-size:15px; font-weight:700; color:#1e293b; }
        .fpo-net-val { font-size:20px; font-weight:800; color:#7c3aed; font-family:'DM Sans',sans-serif; }

        .fpo-cancel-btn { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .fpo-cancel-btn:hover { background:#f1f5f9; }
        .fpo-save-btn { display:flex; align-items:center; gap:6px; padding:9px 24px; border:none; background:#16a34a; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,.3); }
        .fpo-save-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fpo-save-btn:hover:not(:disabled) { background:#15803d; }
        .fpo-update-btn { display:flex; align-items:center; gap:6px; padding:9px 24px; border:none; background:#0f766e; color:#fff; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,.3); }
        .fpo-update-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fpo-update-btn:hover:not(:disabled) { background:#0d6b63; }

        .fpo-ok-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:12px; }
        .fpo-ok-icon { width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:30px; }
        .fpo-ok-title { font-size:18px; font-weight:700; color:#1e293b; margin:0; }
        .fpo-ok-code { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#7c3aed; margin:0; }
        .fpo-ok-close { margin-top:12px; padding:9px 24px; border:none; border-radius:8px; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-spinner-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:16px; }
        .fpo-spinner { width:36px; height:36px; border:4px solid #e2e8f0; border-top-color:#7c3aed; border-radius:50%; animation:spin .8s linear infinite; }
        .fpo-spinner-text { font-size:14px; color:#64748b; }

        .fpo-sup-wrap { position:relative; }
        .fpo-sup-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:0 10px 0 12px; height:40px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#1e293b; font-size:13px; font-family:'DM Sans',sans-serif; cursor:pointer; outline:none; text-align:left; transition:border-color .15s, box-shadow .15s; }
        .fpo-sup-trigger:hover { border-color:#7c3aed; }
        .fpo-sup-trigger.open { border-color:#7c3aed; box-shadow:0 0 0 3px rgba(124,58,237,.12); }
        .fpo-sup-trigger.has-value { border-color:#c4b5fd; background:#faf5ff; }
        .fpo-sup-trigger:disabled { background:#f8fafc; color:#94a3b8; cursor:not-allowed; }
        .fpo-sup-content { flex:1; overflow:hidden; min-width:0; }
        .fpo-sup-placeholder { color:#9ca3af; }
        .fpo-sup-selected { display:flex; align-items:center; gap:8px; overflow:hidden; }
        .fpo-sup-badge { background:#7c3aed; color:#fff; border-radius:5px; padding:2px 8px; font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; font-family:'DM Mono',monospace; }
        .fpo-plan-badge { background:#0f766e; color:#fff; border-radius:5px; padding:2px 8px; font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; font-family:'DM Mono',monospace; }
        .fpo-sup-clear { display:flex; align-items:center; padding:0 2px; cursor:pointer; color:#94a3b8; }
        .fpo-sup-panel { position:absolute; top:100%; left:0; right:0; z-index:400; background:#fff; border:1px solid #c4b5fd; border-top:none; border-bottom-left-radius:8px; border-bottom-right-radius:8px; box-shadow:0 8px 24px rgba(124,58,237,.13); animation:ddSlide .15s ease; }
        .fpo-sup-search-wrap { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #ede9fe; background:#faf5ff; }
        .fpo-sup-search { flex:1; border:none; outline:none; font-size:12.5px; font-family:'DM Sans',sans-serif; color:#1e293b; background:transparent; }
        .fpo-sup-count { padding:4px 12px; font-size:11px; color:#94a3b8; font-weight:600; border-bottom:1px solid #f1f5f9; background:#faf5ff; }
        .fpo-sup-list { max-height:260px; overflow-y:auto; }
        .fpo-sup-list::-webkit-scrollbar { width:4px; }
        .fpo-sup-list::-webkit-scrollbar-thumb { background:#c4b5fd; border-radius:2px; }
        .fpo-sup-option { display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; border-bottom:1px solid #f8f5ff; }
        .fpo-sup-option:last-child { border-bottom:none; }
        .fpo-sup-option:hover { background:#faf5ff; }
        .fpo-sup-option.selected { background:#f5f3ff; }
        .fpo-sup-option.fpo-sup-clear-opt { color:#64748b; font-size:12px; font-style:italic; border-bottom:1px solid #ede9fe; }
        .fpo-sup-option.fpo-sup-clear-opt:hover { background:#f8fafc; }
        .fpo-sup-opt-left { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
        .fpo-sup-opt-name { font-size:13px; color:#1e293b; font-weight:500; }
        .fpo-sup-opt-meta { display:flex; align-items:center; gap:6px; flex-shrink:0; }
        .fpo-sup-code { background:#ede9fe; color:#7c3aed; border-radius:4px; padding:1px 6px; font-size:10px; font-weight:700; }
        .fpo-sup-city { font-size:11px; color:#94a3b8; }
        .fpo-sup-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; color:#94a3b8; font-size:12.5px; }
        .fpo-sup-status { font-size:11px; margin-top:4px; color:#7c3aed; font-weight:700; display:flex; align-items:center; font-family:'DM Mono',monospace; }

        .fpo-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .fpo-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
        .fpo-confirm-icon { font-size:40px; margin-bottom:12px; }
        .fpo-confirm-title { font-size:17px; font-weight:700; color:#1e293b; margin:0 0 8px; }
        .fpo-confirm-sub { font-size:13px; color:#64748b; margin:0 0 24px; line-height:1.6; }
        .fpo-confirm-actions { display:flex; gap:10px; justify-content:center; }
        .fpo-confirm-cancel { padding:9px 22px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-confirm-cancel:hover { background:#f1f5f9; }
        .fpo-confirm-del { padding:9px 22px; border:none; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-confirm-del:disabled { background:#fca5a5; cursor:not-allowed; }

        input:focus, select:focus, textarea:focus { outline:none; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="fpo-wrap">

        {/* ── Page Header ── */}
        <div className="fpo-page-header">
          <div>
            <h1>Fabric Purchase Orders</h1>
            <p>{total} order{total !== 1 ? "s" : ""}</p>
          </div>
          <div className="fpo-header-actions">
            <ExportMenu onCSV={handleExportCSV} onExcel={handleExportExcel} onPrint={handlePrintList} />
            <div className="fpo-btn-divider" />
            <button className="fpo-new-btn" onClick={handleNewFpo}>
              <Plus size={15} /> New FPO
            </button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="fpo-toolbar">
          <div className="fpo-search-wrap">
            <Search size={14} color="#94a3b8" />
            <input className="fpo-search" type="text"
              placeholder="Search FPO no, supplier, plan no…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="fpo-rec-count">{total} record(s)</span>
        </div>

        {/* ── Table ── */}
        <div className="fpo-card">
          <div className="fpo-table-wrap">
            <table className="fpo-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>FPO No</th>
                  <th>FPO Date</th>
                  <th>Supplier</th>
                  {width >= 640  && <th>Plan No</th>}
                  {width >= 768  && <th>Order No</th>}
                  {width >= 768  && <th className="th-r">Purchase Qty</th>}
                  {width >= 960  && <th>Billing From</th>}
                  {width >= 960  && <th>Pay Terms</th>}
                  {width >= 1024 && <th>Rate Type</th>}
                  <th className="th-r">Net Value</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="fpo-empty">
                    <Loader2 size={22} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                  </td></tr>
                ) : fpos.length === 0 ? (
                  <tr><td colSpan={12} className="fpo-empty">
                    {search ? "No FPOs match your search." : 'No FPOs yet. Click "New FPO" to create one.'}
                  </td></tr>
                ) : fpos.map((o, i) => (
                  <tr key={o.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                    <td><span className="fpo-fpo-no">{o.fpo_no}</span></td>
                    <td style={{ color: "#64748b" }}>{o.fpo_date ? fmtDate(o.fpo_date) : "—"}</td>
                    <td style={{ fontWeight: 600 }}>{o.supplier}</td>
                    {width >= 640  && <td><span className="fpo-plan-rec">{o.plan_rec_no || "—"}</span></td>}
                    {width >= 768  && <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{o.order_no || "—"}</td>}
                    {width >= 768  && <td className="fpo-td-num">{o.purchase_qty ? fmt(Number(o.purchase_qty)) : "—"}</td>}
                    {width >= 960  && <td>{o.billing_from}</td>}
                    {width >= 960  && <td>{o.pay_terms}</td>}
                    {width >= 1024 && <td>{o.rate_type}</td>}
                    <td className="fpo-td-num" style={{ fontWeight: 700, color: "#7c3aed" }}>
                      ₹{fmt(Number(o.net_value) || 0)}
                    </td>
                    <td className="fpo-td-c">
                      <div className="fpo-action-group">
                        <button className="fpo-edit-btn" onClick={() => handleOpenEdit(o)}>✏️ Edit</button>
                        <button className="fpo-print-row-btn" onClick={() => handlePrintFpo(o)}><Printer size={12} /></button>
                        <button className="fpo-del-btn" onClick={() => { setDeleteTarget(o); setDeleteError(""); }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="fpo-pg-bar">
              <span>Page {page} of {totalPages} — {total} record(s)</span>
              <div className="fpo-pg-btns">
                <button className="fpo-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="fpo-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`fpo-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="fpo-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="fpo-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ════ CREATE MODAL ════ */}
        {showModal && (
          <div className="fpo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="fpo-modal">
              <div className="fpo-modal-header fpo-modal-header--create">
                <div>
                  <h2 className="fpo-modal-title">➕ New Fabric Purchase Order</h2>
                  <p className="fpo-modal-subtitle">{form.fpo_no || "Generating FPO No…"}</p>
                </div>
                <button className="fpo-modal-close-btn" onClick={handleClose}><X size={22} color="#fff" /></button>
              </div>

              {savedCode ? (
                <div className="fpo-ok-wrap">
                  <div className="fpo-ok-icon" style={{ background: "#dcfce7" }}>✅</div>
                  <p className="fpo-ok-title">FPO Saved Successfully!</p>
                  <p className="fpo-ok-code">{savedCode}</p>
                  <button className="fpo-ok-close" style={{ background: "#7c3aed" }} onClick={handleClose}>Close</button>
                </div>
              ) : (
                <>
                  {renderFormBody(
                    form, setForm, updateItem, addItem, removeItem, ct,
                    saveError, saving, false, handleSave, handleClose,
                    formSec, setFormSec, fpoGenerating, fpoGenError,
                  )}
                  <div className="fpo-modal-footer">
                    <button className="fpo-cancel-btn" onClick={handleClose}>Cancel</button>
                    <button className="fpo-save-btn" onClick={handleSave} disabled={saving}>
                      {saving
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                        : "💾 Save FPO"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════ EDIT MODAL ════ */}
        {showEditModal && (
          <div className="fpo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleEditClose(); }}>
            <div className="fpo-modal">
              <div className="fpo-modal-header fpo-modal-header--edit">
                <div>
                  <h2 className="fpo-modal-title">✏️ Edit FPO — {editFpo?.fpo_no ?? "…"}</h2>
                  {editFpo?.fpo_date && (
                    <p className="fpo-modal-subtitle">{fmtDate(editFpo.fpo_date)}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {editFpo && !editLoadingData && (
                    <button
                      style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.4)", color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans',sans-serif" }}
                      onClick={() => handlePrintFpo({ ...editForm, items: editForm.items ?? [] })}
                    >
                      <Printer size={13} /> Print
                    </button>
                  )}
                  <button className="fpo-modal-close-btn" onClick={handleEditClose}><X size={22} color="#fff" /></button>
                </div>
              </div>

              {editLoadingData ? (
                <div className="fpo-spinner-wrap">
                  <div className="fpo-spinner" />
                  <span className="fpo-spinner-text">Loading FPO details…</span>
                </div>
              ) : editSuccess ? (
                <div className="fpo-ok-wrap">
                  <div className="fpo-ok-icon" style={{ background: "#ccfbf1" }}>✅</div>
                  <p className="fpo-ok-title">FPO Updated Successfully!</p>
                  <p className="fpo-ok-code">{editFpo?.fpo_no}</p>
                  <button className="fpo-ok-close" style={{ background: "#0f766e" }} onClick={handleEditClose}>Close</button>
                </div>
              ) : (
                <>
                  {renderFormBody(
                    editForm, setEditForm, updateEditItem, addEditItem, removeEditItem, ect,
                    editError, editSaving, true, handleUpdate, handleEditClose,
                    editSec, setEditSec, editFpoGenerating, editFpoGenError,
                  )}
                  <div className="fpo-modal-footer">
                    <button className="fpo-cancel-btn" onClick={handleEditClose}>Cancel</button>
                    <button className="fpo-update-btn" onClick={handleUpdate} disabled={editSaving}>
                      {editSaving
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                        : "✏️ Update FPO"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════ DELETE CONFIRM ════ */}
        {deleteTarget && (
          <div className="fpo-confirm-overlay">
            <div className="fpo-confirm-box">
              <div className="fpo-confirm-icon">🗑️</div>
              <p className="fpo-confirm-title">Delete FPO?</p>
              <p className="fpo-confirm-sub">
                This will permanently delete <strong>{deleteTarget.fpo_no}</strong> and all its line items.
                {deleteTarget.plan_id ? ` Plan ${deleteTarget.plan_rec_no} will reappear in the pending-purchase list.` : ""}
                {" "}This action cannot be undone.
              </p>
              {deleteError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  ⚠ {deleteError}
                </div>
              )}
              <div className="fpo-confirm-actions">
                <button className="fpo-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="fpo-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
                  {deleteConfirming
                    ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite", display: "inline-block", verticalAlign: "middle", marginRight: 5 }} />Deleting…</>
                    : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}