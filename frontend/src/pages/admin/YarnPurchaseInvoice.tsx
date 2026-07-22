// @ts-nocheck
// frontend/src/pages/admin/YarnPurchaseInvoice.tsx
//
// YARN PURCHASE INVOICE — supplier's bill entry against a Yarn Purchase
// Order (YPO) we raised earlier.
//
// This is the yarn-dedicated sibling of PurchaseInvoice.tsx (the Fabric
// invoice screen). Same visual language (teal "FPI Details" pill-badge
// style: LOCKED / DATE / LOOKUP / SELECT / TEXT / NUMBER / AUTOFILL /
// COMPUTED badges next to each label) and the same autofill-then-editable
// pattern, but:
//   • "PO No" search only searches Yarn Purchase Orders (YPO)
//   • Unit is fixed to KG (yarn is always weighed)
//   • "Quality" becomes "Count / Lot" (yarn count + lot description)
//   • Delivery Items use Bags/Bag No/Lot No instead of Piece No/Roll No
//     (yarn ships in bags of cones, not fabric rolls/pieces)
//
// AUTOFILL CHAIN (selecting a "PO No" auto-fills):
//   Order No / Order Date / Due Date  ← from the selected YPO
//   Supplier, Supplier Address, GSTIN ← from the selected YPO's supplier
//   Count/Lot, HSN Code, Rate         ← from the selected YPO line
//   Total Order Qty (kg) + how much of it is already invoiced
//   GST Type + CGST/SGST/IGST %
//   Advance
//   All autofilled fields remain editable afterwards.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, ChevronDown, ChevronUp, Loader2, AlertCircle,
  CheckCircle2, Info, AlertTriangle, Trash2, PlusCircle, Check,
  Printer, MoreVertical,
} from "lucide-react";

import {
  getYarnPurchaseInvoices,
  getYarnPurchaseInvoiceById,
  createYarnPurchaseInvoice,
  updateYarnPurchaseInvoice,
  deleteYarnPurchaseInvoice,
  getNextYarnInvoiceNo,
  searchYarnPoLines,
  YarnPurchaseInvoicePayload,
  YarnPurchaseInvoiceItem,
  YarnPoLineOption,
  YarnGstType,
} from "../../api/services"; // ← adjust path if you merge this into ../../api/services

// ─── Toast (same pattern used across this app) ───────────────────────────

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
    info:    { bg: "#f0fdfa", border: "#99f6e4", color: "#0f766e", icon: <Info          size={16} color="#0d9488" /> },
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

// ─── Field type badge (LOCKED / DATE / LOOKUP / SELECT / TEXT / AUTOFILL) ──

const FT_CFG: Record<string, { label: string; bg: string; color: string }> = {
  locked:   { label: "Locked",   bg: "#fee2e2", color: "#b91c1c" },
  date:     { label: "Date",     bg: "#fff7ed", color: "#c2410c" },
  lookup:   { label: "Lookup",   bg: "#ede9fe", color: "#6d28d9" },
  select:   { label: "Select",   bg: "#f0fdf4", color: "#166534" },
  text:     { label: "Text",     bg: "#f8fafc", color: "#475569" },
  number:   { label: "Number",   bg: "#fdf4ff", color: "#86198f" },
  autofill: { label: "Autofill", bg: "#e0f2fe", color: "#0369a1" },
  computed: { label: "Computed", bg: "#fef9c3", color: "#92400e" },
};
function FTypeBadge({ type }: { type: string }) {
  const c = FT_CFG[type];
  if (!c) return null;
  return (
    <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: c.bg, color: c.color, letterSpacing: "0.04em", textTransform: "uppercase", marginLeft: 5, verticalAlign: "middle" }}>{c.label}</span>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────

const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = (raw?: string | null): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s || s === "null") return "";
  const d = s.includes("T") ? new Date(s) : new Date(`${s.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const emptyItem = (): YarnPurchaseInvoiceItem => ({ delivered_qty: 0, no_of_bags: null, bag_no: "", lot_no: "", rate: 0, amount: 0 });

const defaultForm = (): YarnPurchaseInvoicePayload => ({
  invoice_no: "", invoice_date: today(), due_date: "",
  ypo_id: null, ypo_item_id: null, po_no: "", po_date: "",
  supplier: "", supplier_address: "", supplier_gstin: "",
  quality: "", hsn_code: "", unit: "KG", rate: 0,
  total_order_qty: 0, already_invoiced_qty: 0, delivered_qty: 0, balance_qty: 0,
  gst_type: "CGST_SGST", cgst_pct: 0, sgst_pct: 0, igst_pct: 0,
  advance: 0, sub_total: 0, gst_amount: 0, net_value: 0, balance_due: 0,
  remarks: "", status: "Pending",
  items: [emptyItem()],
});

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

const sLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };

function Field({ label, type, required, hint, children }: { label: string; type?: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={sLabel}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}{type && <FTypeBadge type={type} />}</label>
      {children}
      {hint && <p className="yinv-hint">{hint}</p>}
    </div>
  );
}
function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="yinv-section-head" onClick={onToggle}>
      <span className="yinv-section-title">{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── PO Line Dropdown — Yarn PO (YPO) search only ─────────────────────────

interface PoLineDropdownProps { value: string; label: string; onSelect: (line: YarnPoLineOption | null) => void; }
function PoLineDropdown({ value, label, onSelect }: PoLineDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YarnPoLineOption[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchYarnPoLines(query));
      } catch (err: any) {
        console.error('[PoLineDropdown] searchYarnPoLines failed:', err.message || err);
        setResults([]);
      }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  return (
    <div className="yinv-dd-wrap" ref={wrapRef}>
      <button type="button" className={`yinv-dd-trigger${open ? " open" : ""}${value ? " has-value" : ""}`} onClick={() => setOpen(o => !o)}>
        <span className="yinv-dd-content">
          {value ? <span className="yinv-dd-badge">{label}</span> : <span className="yinv-dd-placeholder">Search YPO No or supplier…</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {value && <span className="yinv-dd-clear" onClick={e => { e.stopPropagation(); onSelect(null); }} title="Clear"><X size={13} /></span>}
          <ChevronDown size={14} style={{ color: "#64748b", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>

      {open && (
        <div className="yinv-dd-panel">
          <div className="yinv-dd-search-wrap">
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input ref={inputRef} className="yinv-dd-search" placeholder="Search YPO No, supplier, count/lot…" value={query} onChange={e => setQuery(e.target.value)} />
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "#0d9488" }} />}
          </div>
          <div className="yinv-dd-count">
            {loading ? <span>Searching…</span> : results.length === 0
              ? <span style={{ color: "#c2410c" }}>{query ? `No YPO lines match "${query}"` : "Start typing a YPO No or supplier"}</span>
              : <span>{results.length} PO line{results.length !== 1 ? "s" : ""}</span>}
          </div>
          <div className="yinv-dd-list">
            {results.map(line => (
              <div key={line.key} className="yinv-dd-option" onClick={() => { onSelect(line); setOpen(false); setQuery(""); }}>
                <div className="yinv-dd-opt-row1">
                  <span className="yinv-po-type-chip">YPO</span>
                  <span className="yinv-dd-opt-no">{line.po_no}</span>
                  <span className="yinv-dd-opt-date">{fmtDate(line.po_date)}</span>
                </div>
                <div className="yinv-dd-opt-row2">
                  <span className="yinv-dd-opt-supplier">{line.supplier}</span>
                  {line.quality && <span className="yinv-dd-opt-quality" title={line.quality}>{line.quality.length > 26 ? line.quality.slice(0, 24) + "…" : line.quality}</span>}
                </div>
                <div className="yinv-dd-opt-row3">
                  <span className="yinv-dd-opt-bal" style={{ color: line.balance_qty <= 0 ? "#dc2626" : "#0f766e" }}>
                    Balance: {fmtQty(line.balance_qty)} KG {line.balance_qty <= 0 ? "(fully invoiced)" : `of ${fmtQty(line.total_qty)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {value && <p className="yinv-dd-status"><Check size={11} style={{ marginRight: 3 }} />{label} linked</p>}
    </div>
  );
}

// ─── Row Actions Menu (kebab, portal-based — same fix as FPO/FPI modules) ──

function RowActionsMenu({ onEdit, onPrint, onDelete }: { onEdit: () => void; onPrint: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const menuH = 140, menuW = 190;
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow > menuH + 8 ? r.bottom + 4 : Math.max(8, r.top - menuH - 4);
      const left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
      setPos({ top, left: Math.max(8, left) });
    }
    setOpen(o => !o);
  };

  const Item = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button type="button" className={`yinv-row-menu-item${danger ? " yinv-row-menu-item--danger" : ""}`} onClick={() => { setOpen(false); onClick(); }}>
      {icon}<span>{label}</span>
    </button>
  );

  const panel = open ? (
    <div ref={panelRef} className="yinv-row-menu-panel" style={{ position: "fixed", top: pos.top, left: pos.left, width: 190, zIndex: 9999 }}>
      <Item icon={<span style={{ fontSize: 14 }}>✏️</span>} label="Edit" onClick={onEdit} />
      <Item icon={<Printer size={14} color="#0284c7" />} label="Print" onClick={onPrint} />
      <div className="yinv-row-menu-divider" />
      <Item icon={<Trash2 size={14} color="#dc2626" />} label="Delete" onClick={onDelete} danger />
    </div>
  ) : null;

  return (
    <>
      <button ref={triggerRef} type="button" className="yinv-row-menu-btn" onClick={toggle} title="Actions"><MoreVertical size={16} /></button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
interface YarnPurchaseInvoiceProps {
  /** Pre-fills the search box — e.g. an invoice_no passed via ?invoice=...
   *  right after converting a YPO, same pattern as FabricPurchaseInvoice's
   *  initialFilter. Optional; the screen opens showing the full list when
   *  omitted. */
  initialFilter?: string;
}

export default function YarnPurchaseInvoice({ initialFilter }: YarnPurchaseInvoiceProps = {}) {
  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width = useWidth();

  const [invoices, setInvoices] = useState<YarnPurchaseInvoicePayload[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState(initialFilter || "");
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<YarnPurchaseInvoicePayload>(defaultForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [invGenerating, setInvGenerating] = useState(false);
  const [sec, setSec] = useState({ details: true, items: true, gst: true });

  const [deleteTarget, setDeleteTarget] = useState<YarnPurchaseInvoicePayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Fetch list ──
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getYarnPurchaseInvoices({ search, page, limit: pageSize });
      setInvoices(res.data);
      setTotal(res.total);
    } catch (e: any) {
      pushToast("error", "Load Failed", e.message || "Could not fetch yarn purchase invoices.");
    } finally { setLoading(false); }
  }, [search, page, pageSize, pushToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { setPage(1); }, [search, pageSize]);
  useEffect(() => { document.body.style.overflow = showModal ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [showModal]);

  // ── Totals (live, recomputed from items + header rate/gst) ──
  const totals = useMemo(() => {
    const items = form.items || [];
    const delivered_qty = +items.reduce((s, i) => s + (Number(i.delivered_qty) || 0), 0).toFixed(3);
    const sub_total = +items.reduce((s, i) => {
      const rate = i.rate !== undefined && i.rate !== null && i.rate !== ('' as any) ? Number(i.rate) : Number(form.rate) || 0;
      return s + (Number(i.delivered_qty) || 0) * rate;
    }, 0).toFixed(2);
    const gstPct = (Number(form.cgst_pct) || 0) + (Number(form.sgst_pct) || 0) + (Number(form.igst_pct) || 0);
    const gst_amount = +(sub_total * gstPct / 100).toFixed(2);
    const net_value = +(sub_total + gst_amount).toFixed(2);
    const balance_due = +(net_value - (Number(form.advance) || 0)).toFixed(2);
    const balance_qty = +((Number(form.total_order_qty) || 0) - (Number(form.already_invoiced_qty) || 0) - delivered_qty).toFixed(3);
    return { delivered_qty, sub_total, gst_amount, net_value, balance_due, balance_qty };
  }, [form]);

  // ── YPO line selection → autofill chain ──
  const selectPoLine = (line: YarnPoLineOption | null) => {
    if (!line) {
      setForm(f => ({
        ...f, ypo_id: null, ypo_item_id: null, po_no: "", po_date: "",
        supplier: "", supplier_address: "", supplier_gstin: "", quality: "", hsn_code: "", rate: 0,
        total_order_qty: 0, already_invoiced_qty: 0,
        gst_type: "CGST_SGST", cgst_pct: 0, sgst_pct: 0, igst_pct: 0, advance: 0,
      }));
      return;
    }
    setForm(f => ({
      ...f,
      ypo_id: line.po_id,
      ypo_item_id: line.item_id,
      po_no: line.po_no,
      po_date: line.po_date,
      due_date: f.due_date || line.due_date || "",
      supplier: line.supplier,
      supplier_address: line.supplier_address,
      supplier_gstin: line.supplier_gstin,
      quality: line.quality,
      hsn_code: line.hsn_code,
      unit: "KG",
      rate: line.rate,
      total_order_qty: line.total_qty,
      already_invoiced_qty: line.already_invoiced_qty,
      gst_type: line.gst_type,
      cgst_pct: line.cgst_pct,
      sgst_pct: line.sgst_pct,
      igst_pct: line.igst_pct,
      advance: line.advance,
    }));
    pushToast("info", `YPO ${line.po_no} linked`,
      `Autofilled → Supplier: ${line.supplier} | Count/Lot: ${line.quality || "—"} | Balance: ${fmtQty(line.balance_qty)} KG`);
  };

  // ── Item row handlers ──
  const updateItem = (idx: number, patch: Partial<YarnPurchaseInvoiceItem>) =>
    setForm(f => { const items = [...f.items]; items[idx] = { ...items[idx], ...patch }; return { ...f, items }; });
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  // ── Open create ──
  const handleNew = async () => {
    setForm(defaultForm());
    setEditId(null); setSaveError(""); setSec({ details: true, items: true, gst: true });
    setShowModal(true);
    setInvGenerating(true);
    try {
      const res = await getNextYarnInvoiceNo();
      setForm(f => ({ ...f, invoice_no: res.invoice_no }));
    } catch {
      setForm(f => ({ ...f, invoice_no: `YINV-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}` }));
      pushToast("warning", "Invoice No Fallback", "Server unavailable — used a local placeholder. Verify before saving.");
    } finally { setInvGenerating(false); }
  };

  const handleOpenEdit = async (inv: YarnPurchaseInvoicePayload) => {
    setEditId(inv.id!); setSaveError(""); setSec({ details: true, items: true, gst: true }); setShowModal(true);
    try {
      const full = await getYarnPurchaseInvoiceById(inv.id!);
      setForm({ ...defaultForm(), ...full, items: full.items?.length ? full.items : [emptyItem()] });
    } catch {
      pushToast("error", "Load Failed", "Could not load full invoice details.");
      setForm({ ...defaultForm(), ...inv });
    }
  };

  const handleClose = () => { setShowModal(false); setForm(defaultForm()); setEditId(null); setSaveError(""); };

  const handleSave = async () => {
    setSaveError("");
    if (!form.invoice_no || !form.invoice_date || !form.supplier) { setSaveError("Invoice No, Invoice Date and Supplier are required."); return; }
    if (!form.ypo_id || !form.ypo_item_id) { setSaveError("Please select a PO No (YPO) to invoice against."); return; }
    if (!form.items.some(i => Number(i.delivered_qty) > 0)) { setSaveError("Add at least one delivery row with a quantity greater than zero."); return; }
    setSaving(true);
    try {
      const payload = { ...form, ...totals };
      if (editId) {
        await updateYarnPurchaseInvoice(editId, payload);
        pushToast("success", "Invoice Updated", `"${form.invoice_no}" updated successfully.`);
      } else {
        await createYarnPurchaseInvoice(payload);
        pushToast("success", "Invoice Created", `"${form.invoice_no}" created successfully.`);
      }
      handleClose();
      fetchInvoices();
    } catch (e: any) {
      const msg = e.message || "Failed to save yarn purchase invoice.";
      setSaveError(msg); pushToast("error", "Save Failed", msg);
    } finally { setSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    try {
      await deleteYarnPurchaseInvoice(deleteTarget.id!);
      pushToast("warning", "Invoice Deleted", `"${deleteTarget.invoice_no}" has been deleted.`);
      setDeleteTarget(null); fetchInvoices();
    } catch (e: any) {
      pushToast("error", "Delete Failed", e.message || "Could not delete yarn purchase invoice.");
    } finally { setDeleteConfirming(false); }
  };

  // ── Simple print (tabular, no letterhead — see YPO's print for a
  //    company-letterhead pattern you can port here later if needed) ──
  const handlePrint = async (invInput: YarnPurchaseInvoicePayload) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { pushToast("error", "Popup Blocked", "Please allow popups to print this invoice."); return; }
    let inv = invInput;
    if (invInput.id) {
      try { inv = await getYarnPurchaseInvoiceById(invInput.id); } catch { /* fall back to row data */ }
    }
    const items = inv.items ?? [];
    const rows = items.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="r">${fmtQty(it.delivered_qty)}</td>
        <td class="c">${it.no_of_bags ?? "—"}</td>
        <td>${it.bag_no || "—"}</td>
        <td>${it.lot_no || "—"}</td>
        <td class="r">₹${fmt(it.rate ?? inv.rate)}</td>
        <td class="r">₹${fmt(it.amount ?? (Number(it.delivered_qty) * Number(it.rate ?? inv.rate)))}</td>
      </tr>`).join("");

    win.document.write(`<!DOCTYPE html><html><head><title>Yarn Purchase Invoice — ${inv.invoice_no}</title>
      <style>
        body{font-family:'Times New Roman',Times,serif;font-size:12.5px;color:#1e293b;margin:26px;}
        h2{margin:0 0 2px;color:#0f766e;} p.sub{margin:0 0 16px;color:#64748b;font-size:11px;}
        table.meta{width:100%;border-collapse:collapse;margin-bottom:14px;}
        table.meta td{border:1px solid #99f6e4;padding:8px 12px;font-size:11.5px;vertical-align:top;}
        table.meta .lbl{color:#0f766e;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em;}
        table.items{width:100%;border-collapse:collapse;margin-top:6px;}
        table.items th{background:#0f766e;color:#fff;padding:7px 9px;font-size:10.5px;text-align:left;text-transform:uppercase;}
        table.items td{border:1px solid #cbd5e1;padding:6px 9px;font-size:11.5px;}
        td.c{text-align:center;} td.r{text-align:right;}
        table.items tbody tr:nth-child(even) td{background:#f0fdfa;}
        .totals{width:320px;margin-left:auto;margin-top:14px;border-collapse:collapse;}
        .totals td{padding:5px 8px;font-size:12.5px;} .totals .lbl{color:#475569;} .totals .val{text-align:right;font-weight:700;}
        .totals .grand td{border-top:2px solid #0f766e;padding-top:8px;font-size:14px;font-weight:800;color:#0f766e;}
        @media print{body{margin:12px;} table.items th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <h2>Yarn Purchase Invoice</h2>
      <p class="sub">${inv.invoice_no} — printed ${new Date().toLocaleString()}</p>
      <table class="meta">
        <tr>
          <td style="width:50%;"><span class="lbl">YPO No</span><br/>${inv.po_no || "—"} &nbsp;•&nbsp; ${fmtDate(inv.po_date)}</td>
          <td style="width:50%;"><span class="lbl">Invoice Date / Due Date</span><br/>${fmtDate(inv.invoice_date)} &nbsp;→&nbsp; ${fmtDate(inv.due_date) || "—"}</td>
        </tr>
        <tr>
          <td><span class="lbl">Supplier</span><br/><strong>${inv.supplier}</strong>${inv.supplier_address ? `<br/>${String(inv.supplier_address).replace(/\n/g, "<br/>")}` : ""}${inv.supplier_gstin ? `<br/>GSTIN: ${inv.supplier_gstin}` : ""}</td>
          <td><span class="lbl">Count/Lot / HSN / Unit / Rate</span><br/>${inv.quality || "—"} &nbsp;•&nbsp; HSN ${inv.hsn_code || "—"} &nbsp;•&nbsp; KG &nbsp;•&nbsp; ₹${fmt(inv.rate)}</td>
        </tr>
      </table>
      <table class="items">
        <thead><tr><th class="c">#</th><th class="r">Weight (kg)</th><th class="c">Bags</th><th>Bag No</th><th>Lot No</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table class="totals">
        <tr><td class="lbl">Sub Total</td><td class="val">₹${fmt(inv.sub_total)}</td></tr>
        <tr><td class="lbl">GST (${(Number(inv.cgst_pct)||0)+(Number(inv.sgst_pct)||0)+(Number(inv.igst_pct)||0)}%)</td><td class="val">₹${fmt(inv.gst_amount)}</td></tr>
        <tr class="grand"><td class="lbl">Net Value</td><td class="val">₹${fmt(inv.net_value)}</td></tr>
        <tr><td class="lbl">Advance</td><td class="val">₹${fmt(inv.advance)}</td></tr>
        <tr><td class="lbl">Balance Due</td><td class="val">₹${fmt(inv.balance_due)}</td></tr>
      </table>
      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`);
    win.document.close(); win.focus();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ddSlide{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}

        .yinv-wrap{font-family:'DM Sans',sans-serif;font-size:14px;color:#1e293b;}
        .yinv-page-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;}
        .yinv-page-header h1{margin:0;font-size:20px;font-weight:800;color:#0f766e;}
        .yinv-page-header p{margin:3px 0 0;font-size:13px;color:#64748b;}
        .yinv-new-btn{display:flex;align-items:center;gap:6px;background:#0d9488;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(13,148,136,.35);}
        .yinv-new-btn:hover{background:#0f766e;}

        .yinv-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;}
        .yinv-search-wrap{position:relative;flex:1;min-width:180px;max-width:320px;}
        .yinv-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);}
        .yinv-search{width:100%;padding:8px 12px 8px 34px;border:1px solid #99f6e4;border-radius:8px;font-size:13px;outline:none;background:#fff;}
        .yinv-search:focus{border-color:#0d9488;}
        .yinv-page-size{display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;margin-left:auto;}
        .yinv-page-size select{border:1px solid #99f6e4;border-radius:6px;padding:5px 8px;font-size:13px;background:#fff;cursor:pointer;outline:none;}

        .yinv-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.07);margin-bottom:24px;}
        .yinv-table-wrap{overflow-x:auto;}
        .yinv-table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px;}
        .yinv-table thead tr{background:#0f766e;}
        .yinv-table th{padding:11px 12px;color:#fff;font-weight:700;text-align:left;font-size:12px;white-space:nowrap;}
        .yinv-table th.th-r{text-align:right;}
        .yinv-table tbody tr:nth-child(odd) td{background:#fff;}
        .yinv-table tbody tr:nth-child(even) td{background:#f0fdfa;}
        .yinv-table tbody tr:hover td{background:#ccfbf1;}
        .yinv-table td{padding:10px 12px;color:#374151;font-size:12px;white-space:nowrap;}
        .yinv-td-num{text-align:right;font-family:'DM Mono',monospace;}
        .yinv-empty{text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;}
        .yinv-inv-no{font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:2px 7px;}
        .yinv-po-no{font-weight:600;color:#0369a1;}
        .yinv-status-chip{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;}
        .yinv-status-Pending{background:#fef3c7;color:#b45309;}
        .yinv-status-Paid{background:#dcfce7;color:#166534;}
        .yinv-status-Draft{background:#f3f4f6;color:#374151;}
        .yinv-status-Cancelled{background:#fee2e2;color:#991b1b;}

        .yinv-row-menu-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid #e2e8f0;background:#fff;border-radius:7px;cursor:pointer;color:#64748b;}
        .yinv-row-menu-btn:hover{background:#f0fdfa;border-color:#99f6e4;color:#0d9488;}
        .yinv-row-menu-panel{background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.16);overflow:hidden;animation:ddSlide .12s ease;padding:4px;}
        .yinv-row-menu-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 11px;border:none;background:transparent;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:#374151;text-align:left;}
        .yinv-row-menu-item:hover{background:#f8fafc;}
        .yinv-row-menu-item--danger{color:#dc2626;}
        .yinv-row-menu-item--danger:hover{background:#fef2f2;}
        .yinv-row-menu-divider{height:1px;background:#f1f5f9;margin:3px 4px;}

        .yinv-pg-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px solid #f1f5f9;background:#f0fdfa;font-size:12px;color:#64748b;flex-wrap:wrap;gap:8px;}
        .yinv-pg-btns{display:flex;gap:4px;align-items:center;}
        .yinv-pg-btn{padding:4px 10px;border:1px solid #99f6e4;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;min-width:30px;height:30px;display:flex;align-items:center;justify-content:center;}
        .yinv-pg-btn:hover:not(:disabled){background:#f0fdfa;}
        .yinv-pg-btn.active{background:#0d9488;color:#fff;border-color:#0d9488;font-weight:700;}
        .yinv-pg-btn:disabled{border-color:#e2e8f0;background:#f1f5f9;color:#94a3b8;cursor:not-allowed;}

        .yinv-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;z-index:2000;overflow-y:auto;padding:16px 8px;}
        .yinv-modal{background:#fff;border-radius:14px;width:100%;max-width:920px;box-shadow:0 8px 40px rgba(0,0,0,.22);display:flex;flex-direction:column;max-height:calc(100vh - 32px);}
        .yinv-modal-header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#0d9488,#0f766e);flex-shrink:0;}
        .yinv-modal-title{color:#fff;font-weight:800;font-size:18px;margin:0;}
        .yinv-modal-subtitle{font-size:11px;color:rgba(255,255,255,.8);font-family:'DM Mono',monospace;margin-top:2px;}
        .yinv-modal-body{padding:16px 20px;overflow-y:auto;flex:1;}
        .yinv-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #f1f5f9;background:#f8fafc;flex-shrink:0;border-radius:0 0 14px 14px;}

        .yinv-section-head{display:flex;justify-content:space-between;align-items:center;background:#f0fdfa;border:1px solid #99f6e4;border-left:4px solid #0d9488;border-radius:10px;padding:10px 14px;cursor:pointer;margin-top:18px;user-select:none;}
        .yinv-section-title{font-weight:700;font-size:13px;color:#0f766e;}
        .yinv-grid-3{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:480px){.yinv-grid-3{grid-template-columns:repeat(2,1fr);}}
        @media(min-width:768px){.yinv-grid-3{grid-template-columns:repeat(3,1fr);}}
        .yinv-col-full{grid-column:1/-1;}
        .yinv-hint{margin:3px 0 0;font-size:11px;color:#94a3b8;}
        .yinv-hint--warn{color:#b45309;}
        .yinv-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;font-family:'DM Sans',sans-serif;color:#1e293b;outline:none;background:#fff;}
        .yinv-input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1);}
        .yinv-input--locked{background:#f0fdfa;border-color:#99f6e4;color:#0f766e;font-weight:700;}
        .yinv-input--autofill{border-color:#99f6e4;background:#f0fdfa;color:#0f766e;font-weight:600;}
        .yinv-textarea{resize:vertical;line-height:1.6;white-space:pre-line;}
        .yinv-error-banner{display:flex;align-items:center;gap:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#ef4444;padding:10px 16px;margin-bottom:14px;font-size:13px;}

        .yinv-dd-wrap{position:relative;}
        .yinv-dd-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 12px;height:40px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;font-size:13px;cursor:pointer;outline:none;text-align:left;transition:border-color .15s,box-shadow .15s;}
        .yinv-dd-trigger:hover{border-color:#0d9488;}
        .yinv-dd-trigger.open{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.12);}
        .yinv-dd-trigger.has-value{border-color:#99f6e4;background:#f0fdfa;}
        .yinv-dd-content{flex:1;overflow:hidden;min-width:0;}
        .yinv-dd-placeholder{color:#9ca3af;}
        .yinv-dd-badge{background:#0d9488;color:#fff;border-radius:5px;padding:2px 8px;font-size:12px;font-weight:700;font-family:'DM Mono',monospace;white-space:nowrap;}
        .yinv-dd-clear{display:flex;align-items:center;padding:0 2px;cursor:pointer;color:#94a3b8;}
        .yinv-dd-panel{position:absolute;top:100%;left:0;right:0;z-index:400;background:#fff;border:1px solid #99f6e4;border-top:none;border-radius:0 0 10px 10px;box-shadow:0 8px 24px rgba(13,148,136,.13);animation:ddSlide .15s ease;}
        .yinv-dd-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #ccfbf1;background:#f0fdfa;}
        .yinv-dd-search{flex:1;border:none;outline:none;font-size:12.5px;color:#1e293b;background:transparent;}
        .yinv-dd-count{padding:4px 12px;font-size:11px;color:#94a3b8;font-weight:600;border-bottom:1px solid #f1f5f9;background:#f0fdfa;}
        .yinv-dd-list{max-height:280px;overflow-y:auto;}
        .yinv-dd-option{padding:9px 12px;cursor:pointer;border-bottom:1px solid #f0fdfa;}
        .yinv-dd-option:hover{background:#f0fdfa;}
        .yinv-dd-opt-row1{display:flex;align-items:center;gap:7px;}
        .yinv-po-type-chip{font-size:9px;font-weight:800;border-radius:4px;padding:1px 6px;letter-spacing:.03em;background:#fef3c7;color:#92400e;}
        .yinv-dd-opt-no{font-family:'DM Mono',monospace;font-weight:700;font-size:12.5px;color:#0f766e;}
        .yinv-dd-opt-date{font-size:11px;color:#94a3b8;margin-left:auto;}
        .yinv-dd-opt-row2{display:flex;gap:8px;margin-top:3px;}
        .yinv-dd-opt-supplier{font-size:12px;font-weight:600;color:#374151;}
        .yinv-dd-opt-quality{font-size:11px;color:#64748b;}
        .yinv-dd-opt-row3{margin-top:3px;}
        .yinv-dd-opt-bal{font-size:10.5px;font-weight:700;}
        .yinv-dd-status{font-size:11px;margin-top:4px;color:#0d9488;font-weight:700;display:flex;align-items:center;font-family:'DM Mono',monospace;}

        .yinv-item-table-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
        .yinv-item-count{font-size:12px;color:#64748b;font-weight:600;}
        .yinv-add-row-btn{display:flex;align-items:center;gap:5px;background:#f0fdfa;color:#0d9488;border:1px solid #99f6e4;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;}
        .yinv-add-row-btn:hover{background:#ccfbf1;}
        .yinv-item-table-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;}
        .yinv-item-table{width:100%;border-collapse:collapse;font-size:12px;min-width:600px;}
        .yinv-ith{padding:8px 10px;background:#f0fdfa;color:#0f766e;font-weight:700;text-align:left;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:11px;}
        .yinv-ith--r{text-align:right;}
        .yinv-irow-even td{background:#fff;}
        .yinv-irow-odd td{background:#f0fdfa;}
        .yinv-itd{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
        .yinv-itd--amt{text-align:right;font-family:'DM Mono',monospace;font-weight:700;color:#0f766e;}
        .yinv-itd--c{text-align:center;}
        .yinv-iinput{width:100%;border:1px solid #cbd5e1;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;color:#1e293b;background:#fff;}
        .yinv-iinput:focus{border-color:#0d9488;}
        .yinv-iinput--r{text-align:right;}
        .yinv-del-row-btn{background:#fff1f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .yinv-del-row-btn:hover{background:#fee2e2;}

        .yinv-progress-bar{position:relative;height:8px;border-radius:6px;background:#e2e8f0;overflow:hidden;margin-top:6px;}
        .yinv-progress-fill{height:100%;background:linear-gradient(90deg,#0d9488,#14b8a6);border-radius:6px;transition:width .2s;}

        .yinv-gst-section{background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px;margin-top:10px;}
        .yinv-gst-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px;}
        @media(min-width:576px){.yinv-gst-grid{grid-template-columns:repeat(3,1fr);}}
        .yinv-gst-row{display:flex;align-items:center;gap:8px;}
        .yinv-gst-label{width:38px;font-size:13px;font-weight:700;color:#0f766e;flex-shrink:0;}
        .yinv-gst-input{width:68px;border:1px solid #99f6e4;border-radius:6px;padding:5px 8px;font-size:13px;text-align:right;outline:none;background:#fff;flex-shrink:0;}
        .yinv-gst-input:focus{border-color:#0d9488;}
        .yinv-gst-pct{font-size:12px;color:#94a3b8;flex-shrink:0;}
        .yinv-sub-row{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #99f6e4;padding-top:8px;margin-top:4px;}
        .yinv-net-row{display:flex;align-items:center;justify-content:space-between;border-top:2px solid #0d9488;padding-top:10px;margin-top:8px;}
        .yinv-net-label{font-size:15px;font-weight:700;color:#1e293b;}
        .yinv-net-val{font-size:20px;font-weight:800;color:#0d9488;}

        .yinv-cancel-btn{padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#475569;}
        .yinv-cancel-btn:hover{background:#f1f5f9;}
        .yinv-save-btn{display:flex;align-items:center;gap:6px;padding:9px 24px;border:none;background:#16a34a;color:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(22,163,74,.3);}
        .yinv-save-btn:disabled{opacity:.7;cursor:not-allowed;}
        .yinv-save-btn:hover:not(:disabled){background:#15803d;}

        .yinv-confirm-overlay{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;}
        .yinv-confirm-box{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.22);padding:28px 24px;max-width:400px;width:100%;text-align:center;}
        .yinv-confirm-actions{display:flex;gap:10px;justify-content:center;}
        .yinv-confirm-cancel{padding:9px 22px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#475569;font-weight:600;font-size:13px;cursor:pointer;}
        .yinv-confirm-del{padding:9px 22px;border:none;border-radius:8px;background:#dc2626;color:#fff;font-weight:700;font-size:13px;cursor:pointer;}
        .yinv-confirm-del:disabled{background:#fca5a5;cursor:not-allowed;}

        input:focus,select:focus,textarea:focus{outline:none;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#f1f5f9;}
        ::-webkit-scrollbar-thumb{background:#99f6e4;border-radius:3px;}
      `}</style>

      <div className="yinv-wrap">
        {/* ── Page Header ── */}
        <div className="yinv-page-header">
          <div>
            <h1>Yarn Purchase Invoice</h1>
            <p>{total} invoice{total !== 1 ? "s" : ""} — supplier bills against Yarn Purchase Orders</p>
          </div>
          <button className="yinv-new-btn" onClick={handleNew}><Plus size={15} /> Add Invoice Bill</button>
        </div>

        {/* ── Toolbar ── */}
        <div className="yinv-toolbar">
          <div className="yinv-search-wrap">
            <Search size={14} color="#94a3b8" />
            <input className="yinv-search" placeholder="Search invoice no, PO no, supplier…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="yinv-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="yinv-card">
          <div className="yinv-table-wrap">
            <table className="yinv-table">
              <thead>
                <tr>
                  <th>#</th><th>Invoice No</th><th>Date</th><th>PO No</th><th>Supplier</th>
                  {width >= 768 && <th className="th-r">Delivered Qty</th>}
                  <th className="th-r">Net Value</th>
                  {width >= 900 && <th className="th-r">Balance Due</th>}
                  <th>Status</th><th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="yinv-empty"><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={10} className="yinv-empty">{search ? "No invoices match your search." : 'No yarn purchase invoices yet. Click "Add Invoice Bill" to create one.'}</td></tr>
                ) : invoices.map((inv, i) => (
                  <tr key={inv.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="yinv-inv-no">{inv.invoice_no}</span></td>
                    <td style={{ color: "#64748b" }}>{fmtDate(inv.invoice_date)}</td>
                    <td><span className="yinv-po-no">{inv.po_no || "—"}</span></td>
                    <td style={{ fontWeight: 600 }}>{inv.supplier}</td>
                    {width >= 768 && <td className="yinv-td-num">{fmtQty(inv.delivered_qty)} KG</td>}
                    <td className="yinv-td-num" style={{ fontWeight: 700, color: "#0d9488" }}>₹{fmt(inv.net_value)}</td>
                    {width >= 900 && <td className="yinv-td-num" style={{ color: (inv.balance_due || 0) > 0 ? "#dc2626" : "#166534" }}>₹{fmt(inv.balance_due)}</td>}
                    <td><span className={`yinv-status-chip yinv-status-${inv.status || "Pending"}`}>{inv.status || "Pending"}</span></td>
                    <td style={{ textAlign: "center" }}>
                      <RowActionsMenu onEdit={() => handleOpenEdit(inv)} onPrint={() => handlePrint(inv)} onDelete={() => setDeleteTarget(inv)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="yinv-pg-bar">
              <span>Page {page} of {totalPages} — {total} record(s)</span>
              <div className="yinv-pg-btns">
                <button className="yinv-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="yinv-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                <button className="yinv-pg-btn active">{page}</button>
                <button className="yinv-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="yinv-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ════ CREATE / EDIT MODAL ════ */}
        {showModal && (
          <div className="yinv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="yinv-modal">
              <div className="yinv-modal-header">
                <div>
                  <h2 className="yinv-modal-title">{editId ? "✏️ Edit Yarn Purchase Invoice" : "➕ Add Invoice Bill"}</h2>
                  <p className="yinv-modal-subtitle">{form.invoice_no || "Generating Invoice No…"}</p>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} onClick={handleClose}><X size={22} color="#fff" /></button>
              </div>

              <div className="yinv-modal-body">
                {saveError && (
                  <div className="yinv-error-banner">
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>{saveError}</span>
                    <button onClick={() => setSaveError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14} /></button>
                  </div>
                )}

                {/* ── Yarn Purchase Invoice Details ── */}
                <SectionHead title="Purchase Invoice Details" open={sec.details} onToggle={() => setSec(p => ({ ...p, details: !p.details }))} />
                {sec.details && (
                  <div className="yinv-grid-3" style={{ paddingTop: 12, paddingBottom: 4 }}>

                    <Field label="Invoice No" type="locked">
                      <div className={`yinv-input yinv-input--locked`} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 38 }}>
                        {invGenerating ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : (form.invoice_no || "Auto-generated")}
                      </div>
                      <p className="yinv-hint">Auto-generated (YINV-YYYY-NNN)</p>
                    </Field>

                    <Field label="Invoice Date" type="date">
                      <input className="yinv-input" type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} />
                    </Field>

                    <Field label="Due Date" type="date">
                      <input className="yinv-input" type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                    </Field>

                    <div className="yinv-col-full">
                      <Field label="PO No" type="lookup" required hint="Selecting a YPO auto-fills Supplier, Count/Lot, Rate, HSN, GST & Balance below">
                        <PoLineDropdown value={form.ypo_item_id ? String(form.ypo_item_id) : ""} label={form.po_no} onSelect={selectPoLine} />
                      </Field>
                    </div>

                    <Field label="Supplier" type={form.ypo_item_id ? "autofill" : "text"} required>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="text" placeholder="e.g. SYNKORE TECH" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
                    </Field>

                    <Field label="Count / Lot" type={form.ypo_item_id ? "autofill" : "text"}>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="text" value={form.quality} onChange={e => setForm({ ...form, quality: e.target.value })} />
                    </Field>

                    <Field label="HSN Code" type={form.ypo_item_id ? "autofill" : "text"}>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="text" value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
                    </Field>

                    <Field label="Unit" type="locked">
                      <div className="yinv-input yinv-input--locked" style={{ minHeight: 38, display: "flex", alignItems: "center" }}>KG</div>
                      <p className="yinv-hint">Yarn is always invoiced by weight (kg)</p>
                    </Field>

                    <Field label="Rate (₹ / kg)" type={form.ypo_item_id ? "autofill" : "number"}>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="number" min={0} step="0.01" value={form.rate || ""} onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} />
                    </Field>

                    <div className="yinv-col-full">
                      <Field label="Total Order Qty vs Balance" type="computed">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "#374151" }}>
                          <span>Ordered: <strong style={{ color: "#0f766e" }}>{fmtQty(form.total_order_qty)} KG</strong></span>
                          <span>Already Invoiced: <strong style={{ color: "#b45309" }}>{fmtQty(form.already_invoiced_qty || 0)} KG</strong></span>
                          <span>Balance After This: <strong style={{ color: totals.balance_qty < 0 ? "#dc2626" : "#166534" }}>{fmtQty(totals.balance_qty)} KG</strong></span>
                        </div>
                        <div className="yinv-progress-bar">
                          <div className="yinv-progress-fill" style={{ width: `${Math.min(100, form.total_order_qty ? (((form.already_invoiced_qty || 0) + totals.delivered_qty) / form.total_order_qty) * 100 : 0)}%` }} />
                        </div>
                        {totals.balance_qty < 0 && <p className="yinv-hint yinv-hint--warn">⚠ This invoice's delivered qty exceeds the remaining PO balance — double-check before saving.</p>}
                      </Field>
                    </div>

                    <div className="yinv-col-full">
                      <Field label="Supplier Address" type={form.ypo_item_id ? "autofill" : "text"} hint="Auto-filled from the linked PO's supplier — editable">
                        <textarea className={`yinv-input yinv-textarea${form.ypo_item_id ? " yinv-input--autofill" : ""}`} rows={3} value={form.supplier_address} onChange={e => setForm({ ...form, supplier_address: e.target.value })} />
                      </Field>
                    </div>

                    <Field label="Supplier GSTIN" type={form.ypo_item_id ? "autofill" : "text"}>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="text" value={form.supplier_gstin} onChange={e => setForm({ ...form, supplier_gstin: e.target.value })} />
                    </Field>

                    <Field label="Advance (₹)" type={form.ypo_item_id ? "autofill" : "number"}>
                      <input className={`yinv-input${form.ypo_item_id ? " yinv-input--autofill" : ""}`} type="number" min={0} step="0.01" value={form.advance || ""} onChange={e => setForm({ ...form, advance: parseFloat(e.target.value) || 0 })} />
                    </Field>

                    <Field label="Status" type="select">
                      <select className="yinv-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                        {["Draft", "Pending", "Paid", "Cancelled"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Field>

                    <div className="yinv-col-full">
                      <Field label="Remarks" type="text">
                        <input className="yinv-input" type="text" placeholder="e.g. YARN PURCHASE" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                )}

                {/* ── Delivery Items ── */}
                <SectionHead title="Delivery Items" open={sec.items} onToggle={() => setSec(p => ({ ...p, items: !p.items }))} />
                {sec.items && (
                  <div style={{ paddingTop: 10, paddingBottom: 8 }}>
                    <div className="yinv-item-table-header">
                      <span className="yinv-item-count">{form.items.length} item{form.items.length !== 1 ? "s" : ""}</span>
                      <button type="button" className="yinv-add-row-btn" onClick={addItem}><PlusCircle size={13} /> Add Row</button>
                    </div>
                    <div className="yinv-item-table-wrap">
                      <table className="yinv-item-table">
                        <thead>
                          <tr>
                            <th className="yinv-ith yinv-ith--r" style={{ width: 100 }}>Weight (Kg) <FTypeBadge type="number" /></th>
                            <th className="yinv-ith yinv-ith--r" style={{ width: 70 }}>Bags</th>
                            <th className="yinv-ith" style={{ minWidth: 130 }}>Bag No</th>
                            <th className="yinv-ith" style={{ minWidth: 120 }}>Lot No</th>
                            <th className="yinv-ith yinv-ith--r" style={{ width: 90 }}>Rate</th>
                            <th className="yinv-ith yinv-ith--r" style={{ width: 110 }}>Amount <FTypeBadge type="computed" /></th>
                            <th className="yinv-ith" style={{ width: 34 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item, idx) => {
                            const rowRate = item.rate !== undefined && item.rate !== null && (item.rate as any) !== "" ? Number(item.rate) : Number(form.rate) || 0;
                            const amount = (Number(item.delivered_qty) || 0) * rowRate;
                            return (
                              <tr key={idx} className={idx % 2 === 0 ? "yinv-irow-even" : "yinv-irow-odd"}>
                                <td className="yinv-itd"><input className="yinv-iinput yinv-iinput--r" type="number" min={0} step="0.001" value={item.delivered_qty || ""} onChange={e => updateItem(idx, { delivered_qty: parseFloat(e.target.value) || 0 })} /></td>
                                <td className="yinv-itd"><input className="yinv-iinput yinv-iinput--r" type="number" min={0} step="1" value={item.no_of_bags ?? ""} onChange={e => updateItem(idx, { no_of_bags: e.target.value === "" ? null : parseInt(e.target.value, 10) })} /></td>
                                <td className="yinv-itd"><input className="yinv-iinput" type="text" value={item.bag_no} onChange={e => updateItem(idx, { bag_no: e.target.value })} /></td>
                                <td className="yinv-itd"><input className="yinv-iinput" type="text" value={item.lot_no} onChange={e => updateItem(idx, { lot_no: e.target.value })} /></td>
                                <td className="yinv-itd"><input className="yinv-iinput yinv-iinput--r" type="number" min={0} step="0.01" placeholder={String(form.rate || 0)} value={item.rate ?? ""} onChange={e => updateItem(idx, { rate: e.target.value === "" ? undefined : parseFloat(e.target.value) })} /></td>
                                <td className="yinv-itd yinv-itd--amt">₹{fmt(amount)}</td>
                                <td className="yinv-itd yinv-itd--c">
                                  {form.items.length > 1 && <button className="yinv-del-row-btn" onClick={() => removeItem(idx)} title="Remove row"><Trash2 size={13} /></button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, alignItems: "center", padding: "10px 4px", borderTop: "2px solid #e2e8f0", marginTop: 4, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Total KG</span>
                        <strong style={{ fontSize: 16, fontWeight: 800, color: "#0d9488" }}>{fmtQty(totals.delivered_qty)}</strong>
                      </div>
                      <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Sub Total</span>
                        <strong style={{ fontSize: 15, fontWeight: 800, color: "#374151" }}>₹ {fmt(totals.sub_total)}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── GST & Totals ── */}
                <SectionHead title="GST & Totals" open={sec.gst} onToggle={() => setSec(p => ({ ...p, gst: !p.gst }))} />
                {sec.gst && (
                  <div className="yinv-gst-section">
                    <div className="yinv-grid-3" style={{ marginBottom: 12 }}>
                      <Field label="GST Type" type="select">
                        <select className="yinv-input" value={form.gst_type} onChange={e => setForm({ ...form, gst_type: e.target.value as YarnGstType })}>
                          <option value="CGST_SGST">CGST + SGST</option>
                          <option value="IGST">IGST</option>
                          <option value="NONE">None</option>
                        </select>
                      </Field>
                    </div>
                    <div className="yinv-gst-grid">
                      {form.gst_type !== "IGST" && (
                        <>
                          <div className="yinv-gst-row"><span className="yinv-gst-label">CGST</span><input className="yinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.cgst_pct || ""} onChange={e => setForm({ ...form, cgst_pct: parseFloat(e.target.value) || 0 })} /><span className="yinv-gst-pct">%</span></div>
                          <div className="yinv-gst-row"><span className="yinv-gst-label">SGST</span><input className="yinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.sgst_pct || ""} onChange={e => setForm({ ...form, sgst_pct: parseFloat(e.target.value) || 0 })} /><span className="yinv-gst-pct">%</span></div>
                        </>
                      )}
                      {form.gst_type === "IGST" && (
                        <div className="yinv-gst-row"><span className="yinv-gst-label">IGST</span><input className="yinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.igst_pct || ""} onChange={e => setForm({ ...form, igst_pct: parseFloat(e.target.value) || 0 })} /><span className="yinv-gst-pct">%</span></div>
                      )}
                    </div>
                    <div className="yinv-sub-row"><span>GST Amount</span><span style={{ fontWeight: 700 }}>₹{fmt(totals.gst_amount)}</span></div>
                    <div className="yinv-sub-row"><span>Advance</span><span style={{ fontWeight: 700 }}>₹{fmt(form.advance)}</span></div>
                    <div className="yinv-net-row">
                      <span className="yinv-net-label">Net Value / Balance Due</span>
                      <span className="yinv-net-val">₹{fmt(totals.net_value)} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>(Due ₹{fmt(totals.balance_due)})</span></span>
                    </div>
                  </div>
                )}
              </div>

              <div className="yinv-modal-footer">
                <button className="yinv-cancel-btn" onClick={handleClose}>Cancel</button>
                <button className="yinv-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "💾 Save Invoice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ DELETE CONFIRM ════ */}
        {deleteTarget && (
          <div className="yinv-confirm-overlay">
            <div className="yinv-confirm-box">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
              <p style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>Delete Yarn Purchase Invoice?</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>
                This will permanently delete <strong>{deleteTarget.invoice_no}</strong> and free up its delivered qty from the PO balance. This action cannot be undone.
              </p>
              <div className="yinv-confirm-actions">
                <button className="yinv-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="yinv-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
                  {deleteConfirming ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}