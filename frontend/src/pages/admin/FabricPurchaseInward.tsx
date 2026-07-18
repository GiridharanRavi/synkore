import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFabricPurchaseInwards,
  getFabricPurchaseInwardById,
  createFabricPurchaseInward,
  updateFabricPurchaseInward,
  deleteFabricPurchaseInward,
  getNextFpiNo,
  getFabricPurchaseOrders,
  getFabricPurchaseOrderById,
  FabricPurchaseInwardPayload,
  FpiItem,
} from "../../api/services";

import {
  Plus, Search, X, Loader2, AlertCircle, CheckCircle2,
  Info, AlertTriangle, Trash2, PlusCircle, Printer, Download, ChevronDown, ChevronUp,
  FileText, FileSpreadsheet,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FpiItemEx extends FpiItem {
  meter: number;
  piece_no: string;
  new_piece_no: string;
}

interface FpiPayload extends FabricPurchaseInwardPayload {
  purchase_invoice_no?: string;
}

interface FpoOption {
  id: number;
  fpo_no: string;
  supplier: string;
  sort_no?: string;
  purchase_qty?: number;
  items?: { meter?: number }[];
}

// ─── Toast ───────────────────────────────────────────────────────────────────

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
    <div className="fpi-toast-wrap">
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} className="fpi-toast" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <span className="fpi-toast-icon">{c.icon}</span>
            <div className="fpi-toast-body">
              <p className="fpi-toast-title" style={{ color: c.color }}>{t.title}</p>
              {t.message && <p className="fpi-toast-msg" style={{ color: c.color }}>{t.message}</p>}
            </div>
            <button className="fpi-toast-close" onClick={() => onRemove(t.id)} style={{ color: c.color }}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Field Type Badge (matches FabricPurchaseOrders format) ─────────────────

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

// ─── Inward Status (Order Meter vs Inward Meter) ────────────────────────────
// pending    → no meters inward yet
// partial    → some, but less than the FPO's ordered quantity
// completed  → inward meter matches the FPO's ordered quantity (within tolerance)
// over       → inward meter exceeds the FPO's ordered quantity
// no_fpo     → this FPI isn't linked to any FPO, so there's nothing to compare against

type InwardStatus = "pending" | "partial" | "completed" | "over" | "no_fpo";

function getInwardStatus(fpoTotal: number, inwardTotal: number): InwardStatus {
  if (fpoTotal <= 0) return "no_fpo";
  if (inwardTotal <= 0) return "pending";
  const ratio = inwardTotal / fpoTotal;
  if (ratio > 1.001) return "over";
  if (ratio >= 0.999) return "completed";
  return "partial";
}

const STATUS_CFG: Record<InwardStatus, { label: string; bg: string; color: string }> = {
  pending:   { label: "Pending",     bg: "#fef3c7", color: "#92400e" },
  partial:   { label: "Partial",     bg: "#dbeafe", color: "#1d4ed8" },
  completed: { label: "Completed",   bg: "#dcfce7", color: "#166534" },
  over:      { label: "Over Inward", bg: "#fee2e2", color: "#b91c1c" },
  no_fpo:    { label: "No FPO",      bg: "#f1f5f9", color: "#64748b" },
};

function StatusBadge({ status }: { status: InwardStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, background: c.bg, color: c.color,
      letterSpacing: "0.02em", whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

// ✅ FIX: converts any DB date to yyyy-MM-dd for <input type="date">
const toInputDate = (raw?: string | null): string => {
  if (!raw) return today();
  const s = String(raw).trim();
  if (!s || s === "null") return today();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;          // already correct
  const d = new Date(s);                                  // handles ISO "2026-06-19T18:30:00.000Z"
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return today();
};

// Display format dd/mm/yyyy for table
const fmtDate = (raw?: string | null): string => {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s || s === "null") return "—";
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

// ─── Export helpers (FabricPurchaseOrders format: column map + standalone fns) ─

const FPI_EXPORT_COLUMNS = [
  { key: "fpi_no",              label: "FPI No" },
  { key: "fpi_date",            label: "FPI Date" },
  { key: "fpo_no",              label: "FPO No" },
  { key: "supplier",            label: "Supplier" },
  { key: "inward_to",           label: "Inward To" },
  { key: "vehicle_no",          label: "Vehicle No" },
  { key: "dc_no",               label: "DC No" },
  { key: "dc_date",             label: "DC Date" },
  { key: "sort_no",             label: "Sort No" },
  { key: "lot_no",              label: "Lot No" },
  { key: "purchase_invoice_no", label: "Purchase Invoice No" },
  { key: "remarks",             label: "Remarks" },
  { key: "total_meters",        label: "Total Meters" },
];

function doExportCSV(data: FpiPayload[]) {
  const header = FPI_EXPORT_COLUMNS.map(c => c.label).join(",");
  const rows = data.map(row =>
    FPI_EXPORT_COLUMNS.map(c => {
      const val = String((row as any)[c.key] ?? "").replace(/"/g, '""');
      return `"${val}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FPI_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function doExportExcel(data: FpiPayload[]) {
  const cols = FPI_EXPORT_COLUMNS;
  const headerRow = cols.map(c =>
    `<th style="background:#0f766e;color:#fff;padding:8px 10px;font-weight:bold;">${c.label}</th>`
  ).join("");
  const bodyRows = data.map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#f0fdfa"}">` +
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
  a.download = `FPI_Export_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function doPrintTable(data: FpiPayload[]) {
  const rows = data.map((o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="mono bold teal">${o.fpi_no ?? "—"}</td>
      <td>${fmtDate(o.fpi_date)}</td>
      <td class="bold cyan">${o.fpo_no || "—"}</td>
      <td>${o.supplier ?? "—"}</td>
      <td>${o.inward_to || "—"}</td>
      <td>${o.dc_no || "—"}</td>
      <td>${fmtDate(o.dc_date)}</td>
      <td>${o.lot_no || "—"}</td>
      <td class="mono">${(o as FpiPayload).purchase_invoice_no || "—"}</td>
      <td class="right mono bold">${fmt(Number(o.total_meters) || 0)} M</td>
    </tr>`).join("");

  const win = window.open("", "_blank", "width=1100,height=750");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Fabric Purchase Inward — Print List</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#1e293b; padding:24px 28px; }
  .hdr { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
  .hdr-title { font-size:20px; font-weight:800; color:#0f766e; }
  .hdr-sub { font-size:11px; color:#64748b; margin-top:3px; }
  .hdr-meta { text-align:right; font-size:11px; color:#64748b; }
  .hdr-meta .date { font-weight:700; color:#1e293b; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  thead tr { background:#0f766e; }
  th { padding:9px 10px; color:#fff; font-weight:700; font-size:11px; text-align:left; white-space:nowrap; }
  th.right { text-align:right; }
  tbody tr:nth-child(odd) td  { background:#fff; }
  tbody tr:nth-child(even) td { background:#f0fdfa; }
  td { padding:8px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; white-space:nowrap; }
  .mono  { font-family:'Courier New',monospace; }
  .bold  { font-weight:700; }
  .teal  { color:#0f766e; }
  .cyan  { color:#0e7490; }
  .right { text-align:right; }
  .footer { margin-top:18px; font-size:10px; color:#94a3b8; text-align:right; }
  @media print { body { padding:12px; } }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <div class="hdr-title">Fabric Purchase Inward</div>
      <div class="hdr-sub">Manage &amp; create fabric purchase inward records</div>
    </div>
    <div class="hdr-meta">
      <div class="date">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
      <div>${data.length} record(s)</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>FPI No</th><th>FPI Date</th><th>FPO No</th>
        <th>Supplier</th><th>Inward To</th><th>DC No</th><th>DC Date</th>
        <th>Lot No</th><th>Purchase Invoice No</th><th class="right">Total Meters</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Printed on ${new Date().toLocaleString("en-IN")}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
  win.document.close();
}

// ─── Factories ───────────────────────────────────────────────────────────────

const emptyItem = (): FpiItemEx => ({ meter: 0, piece_no: "", new_piece_no: "" });

const defaultForm = (): FpiPayload => ({
  fpi_no:              "",
  fpi_date:            today(),
  fpo_no:              "",
  vehicle_no:          "",
  supplier:            "",
  inward_to:           "",
  sort_no:             "",
  remarks:             "",
  dc_no:               "",
  dc_date:             today(),
  lot_no:              "",
  total_meters:        0,
  purchase_invoice_no: "",
  items:               [emptyItem()],
});

// ✅ FIX: sanitize DB data — converts null → "" and fixes date formats
const sanitizeForm = (data: any): FpiPayload => ({
  ...data,
  fpi_no:              String(data.fpi_no              ?? ""),
  fpo_no:              String(data.fpo_no              ?? ""),
  vehicle_no:          String(data.vehicle_no          ?? ""),
  supplier:            String(data.supplier            ?? ""),
  inward_to:           String(data.inward_to           ?? ""),
  sort_no:             String(data.sort_no             ?? ""),
  remarks:             String(data.remarks             ?? ""),
  dc_no:               String(data.dc_no               ?? ""),
  lot_no:              String(data.lot_no               ?? ""),
  purchase_invoice_no: String(data.purchase_invoice_no ?? ""),
  fpi_date:            toInputDate(data.fpi_date),
  dc_date:             toInputDate(data.dc_date),
  total_meters:        Number(data.total_meters)       || 0,
  items:               data.items?.length
    ? data.items.map((it: any) => ({
        meter:        Number(it.meter        ?? 0),
        piece_no:     String(it.piece_no     ?? ""),
        new_piece_no: String(it.new_piece_no ?? ""),
      }))
    : [emptyItem()],
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

// ─── FPO Search-Select ───────────────────────────────────────────────────────

function FpoSearchSelect({
  value,
  fpoOptions,
  loadingFpos,
  onSelect,
}: {
  value: string;
  fpoOptions: FpoOption[];
  loadingFpos: boolean;
  onSelect: (fpo: FpoOption | null) => void;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [open,  setOpen]  = useState(false);
  const wrapRef           = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value ?? ""); }, [value]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const filtered = fpoOptions.filter(f =>
    (f.fpo_no ?? "").toLowerCase().includes((query ?? "").toLowerCase()) ||
    (f.supplier ?? "").toLowerCase().includes((query ?? "").toLowerCase())
  );

  const handleSelect = (fpo: FpoOption) => {
    setQuery(fpo.fpo_no ?? "");
    setOpen(false);
    onSelect(fpo);
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    onSelect(null);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          className="fpi-input"
          type="text"
          placeholder={loadingFpos ? "Loading FPOs…" : "Search FPO No or supplier…"}
          value={query ?? ""}
          disabled={loadingFpos}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ paddingRight: 56 }}
        />
        {query && (
          <button type="button" onClick={handleClear}
            style={{ position: "absolute", right: 28, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "#94a3b8" }}>
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} style={{ position: "absolute", right: 10, color: "#94a3b8", pointerEvents: "none" }} />
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,.12)", zIndex: 500,
          maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              {loadingFpos ? "Loading…" : "No FPOs found"}
            </div>
          ) : filtered.map(fpo => (
            <button key={fpo.id} type="button" onClick={() => handleSelect(fpo)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", borderBottom: "1px solid #f1f5f9" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0fdfa")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "#0f766e", fontSize: 13 }}>{fpo.fpo_no}</span>
              <span style={{ color: "#64748b", fontSize: 12, marginLeft: 10 }}>{fpo.supplier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FField (FabricPurchaseOrders format: `type` drives FTypeBadge) ─────────

function FField({ label, type, required, hint, children }: {
  label: string; type?: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="fpi-label">
        {label}
        {required && <span className="fpi-required"> *</span>}
        {type && <FTypeBadge type={type} />}
      </label>
      {children}
      {hint && <p className="fpi-hint">{hint}</p>}
    </div>
  );
}

// ─── SectionHead (FabricPurchaseOrders format: collapsible, chevron toggle) ─

function SectionHead({
  title, open, onToggle, accent,
}: {
  title: string; open: boolean; onToggle: () => void; accent?: string;
}) {
  return (
    <div
      className="fpi-section-head"
      style={{ borderLeft: `4px solid ${accent ?? "#0f766e"}` }}
      onClick={onToggle}
    >
      <span className="fpi-section-title">{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── Export / Print dropdown ─────────────────────────────────────────────────
// Single "Export" trigger with a chevron that opens a flyout offering CSV
// export, Excel export, and a print-friendly table view — same pattern used
// across other Fabric Flow list pages, themed in this module's teal.
interface ExportMenuProps {
  onCSV: () => void;
  onExcel: () => void;
  onPrint: () => void;
  disabled?: boolean;
}

function ExportMenu({ onCSV, onExcel, onPrint, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const items: { label: string; icon: React.ReactNode; action: () => void }[] = [
    { label: "Export as CSV",   icon: <FileText size={15} color="#0f766e" />,        action: onCSV },
    { label: "Export as Excel", icon: <FileSpreadsheet size={15} color="#16a34a" />, action: onExcel },
    { label: "Print Table",     icon: <Printer size={15} color="#2563eb" />,         action: onPrint },
  ];

  return (
    <div ref={ref} className="fpi-export-wrap">
      <button
        type="button"
        className="fpi-export-btn"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      >
        <Download size={14} /> Export
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div className="fpi-export-menu">
          <div className="fpi-export-menu-label">Export / Print</div>
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              className="fpi-export-item"
              onClick={() => { it.action(); setOpen(false); }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function FabricPurchaseInward() {
  const { toasts, push: pushToast, remove: removeToast } = useToast();

  const [fpis,    setFpis]    = useState<FpiPayload[]>([]);
  const [allFpis, setAllFpis] = useState<FpiPayload[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const [limit,   setLimit]   = useState(10);
  const ENTRY_OPTIONS = [10, 25, 50, 100];

  // FPO options
  const [fpoOptions,  setFpoOptions]  = useState<FpoOption[]>([]);
  const [loadingFpos, setLoadingFpos] = useState(false);

  // Create modal
  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState<FpiPayload>(defaultForm());
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState("");
  const [savedCode,     setSavedCode]     = useState("");
  const [fpiGenerating, setFpiGenerating] = useState(false);
  const [fpiGenError,   setFpiGenError]   = useState("");
  const [fpoAutofilling,setFpoAutofilling]= useState(false);
  const [formSec, setFormSec] = useState({ details: true, items: true });

  // Edit modal
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [editLoadingData, setEditLoadingData] = useState(false);
  const [editFpi,         setEditFpi]         = useState<FpiPayload | null>(null);
  const [editForm,        setEditForm]        = useState<FpiPayload>(defaultForm());
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState("");
  const [editSuccess,     setEditSuccess]     = useState(false);
  const [editFpoAutofill, setEditFpoAutofill] = useState(false);
  const [editSec, setEditSec] = useState({ details: true, items: true });

  // Delete
  const [deleteTarget,     setDeleteTarget]     = useState<FpiPayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError,      setDeleteError]      = useState("");

  const width    = useWidth();
  const isMobile = width < 576;

  // Block scroll when modal open
  useEffect(() => {
    document.body.style.overflow = (showModal || showEditModal) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal, showEditModal]);

  // Fetch FPO list once
  useEffect(() => {
    (async () => {
      setLoadingFpos(true);
      try {
        const res = await getFabricPurchaseOrders();
        const list: FpoOption[] = res.data ?? res;
        setFpoOptions(list);
      } catch { /* ignore */ }
      finally { setLoadingFpos(false); }
    })();
  }, []);

  // Fetch FPI list
  const fetchFpis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFabricPurchaseInwards();
      const all: FpiPayload[] = res.data ?? res;
      setAllFpis(all);
      const filtered = search
        ? all.filter(f =>
            (f.fpi_no ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (f.supplier ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (f.fpo_no ?? "").toLowerCase().includes(search.toLowerCase()) ||
            ((f as FpiPayload).purchase_invoice_no ?? "").toLowerCase().includes(search.toLowerCase())
          )
        : all;
      const start = (page - 1) * limit;
      setFpis(filtered.slice(start, start + limit));
      setTotal(filtered.length);
    } catch {}
    finally { setLoading(false); }
  }, [page, search, limit]);

  useEffect(() => { fetchFpis(); }, [fetchFpis]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { setPage(1); }, [limit]);

  // ── FPO Total Meter lookup — total ordered meter for a given FPO No ──────
  // Used to compare "Order Meter" vs "Inward Meter" both in the table (per
  // row status) and inside the create/edit form (live comparison box).
  const getFpoTotalMeter = useCallback((fpoNo?: string | null): number => {
    if (!fpoNo) return 0;
    const fpo = fpoOptions.find(f => f.fpo_no === fpoNo);
    if (!fpo) return 0;
    if (fpo.items && fpo.items.length) {
      return +fpo.items.reduce((s, it) => s + (Number(it.meter) || 0), 0).toFixed(2);
    }
    return +(Number(fpo.purchase_qty) || 0).toFixed(2);
  }, [fpoOptions]);

  // ── ✅ FIX: FPO autofill — reads fpo_items, null-safe everything ──────────
  const handleFpoSelect = async (
    fpo: FpoOption | null,
    setter: React.Dispatch<React.SetStateAction<FpiPayload>>,
    setAutofilling: (v: boolean) => void,
  ) => {
    if (!fpo) {
      setter(f => ({ ...f, fpo_no: "", supplier: "", sort_no: "", items: [emptyItem()], total_meters: 0 }));
      return;
    }

    // Immediately apply list-level data
    setter(f => ({ ...f, fpo_no: fpo.fpo_no ?? "", supplier: fpo.supplier ?? "" }));
    setAutofilling(true);

    try {
      const res  = await getFabricPurchaseOrderById(fpo.id);
      const data = res?.data ?? res;

      // Resolve items array — try every common key
      const fpoItems: any[] =
        data.items      ??
        data.fpo_items  ??
        data.details    ??
        data.orderItems ??
        [];

      // ✅ Sort No: header first, then first item, then list-level fallback
      const sortNo: string = String(
        data.sort_no             ??
        data.sortNo              ??
        data.sort_number         ??
        data.plan_no             ??
        fpoItems[0]?.sort_no     ??
        fpoItems[0]?.sortNo      ??
        fpoItems[0]?.sort_number ??
        fpo.sort_no              ??
        ""
      );

      const supplierVal: string = String(
        data.supplier      ??
        data.supplierName  ??
        data.supplier_name ??
        fpo.supplier       ??
        ""
      );

      // Build FPI items from FPO items — null-safe
      const newItems: FpiItemEx[] = fpoItems.length > 0
        ? fpoItems.map((it: any) => ({
            meter:        Number(it.meter ?? it.quantity ?? it.purchase_qty ?? 0),
            piece_no:     String(it.piece_no     ?? it.pieceNo     ?? ""),
            new_piece_no: String(it.new_piece_no ?? it.newPieceNo  ?? ""),
          }))
        : [{ meter: Number(data.purchase_qty ?? data.total_meters ?? 0), piece_no: "", new_piece_no: "" }];

      const totalMeters = +newItems.reduce((s, i) => s + i.meter, 0).toFixed(2);

      setter(f => ({
        ...f,
        fpo_no:       String(data.fpo_no ?? fpo.fpo_no ?? ""),
        supplier:     supplierVal,
        sort_no:      sortNo,
        items:        newItems,
        total_meters: totalMeters,
      }));

    } catch (err) {
      console.error("FPO fetch failed:", err);
      setter(f => ({
        ...f,
        fpo_no:   String(fpo.fpo_no   ?? ""),
        supplier: String(fpo.supplier ?? ""),
        sort_no:  String(fpo.sort_no  ?? ""),
      }));
    } finally {
      setAutofilling(false);
    }
  };

  // Item operations
  const makeUpdateItem = (setter: React.Dispatch<React.SetStateAction<FpiPayload>>) =>
    (idx: number, patch: Partial<FpiItemEx>) =>
      setter(f => {
        const items = [...f.items] as FpiItemEx[];
        items[idx] = { ...items[idx], ...patch };
        const total_meters = +items.reduce((s, i) => s + (Number(i.meter) || 0), 0).toFixed(2);
        return { ...f, items, total_meters };
      });

  const makeAddItem = (setter: React.Dispatch<React.SetStateAction<FpiPayload>>) =>
    () => setter(f => ({ ...f, items: [...f.items, emptyItem()] }));

  const makeRemoveItem = (setter: React.Dispatch<React.SetStateAction<FpiPayload>>) =>
    (idx: number) => setter(f => {
      const items = f.items.filter((_, i) => i !== idx);
      const total_meters = +(items as FpiItemEx[]).reduce((s, i) => s + (Number(i.meter) || 0), 0).toFixed(2);
      return { ...f, items, total_meters };
    });

  const updateItem     = makeUpdateItem(setForm);
  const updateEditItem = makeUpdateItem(setEditForm);
  const addItem        = makeAddItem(setForm);
  const addEditItem    = makeAddItem(setEditForm);
  const removeItem     = makeRemoveItem(setForm);
  const removeEditItem = makeRemoveItem(setEditForm);

  const calcTotal = (f: FpiPayload) =>
    +(f.items as FpiItemEx[]).reduce((s, i) => s + (Number(i.meter) || 0), 0).toFixed(2);

  const ct  = useMemo(() => calcTotal(form),     [form]);
  const ect = useMemo(() => calcTotal(editForm),  [editForm]);

  // Auto-generate FPI No (FPI-YYYY-001)
  const generateFpiNo = async (
    setter: React.Dispatch<React.SetStateAction<FpiPayload>>,
    setGen: (v: boolean) => void,
    setGenErr: (v: string) => void,
  ) => {
    setGen(true); setGenErr("");
    try {
      const res: any = await getNextFpiNo();
      const payload = res?.data ?? res;
      const no: string = payload?.fpi_no ?? payload?.next_fpi_no ?? "";
      if (!no) throw new Error("Empty FPI No");
      setter(f => ({ ...f, fpi_no: no }));
    } catch {
      const yr = new Date().getFullYear();
      const ts = Date.now().toString().slice(-3).padStart(3, "0");
      setter(f => ({ ...f, fpi_no: `FPI-${yr}-${ts}` }));
      setGenErr("Server unavailable — used local fallback. Verify before saving.");
    } finally { setGen(false); }
  };

  // Open create
  const handleNewFpi = async () => {
    setForm(defaultForm());
    setSaveError(""); setSavedCode(""); setFpiGenError("");
    setFormSec({ details: true, items: true });
    setShowModal(true);
    await generateFpiNo(setForm, setFpiGenerating, setFpiGenError);
  };

  // Create save
  const handleSave = async () => {
    setSaveError("");
    if (!form.fpi_no || !form.supplier) { setSaveError("FPI No and Supplier are required."); return; }
    setSaving(true);
    try {
      const payload = { ...form, total_meters: ct };
      const res: any = await createFabricPurchaseInward(payload);
      setSavedCode(res.fpi_no ?? res.data?.fpi_no ?? form.fpi_no);
      pushToast("success", "FPI Created", `FPI "${form.fpi_no}" created successfully.`);
      fetchFpis();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to save FPI.";
      setSaveError(msg); pushToast("error", "FPI Save Failed", msg);
    } finally { setSaving(false); }
  };

  const handleClose = () => {
    setShowModal(false); setForm(defaultForm());
    setSaveError(""); setSavedCode(""); setFpiGenError("");
  };

  // ✅ FIX: Open edit — use sanitizeForm to fix nulls + date formats
  const handleOpenEdit = async (fpi: FpiPayload) => {
    setEditError(""); setEditSuccess(false);
    setEditFpi(fpi);
    setEditForm(sanitizeForm(fpi));
    setEditSec({ details: true, items: true });
    setShowEditModal(true); setEditLoadingData(true);
    try {
      const full = await getFabricPurchaseInwardById(fpi.id!);
      const data: FpiPayload = full.data ?? full;
      setEditFpi(data);
      setEditForm(sanitizeForm(data));
    } catch {
      setEditError("Could not load full FPI details. You may still edit basic fields.");
    } finally { setEditLoadingData(false); }
  };

  const handleEditClose = () => {
    setShowEditModal(false); setEditFpi(null);
    setEditForm(defaultForm()); setEditError(""); setEditSuccess(false);
  };

  // Update save
  const handleUpdate = async () => {
    setEditError("");
    if (!editForm.fpi_no || !editForm.supplier) { setEditError("FPI No and Supplier are required."); return; }
    setEditSaving(true);
    try {
      const payload = { ...editForm, total_meters: ect };
      await updateFabricPurchaseInward(editFpi!.id!, payload);
      setEditSuccess(true);
      pushToast("success", "FPI Updated", `FPI "${editFpi!.fpi_no}" updated successfully.`);
      fetchFpis();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to update FPI.";
      setEditError(msg); pushToast("error", "FPI Update Failed", msg);
    } finally { setEditSaving(false); }
  };

  // Delete
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true); setDeleteError("");
    try {
      await deleteFabricPurchaseInward(deleteTarget.id!);
      pushToast("warning", "FPI Deleted", `FPI "${deleteTarget.fpi_no}" permanently deleted.`);
      setDeleteTarget(null); fetchFpis();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to delete.";
      setDeleteError(msg); pushToast("error", "Delete Failed", msg);
    } finally { setDeleteConfirming(false); }
  };

  // ── Export / Print (FabricPurchaseOrders-style thin wrappers) ────────────
  const getExportData = () => allFpis.length ? allFpis : fpis;

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

  const handlePrintTable = () => {
    const data = getExportData();
    if (!data.length) { pushToast("info", "Nothing to Print", "No records available."); return; }
    doPrintTable(data);
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  // ─── Shared form body ────────────────────────────────────────────────────
  const renderFormBody = (
    f: FpiPayload,
    setF: React.Dispatch<React.SetStateAction<FpiPayload>>,
    updItem: (idx: number, patch: Partial<FpiItemEx>) => void,
    addIt: () => void,
    rmIt: (idx: number) => void,
    totalMeters: number,
    errMsg: string,
    isSaving: boolean,
    isEdit: boolean,
    onSave: () => void,
    onClose: () => void,
    fpiGen: boolean,
    fpiGenErr: string,
    autofilling: boolean,
    sec: typeof formSec,
    setSec: React.Dispatch<React.SetStateAction<typeof formSec>>,
  ) => {
    const toggleSec = (k: keyof typeof formSec) => setSec(p => ({ ...p, [k]: !p[k] }));

    return (
      <div className="fpi-modal-body">

        {errMsg && (
          <div className="fpi-error-banner">
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{errMsg}</span>
            <button onClick={() => isEdit ? setEditError("") : setSaveError("")}
              style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ef4444", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── FPI Details ── */}
        <SectionHead title="FPI Details" open={sec.details} onToggle={() => toggleSec("details")} accent="#0f766e" />
        {sec.details && (
          <div className="fpi-grid-3" style={{ paddingTop: 12, paddingBottom: 4 }}>

            {/* FPI No */}
            <FField label="FPI No" required type="locked" hint="Auto-generated (FPI-YYYY-001)">
              <div className={`fpi-display-field${fpiGen ? " fpi-display-field--loading" : (f.fpi_no ? " fpi-display-field--filled" : "")}`}>
                {fpiGen ? (
                  <span className="fpi-display-fetching">
                    <Loader2 size={11} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                    Generating…
                  </span>
                ) : f.fpi_no ? (
                  <span className="fpi-display-value">{f.fpi_no}</span>
                ) : (
                  <span className="fpi-display-empty">Auto-generated</span>
                )}
              </div>
              {fpiGenErr && <p className="fpi-hint fpi-hint--warn">⚠ {fpiGenErr}</p>}
            </FField>

            {/* FPI Date */}
            <FField label="FPI Date" type="date">
              <input className="fpi-input" type="date"
                value={f.fpi_date ?? today()}
                onChange={e => setF({ ...f, fpi_date: e.target.value })} />
            </FField>

            {/* FPO No — search select */}
            <FField label="FPO No" type="lookup" hint="Selecting FPO auto-fills Supplier, Sort No & Meter">
              {autofilling ? (
                <div className="fpi-display-field fpi-display-field--loading">
                  <span className="fpi-display-fetching">
                    <Loader2 size={11} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                    Loading FPO data…
                  </span>
                </div>
              ) : (
                <FpoSearchSelect
                  value={f.fpo_no ?? ""}
                  fpoOptions={fpoOptions}
                  loadingFpos={loadingFpos}
                  onSelect={fpo => handleFpoSelect(fpo, setF, isEdit ? setEditFpoAutofill : setFpoAutofilling)}
                />
              )}
            </FField>

            {/* Supplier */}
            <FField label="Supplier" required type={f.fpo_no ? "autofill" : "text"}>
              <input className="fpi-input" type="text" placeholder="e.g. MADURAI WEAVING MILLS"
                value={f.supplier ?? ""}
                onChange={e => setF({ ...f, supplier: e.target.value })} />
            </FField>

            {/* Inward To */}
            <FField label="Inward To" type="select">
              <select className="fpi-input" value={f.inward_to ?? ""}
                onChange={e => setF({ ...f, inward_to: e.target.value })}>
                <option value="">Select</option>
                {["UNIT 1","UNIT 2","UNIT 3","WAREHOUSE","STORE"].map(t => <option key={t}>{t}</option>)}
              </select>
            </FField>

            {/* Vehicle No */}
            <FField label="Vehicle No" type="text">
              <input className="fpi-input" type="text" placeholder="TN72BL0994"
                value={f.vehicle_no ?? ""}
                onChange={e => setF({ ...f, vehicle_no: e.target.value })} />
            </FField>

            {/* DC No */}
            <FField label="DC No" type="text">
              <input className="fpi-input" type="text" placeholder="391"
                value={f.dc_no ?? ""}
                onChange={e => setF({ ...f, dc_no: e.target.value })} />
            </FField>

            {/* DC Date */}
            <FField label="DC Date" type="date">
              <input className="fpi-input" type="date"
                value={f.dc_date ?? today()}
                onChange={e => setF({ ...f, dc_date: e.target.value })} />
            </FField>

            {/* Sort No */}
            <FField label="Sort No" type={f.fpo_no ? "autofill" : "text"}>
              <input className="fpi-input" type="text" placeholder="6078"
                value={f.sort_no ?? ""}
                onChange={e => setF({ ...f, sort_no: e.target.value })} />
            </FField>

            {/* Lot No */}
            <FField label="Lot No" type="text">
              <input className="fpi-input" type="text" placeholder="000216"
                value={f.lot_no ?? ""}
                onChange={e => setF({ ...f, lot_no: e.target.value })} />
            </FField>

            {/* Purchase Invoice No */}
            <FField label="Purchase Invoice No" type="text" hint="Supplier's invoice reference">
              <input className="fpi-input" type="text" placeholder="INV-2026-00123"
                value={(f as FpiPayload).purchase_invoice_no ?? ""}
                onChange={e => setF({ ...f, purchase_invoice_no: e.target.value })} />
            </FField>

            {/* Remarks */}
            <div className="fpi-col-full">
              <FField label="Remarks" type="text">
                <input className="fpi-input" type="text" placeholder="e.g. PURCHASE"
                  value={f.remarks ?? ""}
                  onChange={e => setF({ ...f, remarks: e.target.value })} />
              </FField>
            </div>
          </div>
        )}

        {/* ── Fabric Items ── */}
        <SectionHead title="Fabric Items" open={sec.items} onToggle={() => toggleSec("items")} accent="#0f766e" />
        {sec.items && (
          <div style={{ paddingTop: 10, paddingBottom: 8 }}>
            {f.fpo_no && (
              <p className="fpi-hint" style={{ marginTop: 0, marginBottom: 8, color: "#0f766e", fontWeight: 600 }}>
                ✅ Meter values pre-filled from FPO — edit as needed.
              </p>
            )}
            <div className="fpi-item-table-header">
              <span className="fpi-item-count">{f.items.length} item{f.items.length !== 1 ? "s" : ""}</span>
              <button type="button" className="fpi-add-row-btn" onClick={addIt}>
                <PlusCircle size={13} /> Add Row
              </button>
            </div>
            <div className="fpi-item-table-wrap">
              <table className="fpi-item-table">
                <thead>
                  <tr>
                    <th className="fpi-ith fpi-ith--c" style={{ width: 48 }}>#</th>
                    <th className="fpi-ith fpi-ith--r" style={{ width: 130 }}>
                      Meter {f.fpo_no && <FTypeBadge type="autofill" />}
                    </th>
                    <th className="fpi-ith" style={{ minWidth: 220 }}>Piece No</th>
                    <th className="fpi-ith" style={{ minWidth: 180 }}>Roll No</th>
                    <th className="fpi-ith fpi-ith--c" style={{ width: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(f.items as FpiItemEx[]).map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "fpi-irow-even" : "fpi-irow-odd"}>
                      <td className="fpi-itd fpi-itd--c" style={{ color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                      <td className="fpi-itd">
                        <input className="fpi-iinput fpi-iinput--r" type="number" min={0} step="0.01"
                          placeholder="0.00"
                          value={item.meter || ""}
                          onChange={e => updItem(idx, { meter: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="fpi-itd">
                        <input className="fpi-iinput" type="text" placeholder="RVPP05000216-1"
                          value={item.piece_no ?? ""}
                          onChange={e => updItem(idx, { piece_no: e.target.value })} />
                      </td>
                      <td className="fpi-itd">
                        <input className="fpi-iinput" type="text" placeholder="000216-1"
                          value={item.new_piece_no ?? ""}
                          onChange={e => updItem(idx, { new_piece_no: e.target.value })} />
                      </td>
                      <td className="fpi-itd fpi-itd--c">
                        {f.items.length > 1 && (
                          <button className="fpi-del-row-btn" onClick={() => rmIt(idx)} title="Remove row">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="fpi-total-section">
              {f.fpo_no && (() => {
                const fpoTotal = getFpoTotalMeter(f.fpo_no);
                const balance  = +(fpoTotal - totalMeters).toFixed(2);
                const status   = getInwardStatus(fpoTotal, totalMeters);
                const pct      = fpoTotal > 0 ? Math.min(100, +(totalMeters / fpoTotal * 100).toFixed(1)) : 0;
                return (
                  <div className="fpi-compare-row">
                    <div className="fpi-compare-item">
                      <span className="fpi-compare-label">Order Meter</span>
                      <span className="fpi-compare-val">{fmt(fpoTotal)} M</span>
                    </div>
                    <div className="fpi-compare-item">
                      <span className="fpi-compare-label">Inward Meter</span>
                      <span className="fpi-compare-val" style={{ color: "#0f766e" }}>{fmt(totalMeters)} M</span>
                    </div>
                    <div className="fpi-compare-item">
                      <span className="fpi-compare-label">Balance</span>
                      <span className="fpi-compare-val" style={{ color: balance < 0 ? "#dc2626" : balance === 0 ? "#166534" : "#1e293b" }}>
                        {fmt(Math.abs(balance))} M{balance < 0 ? " over" : ""}
                      </span>
                    </div>
                    <div className="fpi-compare-item">
                      <span className="fpi-compare-label">Status</span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="fpi-compare-bar-wrap">
                      <div className="fpi-compare-bar-track">
                        <div className="fpi-compare-bar-fill" style={{
                          width: `${pct}%`,
                          background: status === "over" ? "#dc2626" : status === "completed" ? "#16a34a" : "#0f766e",
                        }} />
                      </div>
                      <span className="fpi-compare-bar-pct">{pct}%</span>
                    </div>
                  </div>
                );
              })()}
              <div className="fpi-total-row">
                <span className="fpi-total-label">Total Meters</span>
                <span className="fpi-total-val">{fmt(totalMeters)} M</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }

        .fpi-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; min-height:100vh; background:#f1f5f9; }

        /* Page header */
        .fpi-page-header { padding:16px 24px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        @media(min-width:576px){ .fpi-page-header { padding:16px 28px; } }
        .fpi-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .fpi-page-header p  { margin:2px 0 0; font-size:12px; color:#64748b; }
        .fpi-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; }
        .fpi-new-btn { display:flex; align-items:center; gap:6px; background:#0f766e; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,.3); white-space:nowrap; }
        .fpi-new-btn:hover { background:#0d6460; }

        /* Divider between header action buttons */
        .fpi-btn-divider { width:1px; height:32px; background:#e2e8f0; }

        /* Export / Print dropdown (header) */
        .fpi-export-wrap { position:relative; }
        .fpi-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#0f766e; border:1.5px solid #99f6e4; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fpi-export-btn:hover { background:#f0fdfa; border-color:#5eead4; }
        .fpi-export-btn:disabled { opacity:.5; cursor:not-allowed; }
        .fpi-export-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:200px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:600; overflow:hidden; }
        .fpi-export-menu-label { padding:8px 14px; font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; background:#f8fafc; border-bottom:1px solid #f1f5f9; }
        .fpi-export-item { display:flex; align-items:center; gap:10px; width:100%; padding:9px 14px; background:none; border:none; cursor:pointer; font-size:13px; color:#374151; font-family:'DM Sans',sans-serif; text-align:left; }
        .fpi-export-item:hover { background:#f8fafc; }

        /* Toolbar */
        .fpi-toolbar { padding:14px 24px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
        @media(min-width:576px){ .fpi-toolbar { padding:16px 28px; } }
        .fpi-entries-wrap { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; flex-wrap:wrap; white-space:nowrap; }
        .fpi-entries-select { padding:6px 26px 6px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; cursor:pointer; appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='3'><polyline points='6 9 12 15 18 9'/></svg>"); background-repeat:no-repeat; background-position:right 8px center; }
        .fpi-entries-select:focus { border-color:#0f766e; }
        .fpi-entries-recs { color:#64748b; font-weight:500; }
        .fpi-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .fpi-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .fpi-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .fpi-search:focus { border-color:#0f766e; }
        .fpi-rec-count { font-size:13px; color:#64748b; white-space:nowrap; }

        /* Table card */
        .fpi-card { margin:0 16px 24px; background:#fff; border-radius:12px; box-shadow:0 1px 6px rgba(0,0,0,.07); border:1px solid #e2e8f0; overflow:hidden; }
        @media(min-width:576px){ .fpi-card { margin:0 28px 28px; } }
        .fpi-table-wrap { overflow-x:auto; overflow-y:visible; scrollbar-width:thin; scrollbar-color:#c7d3e8 transparent; -webkit-overflow-scrolling:touch; }
        .fpi-table-wrap::-webkit-scrollbar { height:6px; }
        .fpi-table-wrap::-webkit-scrollbar-track { background:transparent; }
        .fpi-table-wrap::-webkit-scrollbar-thumb { background-color:#c7d3e8; border-radius:3px; }
        .fpi-table-wrap::-webkit-scrollbar-thumb:hover { background-color:#a0aec0; }

        /* Table */
        .fpi-table { width:100%; border-collapse:collapse; font-size:13px; min-width:max-content; }
        .fpi-table thead tr { background:#0f766e; }
        .fpi-table th { padding:12px 16px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:13px; }
        .fpi-table th.th-r { text-align:right; }
        .fpi-table th.th-c { text-align:center; }
        .fpi-table tbody tr:nth-child(odd)  td { background:#fff; }
        .fpi-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .fpi-table tbody tr:hover td { filter:brightness(0.97); }
        .fpi-table td { padding:11px 16px; color:#374151; font-size:13px; white-space:nowrap; }
        .fpi-fpi-no { font-family:'DM Mono',monospace; font-weight:700; color:#0f766e; }
        .fpi-fpo-no { font-weight:600; color:#0e7490; }
        .fpi-td-num { text-align:right; font-family:'DM Mono',monospace; font-weight:600; }
        .fpi-td-c { text-align:center; }
        .fpi-empty { text-align:center; padding:48px 16px; color:#94a3b8; font-size:13px; }
        .fpi-action-group { display:flex; align-items:center; gap:4px; justify-content:center; }
        .fpi-edit-btn  { display:inline-flex; align-items:center; gap:3px; padding:4px 8px; border:1px solid #99f6e4; border-radius:6px; background:#f0fdfa; color:#0f766e; font-size:11px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fpi-edit-btn:hover  { background:#ccfbf1; }
        .fpi-print-btn { display:inline-flex; align-items:center; gap:3px; padding:4px 8px; border:1px solid #bfdbfe; border-radius:6px; background:#eff6ff; color:#1d4ed8; font-size:11px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fpi-print-btn:hover { background:#dbeafe; }
        .fpi-del-btn   { display:inline-flex; align-items:center; gap:3px; padding:4px 8px; border:1px solid #fca5a5; border-radius:6px; background:#fff1f2; color:#dc2626; font-size:11px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fpi-del-btn:hover   { background:#fee2e2; }

        /* Pagination */
        .fpi-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:13px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .fpi-pg-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .fpi-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .fpi-pg-btn:hover:not(:disabled) { background:#f1f5f9; }
        .fpi-pg-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:700; }
        .fpi-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        /* Modal */
        .fpi-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; }
        @media(min-width:576px){ .fpi-modal-overlay { padding:24px 16px; } }
        .fpi-modal { background:#fff; border-radius:14px; width:100%; max-width:980px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .fpi-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .fpi-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .fpi-modal-header { padding:16px 24px; } }
        .fpi-modal-header--create { background:linear-gradient(135deg,#0f766e,#065f46); }
        .fpi-modal-header--edit   { background:linear-gradient(135deg,#0e7490,#164e63); }
        .fpi-modal-title    { color:#fff; font-weight:700; font-size:16px; margin:0; }
        @media(min-width:576px){ .fpi-modal-title { font-size:18px; } }
        .fpi-modal-subtitle { font-size:11px; color:rgba(255,255,255,.75); font-family:'DM Mono',monospace; margin-top:2px; }
        .fpi-modal-close-btn { background:none; border:none; padding:0 4px; cursor:pointer; display:flex; align-items:center; opacity:.85; }
        .fpi-modal-close-btn:hover { opacity:1; }
        .fpi-modal-body   { padding:16px; overflow-y:auto; flex:1; }
        @media(min-width:576px){ .fpi-modal-body { padding:20px 24px; } }
        .fpi-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .fpi-modal-footer { padding:14px 24px; } }

        /* Section head (collapsible) */
        .fpi-section-head  { display:flex; justify-content:space-between; align-items:center; background:#f0fdfa; border:1px solid #ccfbf1; border-radius:10px; padding:10px 14px; margin-top:16px; margin-bottom:4px; cursor:pointer; user-select:none; }
        .fpi-section-title { font-weight:700; font-size:13px; color:#0f766e; }

        /* Grid */
        .fpi-grid-3 { display:grid; grid-template-columns:1fr; gap:14px; }
        @media(min-width:480px){ .fpi-grid-3 { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:768px){ .fpi-grid-3 { grid-template-columns:repeat(3,1fr); } }
        .fpi-col-full { grid-column:1/-1; }

        /* Form fields */
        .fpi-label    { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
        .fpi-required { color:#ef4444; }
        .fpi-hint     { margin:3px 0 0; font-size:11px; color:#94a3b8; }
        .fpi-hint--warn { color:#b45309; }
        .fpi-input    { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; transition:border-color .15s; }
        .fpi-input:focus { border-color:#0f766e; }
        .fpi-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }

        /* FPI No display field */
        .fpi-display-field          { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; font-size:13px; font-family:'DM Sans',sans-serif; background:#f8fafc; color:#475569; min-height:38px; display:flex; align-items:center; gap:6px; cursor:not-allowed; transition:background .2s,border-color .2s; }
        .fpi-display-field--loading { opacity:.75; }
        .fpi-display-field--filled  { background:#f0fdf4; border-color:#6ee7b7; color:#166534; font-weight:700; }
        .fpi-display-value          { font-family:'DM Mono',monospace; font-weight:700; font-size:13px; letter-spacing:.03em; }
        .fpi-display-empty          { color:#94a3b8; }
        .fpi-display-fetching       { display:flex; align-items:center; gap:5px; color:#94a3b8; font-size:12px; }

        /* Item table */
        .fpi-item-table-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; margin-top:10px; }
        .fpi-item-count   { font-size:12px; color:#64748b; font-weight:600; }
        .fpi-add-row-btn  { display:flex; align-items:center; gap:5px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; border-radius:8px; padding:5px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpi-add-row-btn:hover { background:#ccfbf1; }
        .fpi-item-table-wrap { border:1px solid #e2e8f0; border-radius:10px; overflow-x:auto; scrollbar-width:thin; scrollbar-color:#c7d3e8 transparent; }
        .fpi-item-table-wrap::-webkit-scrollbar       { height:4px; }
        .fpi-item-table-wrap::-webkit-scrollbar-thumb { background:#c7d3e8; border-radius:2px; }
        .fpi-item-table { width:100%; border-collapse:collapse; font-size:12px; min-width:560px; }
        .fpi-ith        { padding:8px 10px; background:#f0fdfa; color:#0f766e; font-weight:600; text-align:left; border-bottom:1px solid #e2e8f0; white-space:nowrap; font-size:11px; }
        .fpi-ith--r     { text-align:right; }
        .fpi-ith--c     { text-align:center; }
        .fpi-irow-even td { background:#fff; }
        .fpi-irow-odd  td { background:#f0fdfa; }
        .fpi-itd        { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
        .fpi-itd--c     { text-align:center; }
        .fpi-iinput     { width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:12px; font-family:'DM Sans',sans-serif; outline:none; color:#1e293b; background:#fff; }
        .fpi-iinput:focus { border-color:#0f766e; }
        .fpi-iinput--r  { text-align:right; }
        .fpi-del-row-btn { background:#fff1f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .fpi-del-row-btn:hover { background:#fee2e2; }

        /* Total */
        .fpi-total-section { background:#f0fdfa; border:1px solid #99f6e4; border-radius:12px; padding:16px 20px; margin-top:12px; margin-bottom:4px; }
        .fpi-total-row     { display:flex; align-items:center; justify-content:space-between; border-top:2px solid #0f766e; padding-top:10px; margin-top:4px; }
        .fpi-total-label   { font-size:15px; font-weight:700; color:#1e293b; }
        .fpi-total-val     { font-size:20px; font-weight:800; color:#0f766e; font-family:'DM Sans',sans-serif; }

        /* Order Meter vs Inward Meter comparison */
        .fpi-compare-row      { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 16px; margin-bottom:14px; }
        @media(min-width:600px){ .fpi-compare-row { grid-template-columns:repeat(4,1fr); } }
        .fpi-compare-item     { display:flex; flex-direction:column; gap:2px; }
        .fpi-compare-label    { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
        .fpi-compare-val      { font-size:15px; font-weight:800; color:#1e293b; font-family:'DM Mono',monospace; }
        .fpi-compare-bar-wrap { grid-column:1/-1; display:flex; align-items:center; gap:10px; margin-top:2px; }
        .fpi-compare-bar-track{ flex:1; height:8px; border-radius:6px; background:#e2e8f0; overflow:hidden; }
        .fpi-compare-bar-fill { height:100%; border-radius:6px; transition:width .25s ease; }
        .fpi-compare-bar-pct  { font-size:11px; font-weight:700; color:#64748b; min-width:38px; text-align:right; }

        /* Footer buttons */
        .fpi-cancel-btn  { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; }
        .fpi-cancel-btn:hover { background:#f1f5f9; }
        .fpi-save-btn    { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpi-save-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fpi-save-btn:not(:disabled):hover { background:#15803d; }
        .fpi-update-btn  { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#0e7490; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpi-update-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fpi-update-btn:not(:disabled):hover { background:#0c6380; }

        /* Success */
        .fpi-ok-wrap   { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:12px; }
        .fpi-ok-icon   { width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:30px; }
        .fpi-ok-title  { font-size:18px; font-weight:700; color:#1e293b; margin:0; }
        .fpi-ok-code   { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#0f766e; margin:0; }
        .fpi-ok-close  { margin-top:12px; padding:9px 24px; border:none; border-radius:8px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }

        /* Spinner */
        .fpi-spinner-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:16px; }
        .fpi-spinner      { width:36px; height:36px; border:4px solid #e2e8f0; border-top-color:#0f766e; border-radius:50%; animation:spin .8s linear infinite; }
        .fpi-spinner-text { font-size:14px; color:#64748b; }

        /* Delete confirm */
        .fpi-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .fpi-confirm-box     { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
        .fpi-confirm-icon    { font-size:40px; margin-bottom:12px; }
        .fpi-confirm-title   { font-size:17px; font-weight:700; color:#1e293b; margin:0 0 8px; }
        .fpi-confirm-sub     { font-size:13px; color:#64748b; margin:0 0 24px; line-height:1.6; }
        .fpi-confirm-actions { display:flex; gap:10px; justify-content:center; }
        .fpi-confirm-cancel  { padding:9px 22px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpi-confirm-cancel:hover { background:#f1f5f9; }
        .fpi-confirm-del     { padding:9px 22px; border:none; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpi-confirm-del:disabled { background:#fca5a5; cursor:not-allowed; }

        /* Toast */
        .fpi-toast-wrap  { position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; max-width:360px; width:calc(100vw - 40px); pointer-events:none; }
        .fpi-toast       { display:flex; align-items:flex-start; gap:10px; border-radius:10px; padding:12px 14px; box-shadow:0 4px 16px rgba(0,0,0,.12); pointer-events:all; animation:toastIn .25s ease-out; font-family:'DM Sans',sans-serif; }
        .fpi-toast-icon  { flex-shrink:0; margin-top:1px; }
        .fpi-toast-body  { flex:1; min-width:0; }
        .fpi-toast-title { margin:0; font-size:13px; font-weight:700; }
        .fpi-toast-msg   { margin:2px 0 0; font-size:12px; opacity:.8; line-height:1.4; }
        .fpi-toast-close { flex-shrink:0; background:none; border:none; padding:0; cursor:pointer; display:flex; align-items:center; margin-top:1px; opacity:.6; }
        .fpi-toast-close:hover { opacity:1; }
      `}</style>

      <div className="fpi-wrap">

        {/* Page Header */}
        <div className="fpi-page-header">
          <div>
            <h1>Fabric Purchase Inward</h1>
            <p>Manage &amp; create fabric purchase inward records</p>
          </div>
          <div className="fpi-header-actions">
            <ExportMenu
              onCSV={handleExportCSV}
              onExcel={handleExportExcel}
              onPrint={handlePrintTable}
              disabled={loading || (!allFpis.length && !fpis.length)}
            />
            <div className="fpi-btn-divider" />
            <button className="fpi-new-btn" onClick={handleNewFpi}>
              <Plus size={15} /> New FPI
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="fpi-toolbar">
          <div className="fpi-entries-wrap">
            <span>Show</span>
            <select
              className="fpi-entries-select"
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
            >
              {ENTRY_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
            <span className="fpi-entries-recs">{total} record(s)</span>
          </div>
          <div className="fpi-search-wrap">
            <Search size={14} />
            <input className="fpi-search" type="text"
              placeholder="Search FPI no, supplier, FPO no…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Table */}
        <div className="fpi-card">
          <div className="fpi-table-wrap">
            <table className="fpi-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>FPI No</th>
                  <th>FPI Date</th>
                  <th>FPO No</th>
                  <th>Supplier</th>
                  <th>Inward To</th>
                  <th>DC No</th>
                  <th>DC Date</th>
                  <th>Lot No</th>
                  <th>Purchase Invoice No</th>
                  <th className="th-r">Order Meter</th>
                  <th className="th-r">Inward Meter</th>
                  <th className="th-r">Balance</th>
                  <th className="th-c">Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={15} className="fpi-empty">
                    <Loader2 size={22} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                  </td></tr>
                ) : fpis.length === 0 ? (
                  <tr><td colSpan={15} className="fpi-empty">
                    {search ? "No FPIs match your search." : 'No FPIs found. Click "New FPI" to create one.'}
                  </td></tr>
                ) : fpis.map((o, i) => {
                  const fpoTotal    = getFpoTotalMeter(o.fpo_no);
                  const inwardTotal = Number(o.total_meters) || 0;
                  const balance     = +(fpoTotal - inwardTotal).toFixed(2);
                  const status      = getInwardStatus(fpoTotal, inwardTotal);
                  return (
                    <tr key={o.id}>
                      <td style={{ color: "#94a3b8" }}>{(page - 1) * limit + i + 1}</td>
                      <td><span className="fpi-fpi-no">{o.fpi_no}</span></td>
                      <td style={{ color: "#64748b" }}>{fmtDate(o.fpi_date)}</td>
                      <td><span className="fpi-fpo-no">{o.fpo_no || "—"}</span></td>
                      <td>{o.supplier}</td>
                      <td>{o.inward_to || "—"}</td>
                      <td>{o.dc_no || "—"}</td>
                      <td style={{ color: "#64748b" }}>{fmtDate(o.dc_date)}</td>
                      <td>{o.lot_no || "—"}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>
                        {(o as FpiPayload).purchase_invoice_no || "—"}
                      </td>
                      <td className="fpi-td-num">{o.fpo_no ? `${fmt(fpoTotal)} M` : "—"}</td>
                      <td className="fpi-td-num">{fmt(inwardTotal)} M</td>
                      <td className="fpi-td-num" style={{ color: balance < 0 ? "#dc2626" : balance === 0 ? "#166534" : "#374151" }}>
                        {o.fpo_no ? `${fmt(Math.abs(balance))} M${balance < 0 ? " over" : ""}` : "—"}
                      </td>
                      <td className="fpi-td-c"><StatusBadge status={status} /></td>
                      <td className="fpi-td-c">
                        <div className="fpi-action-group">
                          <button className="fpi-edit-btn"  onClick={() => handleOpenEdit(o)}>✏️ Edit</button>
                          <button className="fpi-print-btn" onClick={() => doPrintTable([o])} title="Print">
                            <Printer size={12} />
                          </button>
                          <button className="fpi-del-btn" onClick={() => { setDeleteTarget(o); setDeleteError(""); }}>🗑 Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="fpi-pg-bar">
              <span>Page {page} of {totalPages}</span>
              <div className="fpi-pg-btns">
                <button className="fpi-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="fpi-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`fpi-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="fpi-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="fpi-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* CREATE MODAL */}
        {showModal && (
          <div className="fpi-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="fpi-modal">
              <div className="fpi-modal-header fpi-modal-header--create">
                <div>
                  <h2 className="fpi-modal-title">➕ New Fabric Purchase Inward</h2>
                  <p className="fpi-modal-subtitle">{form.fpi_no || "Generating FPI No…"}</p>
                </div>
                <button className="fpi-modal-close-btn" onClick={handleClose}><X size={20} color="#fff" /></button>
              </div>

              {savedCode ? (
                <div className="fpi-ok-wrap">
                  <div className="fpi-ok-icon" style={{ background: "#dcfce7" }}>✅</div>
                  <p className="fpi-ok-title">FPI Saved Successfully!</p>
                  <p className="fpi-ok-code">{savedCode}</p>
                  <button className="fpi-ok-close" style={{ background: "#0f766e" }} onClick={handleClose}>Close</button>
                </div>
              ) : (
                <>
                  {renderFormBody(
                    form, setForm, updateItem, addItem, removeItem, ct,
                    saveError, saving, false, handleSave, handleClose,
                    fpiGenerating, fpiGenError, fpoAutofilling,
                    formSec, setFormSec,
                  )}
                  <div className="fpi-modal-footer">
                    <button className="fpi-cancel-btn" onClick={handleClose}>Cancel</button>
                    <button className="fpi-save-btn" onClick={handleSave} disabled={saving}>
                      {saving
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                        : "💾 Save FPI"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* EDIT MODAL */}
        {showEditModal && (
          <div className="fpi-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleEditClose(); }}>
            <div className="fpi-modal">
              <div className="fpi-modal-header fpi-modal-header--edit">
                <div>
                  <h2 className="fpi-modal-title">✏️ Edit FPI — {editFpi?.fpi_no ?? "…"}</h2>
                  {editFpi?.fpi_date && (
                    <p className="fpi-modal-subtitle">{fmtDate(editFpi.fpi_date)}</p>
                  )}
                </div>
                <button className="fpi-modal-close-btn" onClick={handleEditClose}><X size={20} color="#fff" /></button>
              </div>

              {editLoadingData ? (
                <div className="fpi-spinner-wrap">
                  <div className="fpi-spinner" />
                  <span className="fpi-spinner-text">Loading FPI details…</span>
                </div>
              ) : editSuccess ? (
                <div className="fpi-ok-wrap">
                  <div className="fpi-ok-icon" style={{ background: "#ccfbf1" }}>✅</div>
                  <p className="fpi-ok-title">FPI Updated Successfully!</p>
                  <p className="fpi-ok-code">{editFpi?.fpi_no}</p>
                  <button className="fpi-ok-close" style={{ background: "#0e7490" }} onClick={handleEditClose}>Close</button>
                </div>
              ) : (
                <>
                  {renderFormBody(
                    editForm, setEditForm, updateEditItem, addEditItem, removeEditItem, ect,
                    editError, editSaving, true, handleUpdate, handleEditClose,
                    false, "", editFpoAutofill,
                    editSec, setEditSec,
                  )}
                  <div className="fpi-modal-footer">
                    <button className="fpi-cancel-btn" onClick={handleEditClose}>Cancel</button>
                    <button className="fpi-update-btn" onClick={handleUpdate} disabled={editSaving}>
                      {editSaving
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                        : "✏️ Update FPI"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* DELETE CONFIRM */}
        {deleteTarget && (
          <div className="fpi-confirm-overlay">
            <div className="fpi-confirm-box">
              <div className="fpi-confirm-icon">🗑️</div>
              <p className="fpi-confirm-title">Delete FPI?</p>
              <p className="fpi-confirm-sub">
                This will permanently delete FPI <strong>{deleteTarget.fpi_no}</strong> and all its line items. This action cannot be undone.
              </p>
              {deleteError && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  ⚠ {deleteError}
                </div>
              )}
              <div className="fpi-confirm-actions">
                <button className="fpi-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="fpi-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
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