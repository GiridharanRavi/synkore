// @ts-nocheck
// frontend/src/pages/admin/FabricStock.tsx
//
// Fabric Stock — combined view over two sources:
//   • Fabric Purchase Inward (automatic)
//   • Manual Stock Entry ("+ Add In-Stock" button — opening balances,
//     physical-count corrections, transfers, etc.) — can be Edited/Deleted.
//
//   • Piece View    → one row per physical piece (inward OR manual)
//   • Summary View  → grouped by Sort No + Construction, with totals
//
// Each row carries a `source: "inward" | "manual"` field so the UI can
// badge it and only allow editing/deleting the manual ones from here.
//
// Data comes from:
//   GET    /api/fabric-stock            (piece rows, both sources)
//   GET    /api/fabric-stock/summary    (grouped rows, both sources)
//   GET    /api/fabric-stock/filters    (dropdown values, both sources)
//   POST   /api/fabric-stock/manual     (add a manual entry)
//   PUT    /api/fabric-stock/manual/:id (edit a manual entry)
//   DELETE /api/fabric-stock/manual/:id (remove a manual entry)
//
// PURCHASE INVOICE NO COLUMN:
//   The Piece Detail table now shows `purchase_invoice_no` — the same
//   field that's already visible on the Fabric Purchase Inward list — so
//   an inward piece can be traced back to its purchase invoice from the
//   Fabric Stock screen without switching pages. It's optional on
//   StockPiece (manual entries won't have one) and falls back to "—".

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, X, Loader2, AlertCircle, RefreshCw, ChevronDown,
  Download, Printer, FileText, FileSpreadsheet, LayoutGrid, List,
  Package, MapPin, Boxes, Layers, PlusCircle, Trash2, Pencil, PackagePlus, CheckCircle2,
} from "lucide-react";

import {
  getFabricStock,
  getFabricStockSummary,
  getFabricStockFilters,
  addManualFabricStock,
  updateManualFabricStock,
  deleteManualFabricStock,
} from "../../api/services";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockSource = "inward" | "manual";

interface StockPiece {
  id: number;
  fpi_id: number | null;
  fpi_no: string;
  fpi_date?: string | null;
  fpo_no: string;
  supplier: string;
  inward_to: string;
  sort_no: string;
  construction: string;
  hsn_code: string;
  lot_no: string;
  dc_no: string;
  dc_date?: string | null;
  // Purchase Invoice No — carried over from the Fabric Purchase Inward
  // record this piece came in against. Manual entries won't have one.
  purchase_invoice_no?: string;
  piece_no: string;
  new_piece_no: string;
  meter: number;
  source: StockSource;
  remarks?: string;
}

interface StockSummaryRow {
  sort_no: string;
  construction: string;
  hsn_code: string;
  total_meter: number;
  piece_count: number;
  suppliers: string[];
  locations: string[];
  fpo_nos: string[];
  last_inward?: string | null;
}

type ViewMode = "piece" | "summary";

interface ManualStockForm {
  entry_date: string;
  sort_no: string;
  construction: string;
  hsn_code: string;
  supplier: string;
  inward_to: string;
  lot_no: string;
  piece_no: string;
  new_piece_no: string;
  meter: string;
  remarks: string;
}

const emptyManualForm = (): ManualStockForm => ({
  entry_date: new Date().toISOString().slice(0, 10),
  sort_no: "",
  construction: "",
  hsn_code: "",
  supplier: "",
  inward_to: "",
  lot_no: "",
  piece_no: "",
  new_piece_no: "",
  meter: "",
  remarks: "",
});

const formFromPiece = (p: StockPiece): ManualStockForm => ({
  entry_date: p.fpi_date ? String(p.fpi_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
  sort_no: p.sort_no || "",
  construction: p.construction || "",
  hsn_code: p.hsn_code || "",
  supplier: p.supplier || "",
  inward_to: p.inward_to || "",
  lot_no: p.lot_no || "",
  piece_no: p.piece_no || "",
  new_piece_no: p.new_piece_no || "",
  meter: String(p.meter ?? ""),
  remarks: p.remarks || "",
});

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// Normalize a sort_no for comparison purposes only (trim + case-fold) —
// mirrors the backend's grouping logic so the "exists / new" hint is accurate.
const normSort = (s: string) => String(s || "").trim().toLowerCase();

// Same idea, for Construction — used to power the Construction filter and
// the "total meter for this construction" hint next to it.
const normCon = (s: string) => String(s || "").trim().toLowerCase();

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// Stock-level badge for summary rows — purely a visual cue, thresholds are
// arbitrary starting points; tune once real volumes are known.
type StockLevel = "low" | "medium" | "high";
function getStockLevel(totalMeter: number): StockLevel {
  if (totalMeter < 100) return "low";
  if (totalMeter < 500) return "medium";
  return "high";
}
const LEVEL_CFG: Record<StockLevel, { label: string; bg: string; color: string }> = {
  low:    { label: "Low Stock",    bg: "#fee2e2", color: "#b91c1c" },
  medium: { label: "Medium",       bg: "#fef3c7", color: "#92400e" },
  high:   { label: "Healthy",      bg: "#dcfce7", color: "#166534" },
};
function LevelBadge({ level }: { level: StockLevel }) {
  const c = LEVEL_CFG[level];
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

const SOURCE_CFG: Record<StockSource, { label: string; bg: string; color: string; border: string }> = {
  inward: { label: "Inward", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  manual: { label: "Manual", bg: "#faf5ff", color: "#7c3aed", border: "#e9d5ff" },
};
function SourceBadge({ source }: { source: StockSource }) {
  const c = SOURCE_CFG[source] || SOURCE_CFG.inward;
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 9px",
      borderRadius: 20, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

function Chips({ values, max = 2, tone }: { values: string[]; max?: number; tone: "amber" | "slate" }) {
  if (!values.length) return <span style={{ color: "#cbd5e1" }}>—</span>;
  const shown = values.slice(0, max);
  const extra = values.length - shown.length;
  const bg    = tone === "amber" ? "#fff7ed" : "#f8fafc";
  const color = tone === "amber" ? "#c2410c" : "#475569";
  const border= tone === "amber" ? "#fed7aa" : "#e2e8f0";
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {shown.map(v => (
        <span key={v} style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{v}</span>
      ))}
      {extra > 0 && <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>+{extra} more</span>}
    </span>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

const PIECE_COLUMNS = [
  { key: "fpi_no",       label: "Ref No" },
  { key: "fpi_date",     label: "Date" },
  { key: "source",       label: "Source" },
  { key: "fpo_no",       label: "FPO No" },
  { key: "supplier",     label: "Supplier" },
  { key: "sort_no",      label: "Sort No" },
  { key: "construction", label: "Construction" },
  { key: "hsn_code",     label: "HSN Code" },
  { key: "inward_to",    label: "Location" },
  { key: "lot_no",       label: "Lot No" },
  { key: "purchase_invoice_no", label: "Purchase Invoice No" },
  { key: "piece_no",     label: "Piece No" },
  { key: "new_piece_no", label: "Roll No" },
  { key: "meter",        label: "Meter" },
  { key: "dc_no",        label: "DC No" },
  { key: "dc_date",      label: "DC Date" },
  { key: "remarks",      label: "Remarks" },
];

const SUMMARY_COLUMNS = [
  { key: "sort_no",      label: "Sort No" },
  { key: "construction", label: "Construction" },
  { key: "hsn_code",     label: "HSN Code" },
  { key: "piece_count",  label: "Pieces" },
  { key: "total_meter",  label: "Total Meter" },
  { key: "suppliers",    label: "Suppliers" },
  { key: "locations",    label: "Locations" },
  { key: "last_inward",  label: "Last Inward" },
];

function rowValue(row: any, key: string) {
  const v = row[key];
  if (Array.isArray(v)) return v.join(" | ");
  if (key.endsWith("date") || key === "last_inward") return fmtDate(v);
  if (key === "source") return v === "manual" ? "Manual" : "Inward";
  return v ?? "";
}

function doExportCSV(rows: any[], cols: typeof PIECE_COLUMNS, filename: string) {
  const header = cols.map(c => c.label).join(",");
  const body = rows.map(r =>
    cols.map(c => `"${String(rowValue(r, c.key)).replace(/"/g, '""')}"`).join(",")
  );
  const csv  = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function doExportExcel(rows: any[], cols: typeof PIECE_COLUMNS, filename: string) {
  const headerRow = cols.map(c =>
    `<th style="background:#d97706;color:#fff;padding:8px 10px;font-weight:bold;">${c.label}</th>`
  ).join("");
  const bodyRows = rows.map((r, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#fffbeb"}">` +
    cols.map(c => `<td style="padding:7px 10px;border:1px solid #e2e8f0;">${rowValue(r, c.key)}</td>`).join("") +
    "</tr>"
  ).join("");
  const html = `<html><head><meta charset="UTF-8"/></head><body>
    <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">
      <thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody>
    </table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function doPrintTable(rows: any[], cols: typeof PIECE_COLUMNS, title: string) {
  const headerRow = cols.map(c => `<th>${c.label}</th>`).join("");
  const bodyRows  = rows.map((r, i) =>
    `<tr class="${i % 2 === 0 ? "" : "alt"}">` +
    cols.map(c => `<td>${rowValue(r, c.key)}</td>`).join("") + `</tr>`
  ).join("");
  const win = window.open("", "_blank", "width=1150,height=750");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title} — Print</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1e293b;margin:0;padding:20px}
      h2{font-size:16px;color:#b45309;margin-bottom:4px}
      p{font-size:11px;color:#64748b;margin:0 0 14px}
      table{width:100%;border-collapse:collapse}
      th{background:#d97706;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
      tr.alt td{background:#fffbeb}
      @media print{body{padding:10px}}
    </style></head><body>
    <h2>${title}</h2>
    <p>Printed on ${new Date().toLocaleString()} — ${rows.length} record(s)</p>
    <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
    <script>window.onload=()=>{window.print()}<\/script>
  </body></html>`);
  win.document.close();
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

function ExportMenu({ onCSV, onExcel, onPrint, disabled }: {
  onCSV: () => void; onExcel: () => void; onPrint: () => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="fst-export-btn" disabled={disabled} onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="fst-export-menu">
          <div className="fst-export-menu-label">Export / Print</div>
          {[
            { icon: <FileText size={14} color="#0369a1" />,        label: "Export as CSV",   action: onCSV },
            { icon: <FileSpreadsheet size={14} color="#166534" />, label: "Export as Excel", action: onExcel },
            { icon: <Printer size={14} color="#b45309" />,         label: "Print Table",     action: onPrint },
          ].map(item => (
            <button key={item.label} className="fst-export-item"
              onClick={() => { item.action(); setOpen(false); }}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="fst-stat-card">
      <div className="fst-stat-icon" style={{ background: `${accent}1a`, color: accent }}>{icon}</div>
      <div>
        <p className="fst-stat-label">{label}</p>
        <p className="fst-stat-value">{value}</p>
        {sub && <p className="fst-stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Add / Edit In-Stock modal ───────────────────────────────────────────────

function AddInStockModal({
  open, mode, form, saving, error, existingSortMeta, onChange, onClose, onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  form: ManualStockForm;
  saving: boolean;
  error: string;
  existingSortMeta: Map<string, { total_meter: number; piece_count: number; display: string }>;
  onChange: (field: keyof ManualStockForm, value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  if (!open) return null;

  const typedSort = form.sort_no.trim();
  const match = typedSort ? existingSortMeta.get(normSort(typedSort)) : undefined;
  const isNewSort = typedSort.length > 0 && !match;

  const field = (
    label: string, key: keyof ManualStockForm,
    opts: { type?: string; required?: boolean; placeholder?: string } = {}
  ) => (
    <div className="fst-form-field">
      <label className="fst-form-label">{label}{opts.required && <span style={{ color: "#dc2626" }}> *</span>}</label>
      <input
        className="fst-form-input"
        type={opts.type || "text"}
        value={form[key]}
        placeholder={opts.placeholder}
        step={opts.type === "number" ? "0.01" : undefined}
        min={opts.type === "number" ? "0" : undefined}
        autoComplete="off"
        onChange={e => onChange(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="fst-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fst-modal">
        <div className="fst-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PackagePlus size={18} color="#d97706" />
            <h3>{mode === "edit" ? "Edit In-Stock Entry" : "Add In-Stock (Manual Entry)"}</h3>
          </div>
          <button className="fst-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="fst-modal-body">
            <p className="fst-modal-hint">
              Use this for fabric stock that didn't arrive through a Fabric Purchase Inward —
              opening balances, physical-count corrections, transfers from another unit, etc.
            </p>

            {error && (
              <div className="fst-form-error"><AlertCircle size={14} /> {error}</div>
            )}

            <div className="fst-form-grid">
              {field("Entry Date", "entry_date", { type: "date", required: true })}

              <div className="fst-form-field">
                <label className="fst-form-label">Sort No<span style={{ color: "#dc2626" }}> *</span></label>
                <input
                  className="fst-form-input"
                  type="text"
                  value={form.sort_no}
                  placeholder="e.g. 001"
                  autoComplete="off"
                  onChange={e => onChange("sort_no", e.target.value)}
                />

                {match && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#166534", marginTop: 3, fontWeight: 600 }}>
                    <CheckCircle2 size={13} />
                    Matches existing stock "{match.display}" — current total {fmt(match.total_meter)} M across {match.piece_count} piece(s). This entry will add to it.
                  </span>
                )}
                {isNewSort && (
                  <span style={{ fontSize: 11, color: "#b45309", marginTop: 3, display: "block" }}>
                    No existing stock uses "{typedSort}" — this will create a new stock line.
                  </span>
                )}
              </div>

              {field("Construction", "construction", { placeholder: "e.g. 2/40 x 2/40" })}
              {field("HSN Code", "hsn_code", { placeholder: "e.g. 5208" })}
              {field("Supplier", "supplier", { placeholder: "Optional" })}
              {field("Location", "inward_to", { placeholder: "e.g. Unit 1 Godown" })}
              {field("Lot No", "lot_no")}
              {field("Piece No", "piece_no")}
              {field("Roll No", "new_piece_no")}
              {field("Meter", "meter", { type: "number", required: true, placeholder: "0.00" })}
            </div>

            <div className="fst-form-field" style={{ marginTop: 12 }}>
              <label className="fst-form-label">Remarks</label>
              <textarea
                className="fst-form-input"
                rows={2}
                value={form.remarks}
                placeholder="Optional note about why this stock was added manually"
                onChange={e => onChange("remarks", e.target.value)}
              />
            </div>
          </div>

          <div className="fst-modal-footer">
            <button type="button" className="fst-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="fst-btn-primary" disabled={saving}>
              {saving
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                : (mode === "edit" ? <>Save Changes</> : <>Add Stock</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FabricStock() {
  const [pieces,  setPieces]  = useState<StockPiece[]>([]);
  const [summary, setSummary] = useState<StockSummaryRow[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [search,   setSearch]   = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [supFilter, setSupFilter] = useState("");
  const [conFilter, setConFilter] = useState(""); // Construction filter
  const [page, setPage] = useState(1);
  const LIMIT = 12;

  // Manual "Add / Edit In-Stock" modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState<ManualStockForm>(emptyManualForm());
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");

  const width = useWidth();

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [pRes, sRes, fRes] = await Promise.all([
        getFabricStock(),
        getFabricStockSummary(),
        getFabricStockFilters(),
      ]);
      setPieces((pRes?.data ?? pRes) || []);
      setSummary((sRes?.data ?? sRes) || []);
      const filters = fRes?.data ?? fRes ?? {};
      setLocations(filters.locations || []);
      setSuppliers(filters.suppliers || []);
    } catch (err: any) {
      console.error("❌ FabricStock load failed:", err);
      setError(err?.response?.data?.message || err?.message || "Failed to load stock data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { setPage(1); }, [search, locFilter, supFilter, conFilter, viewMode]);

  // Normalized Sort No → { total_meter, piece_count, display } map, built from
  // the summary rows (already grouped server-side). Powers the "matches
  // existing stock" / "new stock line" hint in the Add/Edit modal. Sort No
  // is a free-text field — typed exactly as entered, no forced formatting.
  const existingSortMeta = useMemo(() => {
    const map = new Map<string, { total_meter: number; piece_count: number; display: string }>();
    for (const s of summary) {
      const key = normSort(s.sort_no);
      if (!key) continue;
      const prev = map.get(key);
      if (prev) {
        map.set(key, {
          total_meter: prev.total_meter + s.total_meter,
          piece_count: prev.piece_count + s.piece_count,
          display: prev.display,
        });
      } else {
        map.set(key, { total_meter: s.total_meter, piece_count: s.piece_count, display: s.sort_no });
      }
    }
    return map;
  }, [summary]);

  // Distinct Construction values (for the filter dropdown), derived from the
  // summary rows so it always reflects both inward + manual stock, sorted
  // alphabetically for a predictable dropdown order.
  const constructions = useMemo(() => {
    const set = new Set<string>();
    for (const s of summary) {
      const c = String(s.construction || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [summary]);

  // Normalized Construction → { total_meter, piece_count, display } map —
  // same idea as existingSortMeta, but keyed by Construction. Used to show
  // the "Total for this construction" hint next to the filter dropdown.
  const constructionMeta = useMemo(() => {
    const map = new Map<string, { total_meter: number; piece_count: number; display: string }>();
    for (const s of summary) {
      const key = normCon(s.construction);
      if (!key) continue;
      const prev = map.get(key);
      if (prev) {
        map.set(key, {
          total_meter: prev.total_meter + s.total_meter,
          piece_count: prev.piece_count + s.piece_count,
          display: prev.display,
        });
      } else {
        map.set(key, { total_meter: s.total_meter, piece_count: s.piece_count, display: s.construction });
      }
    }
    return map;
  }, [summary]);

  const selectedConstructionTotal = conFilter ? constructionMeta.get(normCon(conFilter)) : undefined;

  // ── Manual entry handlers ──
  const openAddModal = () => {
    setModalMode("add");
    setEditingId(null);
    setManualForm(emptyManualForm());
    setManualError("");
    setShowManualModal(true);
  };
  const openEditModal = (piece: StockPiece) => {
    setModalMode("edit");
    setEditingId(piece.id);
    setManualForm(formFromPiece(piece));
    setManualError("");
    setShowManualModal(true);
  };
  const closeManualModal = () => {
    if (manualSaving) return;
    setShowManualModal(false);
  };
  const handleManualChange = (fieldKey: keyof ManualStockForm, value: string) => {
    setManualForm(prev => ({ ...prev, [fieldKey]: value }));
  };
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");

    if (!manualForm.sort_no.trim()) {
      setManualError("Sort No is required.");
      return;
    }
    const meterNum = Number(manualForm.meter);
    if (!manualForm.meter || isNaN(meterNum) || meterNum <= 0) {
      setManualError("Enter a valid Meter value greater than 0.");
      return;
    }

    setManualSaving(true);
    try {
      const payload = { ...manualForm, sort_no: manualForm.sort_no.trim(), meter: meterNum };
      if (modalMode === "edit" && editingId != null) {
        await updateManualFabricStock(editingId, payload);
      } else {
        await addManualFabricStock(payload);
      }
      setShowManualModal(false);
      setManualForm(emptyManualForm());
      setEditingId(null);
      await loadAll();
    } catch (err: any) {
      setManualError(err?.response?.data?.message || err?.message || "Failed to save stock entry.");
    } finally {
      setManualSaving(false);
    }
  };
  const handleDeleteManual = async (id: number) => {
    if (!window.confirm("Delete this manually added stock entry? This cannot be undone.")) return;
    try {
      await deleteManualFabricStock(id);
      await loadAll();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to delete entry.");
    }
  };

  // ── Filtering ──
  const filteredPieces = useMemo(() => {
    const q = search.toLowerCase();
    return pieces.filter(p => {
      if (locFilter && p.inward_to !== locFilter) return false;
      if (supFilter && p.supplier !== supFilter) return false;
      if (conFilter && p.construction !== conFilter) return false;
      if (!q) return true;
      return (
        p.fpi_no.toLowerCase().includes(q) ||
        p.fpo_no.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q) ||
        p.sort_no.toLowerCase().includes(q) ||
        p.construction.toLowerCase().includes(q) ||
        p.piece_no.toLowerCase().includes(q) ||
        p.new_piece_no.toLowerCase().includes(q) ||
        (p.purchase_invoice_no || "").toLowerCase().includes(q)
      );
    });
  }, [pieces, search, locFilter, supFilter, conFilter]);

  const filteredSummary = useMemo(() => {
    const q = search.toLowerCase();
    return summary.filter(s => {
      if (locFilter && !s.locations.includes(locFilter)) return false;
      if (supFilter && !s.suppliers.includes(supFilter)) return false;
      if (conFilter && s.construction !== conFilter) return false;
      if (!q) return true;
      return (
        s.sort_no.toLowerCase().includes(q) ||
        s.construction.toLowerCase().includes(q) ||
        s.hsn_code.toLowerCase().includes(q) ||
        s.suppliers.some(x => x.toLowerCase().includes(q))
      );
    });
  }, [summary, search, locFilter, supFilter, conFilter]);

  // ── Overview stats: Total Stock Meter = Inward meter + Manual meter ──
  const stats = useMemo(() => {
    const inwardMeter = filteredPieces
      .filter(p => p.source !== "manual")
      .reduce((s, p) => s + p.meter, 0);
    const manualMeter = filteredPieces
      .filter(p => p.source === "manual")
      .reduce((s, p) => s + p.meter, 0);
    const totalMeter = inwardMeter + manualMeter;

    const constructions = new Set(filteredPieces.map(p => `${p.sort_no}::${p.construction}`));
    const locs = new Set(filteredPieces.map(p => p.inward_to).filter(Boolean));
    const manualCount = filteredPieces.filter(p => p.source === "manual").length;
    return {
      totalMeter,
      inwardMeter,
      manualMeter,
      pieceCount: filteredPieces.length,
      constructionCount: constructions.size,
      locationCount: locs.size,
      manualCount,
    };
  }, [filteredPieces]);

  // ── Pagination (applies to whichever view is active) ──
  const activeRows: any[] = viewMode === "piece" ? filteredPieces : filteredSummary;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / LIMIT));
  const pageRows = activeRows.slice((page - 1) * LIMIT, page * LIMIT);
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  // ── Export handlers ──
  const cols = viewMode === "piece" ? PIECE_COLUMNS : SUMMARY_COLUMNS;
  const stamp = new Date().toISOString().slice(0, 10);
  const title = viewMode === "piece" ? "Fabric Stock — Piece Detail" : "Fabric Stock — Summary";

  const handleExportCSV = () => {
    if (!activeRows.length) return;
    doExportCSV(activeRows, cols as any, `Fabric_Stock_${viewMode}_${stamp}.csv`);
  };
  const handleExportExcel = () => {
    if (!activeRows.length) return;
    doExportExcel(activeRows, cols as any, `Fabric_Stock_${viewMode}_${stamp}.xls`);
  };
  const handlePrint = () => {
    if (!activeRows.length) return;
    doPrintTable(activeRows, cols as any, title);
  };

  const clearFilters = () => { setSearch(""); setLocFilter(""); setSupFilter(""); setConFilter(""); };
  const hasFilters = Boolean(search || locFilter || supFilter || conFilter);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .fst-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        .fst-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .fst-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#92400e; }
        .fst-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        .fst-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

        .fst-refresh-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#92400e; border:1.5px solid #fde68a; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fst-refresh-btn:hover { background:#fffbeb; }
        .fst-refresh-btn:disabled { opacity:.6; cursor:not-allowed; }

        .fst-add-btn { display:flex; align-items:center; gap:6px; background:#d97706; color:#fff; border:1.5px solid #d97706; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fst-add-btn:hover { background:#b45309; border-color:#b45309; }

        .fst-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#374151; border:1.5px solid #cbd5e1; border-radius:9px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .fst-export-btn:hover { border-color:#d97706; color:#d97706; background:#fffbeb; }
        .fst-export-btn:disabled { opacity:.5; cursor:not-allowed; }
        .fst-export-menu { position:absolute; top:calc(100% + 6px); right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.14); z-index:500; min-width:180px; overflow:hidden; }
        .fst-export-menu-label { padding:6px 10px; font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #f1f5f9; background:#fafbfc; }
        .fst-export-item { display:flex; align-items:center; gap:10px; width:100%; padding:10px 14px; border:none; background:transparent; cursor:pointer; font-size:13px; color:#374151; font-family:'DM Sans',sans-serif; text-align:left; }
        .fst-export-item:hover { background:#f8fafc; }

        /* Stat cards */
        .fst-stats-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:16px; }
        @media(min-width:700px){ .fst-stats-grid { grid-template-columns:repeat(4,1fr); } }
        .fst-stat-card { display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
        .fst-stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .fst-stat-label { margin:0; font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em; }
        .fst-stat-value { margin:2px 0 0; font-size:19px; font-weight:800; color:#1e293b; font-family:'DM Mono',monospace; }
        .fst-stat-sub { margin:1px 0 0; font-size:11px; color:#94a3b8; }

        /* Toolbar */
        .fst-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .fst-search-wrap { position:relative; flex:1; min-width:180px; max-width:300px; }
        .fst-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .fst-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; background:#fff; }
        .fst-search:focus { border-color:#d97706; }
        .fst-select { padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; outline:none; min-width:140px; }
        .fst-select:focus { border-color:#d97706; }
        .fst-con-select-wrap { display:flex; flex-direction:column; gap:3px; }
        .fst-con-select { padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; outline:none; min-width:170px; max-width:220px; }
        .fst-con-select:focus { border-color:#d97706; }
        .fst-con-total { font-size:11px; font-weight:700; color:#166534; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:2px 8px; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; }
        .fst-clear-filters { background:none; border:none; color:#d97706; font-size:12px; font-weight:700; cursor:pointer; padding:6px 4px; }
        .fst-clear-filters:hover { text-decoration:underline; }
        .fst-rec-count { font-size:13px; color:#64748b; margin-left:auto; white-space:nowrap; }

        /* View toggle */
        .fst-view-toggle { display:flex; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; flex-shrink:0; }
        .fst-view-btn { display:flex; align-items:center; gap:5px; padding:7px 12px; background:#fff; border:none; cursor:pointer; font-size:12px; font-weight:700; color:#64748b; font-family:'DM Sans',sans-serif; }
        .fst-view-btn.active { background:#d97706; color:#fff; }
        .fst-view-btn:not(:last-child) { border-right:1px solid #cbd5e1; }

        .fst-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }

        /* ── Table wrap: horizontal scroll container ──
           Custom, slim, themed scrollbar (instead of the thick default OS
           bar) so it reads as part of the card, not a stray element sitting
           between the header row and the data rows. Also always reserves
           scrollbar gutter space so short tables (1-2 rows) don't jump/shift
           when the bar appears. */
        .fst-table-wrap {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
          scrollbar-color: #d97706 #fef3c7;
          scrollbar-gutter: stable;
        }
        .fst-table-wrap::-webkit-scrollbar { height: 8px; }
        .fst-table-wrap::-webkit-scrollbar-track { background: #fef3c7; }
        .fst-table-wrap::-webkit-scrollbar-thumb { background: #d97706; border-radius: 8px; }
        .fst-table-wrap::-webkit-scrollbar-thumb:hover { background: #b45309; }

        .fst-table { width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
        .fst-table thead tr { background:#d97706; }
        .fst-table th { padding:11px 12px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .fst-table th.th-r { text-align:right; }
        .fst-table th.th-c { text-align:center; }
        .fst-table tbody tr:nth-child(odd)  td { background:#fff; }
        .fst-table tbody tr:nth-child(even) td { background:#fffbeb; }
        .fst-table tbody tr:hover td { filter:brightness(0.97); }
        .fst-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .fst-mono { font-family:'DM Mono',monospace; }
        .fst-fpi-no { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; }
        .fst-fpo-no { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#7c3aed; background:#faf5ff; border:1px solid #c4b5fd; border-radius:6px; padding:2px 7px; }
        .fst-inv-no { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:2px 7px; }
        .fst-sort-badge { font-family:'DM Mono',monospace; font-weight:700; color:#92400e; }
        .fst-td-num { text-align:right; font-family:'DM Mono',monospace; font-weight:700; }
        .fst-td-c { text-align:center; }
        .fst-empty { text-align:center; padding:48px 16px; color:#94a3b8; font-size:13px; }
        .fst-error { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:12px 16px; border-radius:10px; font-size:13px; margin-bottom:14px; }
        .fst-row-actions { display:flex; align-items:center; justify-content:center; gap:6px; }
        .fst-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; }
        .fst-edit-btn { border-color:#bfdbfe; color:#1d4ed8; }
        .fst-edit-btn:hover { background:#eff6ff; }
        .fst-del-btn { border-color:#fecaca; color:#b91c1c; }
        .fst-del-btn:hover { background:#fef2f2; }

        .fst-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#fffbeb; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .fst-pg-btns { display:flex; gap:4px; align-items:center; }
        .fst-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif; }
        .fst-pg-btn:hover:not(:disabled) { background:#f1f5f9; }
        .fst-pg-btn.active { background:#d97706; color:#fff; border-color:#d97706; font-weight:700; }
        .fst-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .fst-loading-wrap { display:flex; align-items:center; justify-content:center; padding:60px 16px; }

        /* Add/Edit In-Stock modal */
        .fst-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; padding:5vh 16px; z-index:1000; overflow-y:auto; }
        .fst-modal { background:#fff; border-radius:14px; width:100%; max-width:640px; box-shadow:0 20px 60px rgba(0,0,0,0.3); font-family:'DM Sans',sans-serif; }
        .fst-modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f1f5f9; }
        .fst-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:#92400e; }
        .fst-modal-close { background:none; border:none; cursor:pointer; color:#94a3b8; padding:4px; border-radius:6px; display:flex; }
        .fst-modal-close:hover { background:#f1f5f9; color:#374151; }
        .fst-modal-body { padding:18px 20px; max-height:62vh; overflow-y:auto; }
        .fst-modal-hint { margin:0 0 14px; font-size:12.5px; color:#64748b; line-height:1.5; }
        .fst-modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid #f1f5f9; }
        .fst-form-grid { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:520px){ .fst-form-grid { grid-template-columns:1fr 1fr; } }
        .fst-form-field { display:flex; flex-direction:column; gap:5px; }
        .fst-form-label { font-size:12px; font-weight:700; color:#475569; }
        .fst-form-input { padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; background:#fff; resize:vertical; }
        .fst-form-input:focus { border-color:#d97706; }
        .fst-form-error { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:9px 12px; border-radius:8px; font-size:12.5px; margin-bottom:14px; }
        .fst-btn-secondary { padding:9px 16px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; color:#374151; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fst-btn-secondary:hover { background:#f8fafc; }
        .fst-btn-primary { display:flex; align-items:center; gap:6px; padding:9px 18px; border-radius:8px; border:1.5px solid #d97706; background:#d97706; color:#fff; font-weight:700; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fst-btn-primary:hover { background:#b45309; border-color:#b45309; }
        .fst-btn-primary:disabled, .fst-btn-secondary:disabled { opacity:.6; cursor:not-allowed; }
      `}</style>

      <div className="fst-wrap">

        {/* ── Page Header ── */}
        <div className="fst-page-header">
          <div>
            <h1>Fabric Stock</h1>
            <p>
              Stock from Fabric Inward + manual entries — {stats.pieceCount} piece(s) in view
              {stats.manualCount > 0 && ` (${stats.manualCount} manual)`}
            </p>
          </div>
          <div className="fst-header-actions">
            <button className="fst-add-btn" onClick={openAddModal}>
              <PlusCircle size={15} /> Add In-Stock
            </button>
            <button className="fst-refresh-btn" onClick={loadAll} disabled={loading}>
              <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
              Refresh
            </button>
            <ExportMenu
              onCSV={handleExportCSV}
              onExcel={handleExportExcel}
              onPrint={handlePrint}
              disabled={loading || !activeRows.length}
            />
          </div>
        </div>

        {error && (
          <div className="fst-error">
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
            <button onClick={loadAll} style={{ marginLeft: "auto", background: "none", border: "1px solid currentColor", borderRadius: 6, color: "inherit", padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="fst-stats-grid">
          <StatCard
            icon={<Boxes size={19} />}
            label="Total Stock Meter"
            value={`${fmt(stats.totalMeter)} M`}
            sub={`Inward ${fmt(stats.inwardMeter)} M + Manual ${fmt(stats.manualMeter)} M`}
            accent="#d97706"
          />
          <StatCard icon={<Package size={19} />} label="Pieces in Stock" value={String(stats.pieceCount)} accent="#0f766e" />
          <StatCard icon={<Layers size={19} />} label="Constructions" value={String(stats.constructionCount)} accent="#7c3aed" />
          <StatCard icon={<MapPin size={19} />} label="Locations" value={String(stats.locationCount)} accent="#2563eb" />
        </div>

        {/* ── Toolbar ── */}
        <div className="fst-toolbar">
          <div className="fst-view-toggle">
            <button className={`fst-view-btn${viewMode === "summary" ? " active" : ""}`} onClick={() => setViewMode("summary")}>
              <LayoutGrid size={13} /> Summary
            </button>
            <button className={`fst-view-btn${viewMode === "piece" ? " active" : ""}`} onClick={() => setViewMode("piece")}>
              <List size={13} /> Piece Detail
            </button>
          </div>

          <div className="fst-search-wrap">
            <Search size={14} />
            <input className="fst-search" type="text"
              placeholder="Search sort no, construction, ref no, invoice no…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="fst-select" value={locFilter} onChange={e => setLocFilter(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select className="fst-select" value={supFilter} onChange={e => setSupFilter(e.target.value)}>
            <option value="">All Suppliers</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Construction filter — shows the total meter for the selected
              construction (summed across all its Sort Nos) right below it. */}
          <div className="fst-con-select-wrap">
            <select className="fst-con-select" value={conFilter} onChange={e => setConFilter(e.target.value)}>
              <option value="">All Constructions</option>
              {constructions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {selectedConstructionTotal && (
              <span className="fst-con-total">
                <Boxes size={11} />
                Total {fmt(selectedConstructionTotal.total_meter)} M · {selectedConstructionTotal.piece_count} pc(s)
              </span>
            )}
          </div>

          {hasFilters && <button className="fst-clear-filters" onClick={clearFilters}>Clear filters</button>}

          <span className="fst-rec-count">{activeRows.length} record(s)</span>
        </div>

        {/* ── Table ── */}
        <div className="fst-card">
          {loading ? (
            <div className="fst-loading-wrap">
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#d97706" }} />
            </div>
          ) : viewMode === "summary" ? (
            <div className="fst-table-wrap">
              <table className="fst-table">
                <thead>
                  <tr>
                    <th>Sort No</th>
                    <th>Construction</th>
                    {width >= 640 && <th>HSN Code</th>}
                    <th className="th-r">Pieces</th>
                    <th className="th-r">Total Meter</th>
                    {width >= 768 && <th>Suppliers</th>}
                    {width >= 900 && <th>Locations</th>}
                    {width >= 1024 && <th>Last Inward</th>}
                    <th className="th-c">Stock Level</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={99} className="fst-empty">
                      {hasFilters ? "No stock matches your filters." : "No stock recorded yet — create a Fabric Purchase Inward or add stock manually to get started."}
                    </td></tr>
                  ) : (pageRows as StockSummaryRow[]).map((row, i) => (
                    <tr key={`${row.sort_no}-${row.construction}-${i}`}>
                      <td><span className="fst-sort-badge">{row.sort_no || "—"}</span></td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={row.construction}>
                        {row.construction || "—"}
                      </td>
                      {width >= 640 && <td className="fst-mono">{row.hsn_code || "—"}</td>}
                      <td className="fst-td-num">{row.piece_count}</td>
                      <td className="fst-td-num" style={{ color: "#d97706" }}>{fmt(row.total_meter)} M</td>
                      {width >= 768 && <td><Chips values={row.suppliers} tone="slate" /></td>}
                      {width >= 900 && <td><Chips values={row.locations} tone="amber" /></td>}
                      {width >= 1024 && <td style={{ color: "#64748b" }}>{fmtDate(row.last_inward)}</td>}
                      <td className="fst-td-c"><LevelBadge level={getStockLevel(row.total_meter)} /></td>
                    </tr>
                  ))}
                </tbody>
                {conFilter && filteredSummary.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ fontWeight: 800, color: "#92400e", background: "#fffbeb" }}>
                        Total — {conFilter}
                      </td>
                      {width >= 640 && <td style={{ background: "#fffbeb" }} />}
                      <td className="fst-td-num" style={{ background: "#fffbeb" }}>
                        {filteredSummary.reduce((s, r) => s + r.piece_count, 0)}
                      </td>
                      <td className="fst-td-num" style={{ background: "#fffbeb", color: "#d97706" }}>
                        {fmt(filteredSummary.reduce((s, r) => s + r.total_meter, 0))} M
                      </td>
                      {width >= 768 && <td style={{ background: "#fffbeb" }} />}
                      {width >= 900 && <td style={{ background: "#fffbeb" }} />}
                      {width >= 1024 && <td style={{ background: "#fffbeb" }} />}
                      <td style={{ background: "#fffbeb" }} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="fst-table-wrap">
              <table className="fst-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ref No</th>
                    <th>Date</th>
                    <th className="th-c">Source</th>
                    {width >= 640 && <th>FPO No</th>}
                    <th>Supplier</th>
                    <th>Sort No</th>
                    {width >= 768 && <th>Construction</th>}
                    {width >= 960 && <th>Location</th>}
                    {width >= 960 && <th>Lot No</th>}
                    {width >= 1200 && <th>Purchase Invoice No</th>}
                    <th>Piece No</th>
                    {width >= 1100 && <th>Roll No</th>}
                    <th className="th-r">Meter</th>
                    <th className="th-c">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={99} className="fst-empty">
                      {hasFilters ? "No pieces match your filters." : "No stock recorded yet — create a Fabric Purchase Inward or add stock manually to get started."}
                    </td></tr>
                  ) : (pageRows as StockPiece[]).map((p, i) => (
                    <tr key={`${p.source}-${p.id}`}>
                      <td style={{ color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                      <td><span className="fst-fpi-no">{p.fpi_no}</span></td>
                      <td style={{ color: "#64748b" }}>{fmtDate(p.fpi_date)}</td>
                      <td className="fst-td-c"><SourceBadge source={p.source} /></td>
                      {width >= 640 && <td>{p.fpo_no ? <span className="fst-fpo-no">{p.fpo_no}</span> : "—"}</td>}
                      <td style={{ fontWeight: 600 }}>{p.supplier || "—"}</td>
                      <td><span className="fst-sort-badge">{p.sort_no || "—"}</span></td>
                      {width >= 768 && <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={p.construction}>{p.construction || "—"}</td>}
                      {width >= 960 && <td>{p.inward_to || "—"}</td>}
                      {width >= 960 && <td>{p.lot_no || "—"}</td>}
                      {width >= 1200 && <td>{p.purchase_invoice_no ? <span className="fst-inv-no">{p.purchase_invoice_no}</span> : "—"}</td>}
                      <td className="fst-mono">{p.piece_no || "—"}</td>
                      {width >= 1100 && <td className="fst-mono">{p.new_piece_no || "—"}</td>}
                      <td className="fst-td-num">{fmt(p.meter)} M</td>
                      <td className="fst-td-c">
                        {p.source === "manual" ? (
                          <div className="fst-row-actions">
                            <button className="fst-icon-btn fst-edit-btn" title="Edit manual entry" onClick={() => openEditModal(p)}>
                              <Pencil size={13} />
                            </button>
                            <button className="fst-icon-btn fst-del-btn" title="Delete manual entry" onClick={() => handleDeleteManual(p.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && activeRows.length > 0 && (
            <div className="fst-pg-bar">
              <span>Page {page} of {totalPages} — {activeRows.length} record(s)</span>
              <div className="fst-pg-btns">
                <button className="fst-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="fst-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`fst-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="fst-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="fst-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

      </div>

      <AddInStockModal
        open={showManualModal}
        mode={modalMode}
        form={manualForm}
        saving={manualSaving}
        error={manualError}
        existingSortMeta={existingSortMeta}
        onChange={handleManualChange}
        onClose={closeManualModal}
        onSubmit={handleManualSubmit}
      />
    </>
  );
}