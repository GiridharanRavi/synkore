// @ts-nocheck
// frontend/src/pages/admin/PurchaseInvoice.tsx
//
// PURCHASE INVOICE — supplier's bill entry against a Fabric Purchase Order
// (FPO) or Yarn Purchase Order (YPO) we raised earlier.
//
// AUTOFILL CHAIN (mirrors the FPO "Order Plan No" pattern in this app):
//   Selecting a "PO No" in the PoLineDropdown auto-fills:
//     • Order No / Order Date / Due Date   ← from the selected PO
//     • Supplier, Supplier Address, GSTIN  ← from the selected PO's supplier
//     • Quality (construction/count), HSN Code, Unit, Rate
//     • Total Order Qty (and shows how much of it is already invoiced)
//     • GST Type + CGST/SGST/IGST %
//     • Advance
//   All autofilled fields remain editable afterwards, exactly like the
//   FPO/YPO modules elsewhere in this app.
//
// Then the user adds one row per physical delivery (roll/piece) under
// "Delivery Items" — Delivered Qty, Piece No, Roll No, Lot No — the same
// shape as the Fabric Purchase Inward screen already in this app. Totals,
// GST, Net Value and remaining Balance are computed live.
//
// Visual language intentionally follows the teal "FPI Details" screen
// already shipped in this app (pill badges: LOCKED / DATE / LOOKUP /
// SELECT / TEXT next to each label; teal accents; rounded field groups)
// rather than the purple FPO theme, so this reads as part of the same
// "inward/invoice" family.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, ChevronDown, ChevronUp, Loader2, AlertCircle,
  CheckCircle2, Info, AlertTriangle, Trash2, PlusCircle, Check,
  Printer, MoreVertical,
} from "lucide-react";

import {
  getPurchaseInvoices,
  getPurchaseInvoiceById,
  createPurchaseInvoice,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  getNextInvoiceNo,
  searchPoLines,
  PurchaseInvoicePayload,
  PurchaseInvoiceItem,
  PoLineOption,
  GstType,
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
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = (raw?: string | null): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s || s === "null") return "";
  const d = s.includes("T") ? new Date(s) : new Date(`${s.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const emptyItem = (): PurchaseInvoiceItem => ({ delivered_qty: 0, piece_no: "", roll_no: "", lot_no: "", rate: 0, amount: 0 });

const defaultForm = (): PurchaseInvoicePayload => ({
  invoice_no: "", invoice_date: today(), due_date: "",
  po_type: "fabric", fpo_id: null, ypo_id: null, po_item_id: null, po_no: "", po_date: "",
  supplier: "", supplier_address: "", supplier_gstin: "",
  quality: "", hsn_code: "", unit: "MTR", rate: 0,
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
      {hint && <p className="pinv-hint">{hint}</p>}
    </div>
  );
}
function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="pinv-section-head" onClick={onToggle}>
      <span className="pinv-section-title">{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── PO Line Dropdown — combined Fabric-PO + Yarn-PO search ──────────────

interface PoLineDropdownProps { value: string; label: string; onSelect: (line: PoLineOption | null) => void; }
function PoLineDropdown({ value, label, onSelect }: PoLineDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoLineOption[]>([]);
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
        setResults(await searchPoLines(query, "all"));
      } catch (err: any) {
        // ↓ CHANGED: log it instead of hiding it
        console.error('[PoLineDropdown] searchPoLines failed:', err.message || err);
        setResults([]);
      }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  return (
    <div className="pinv-dd-wrap" ref={wrapRef}>
      <button type="button" className={`pinv-dd-trigger${open ? " open" : ""}${value ? " has-value" : ""}`} onClick={() => setOpen(o => !o)}>
        <span className="pinv-dd-content">
          {value ? <span className="pinv-dd-badge">{label}</span> : <span className="pinv-dd-placeholder">Search FPO No or supplier…</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {value && <span className="pinv-dd-clear" onClick={e => { e.stopPropagation(); onSelect(null); }} title="Clear"><X size={13} /></span>}
          <ChevronDown size={14} style={{ color: "#64748b", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>

      {open && (
        <div className="pinv-dd-panel">
          <div className="pinv-dd-search-wrap">
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input ref={inputRef} className="pinv-dd-search" placeholder="Search PO No, supplier, construction/count…" value={query} onChange={e => setQuery(e.target.value)} />
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "#0d9488" }} />}
          </div>
          <div className="pinv-dd-count">
            {loading ? <span>Searching…</span> : results.length === 0
              ? <span style={{ color: "#c2410c" }}>{query ? `No PO lines match "${query}"` : "Start typing an FPO/YPO No or supplier"}</span>
              : <span>{results.length} PO line{results.length !== 1 ? "s" : ""}</span>}
          </div>
          <div className="pinv-dd-list">
            {results.map(line => (
              <div key={line.key} className="pinv-dd-option" onClick={() => { onSelect(line); setOpen(false); setQuery(""); }}>
                <div className="pinv-dd-opt-row1">
                  <span className={`pinv-po-type-chip pinv-po-type-chip--${line.po_type}`}>{line.po_type === "fabric" ? "FPO" : "YPO"}</span>
                  <span className="pinv-dd-opt-no">{line.po_no}</span>
                  <span className="pinv-dd-opt-date">{fmtDate(line.po_date)}</span>
                </div>
                <div className="pinv-dd-opt-row2">
                  <span className="pinv-dd-opt-supplier">{line.supplier}</span>
                  {line.quality && <span className="pinv-dd-opt-quality" title={line.quality}>{line.quality.length > 26 ? line.quality.slice(0, 24) + "…" : line.quality}</span>}
                </div>
                <div className="pinv-dd-opt-row3">
                  <span className="pinv-dd-opt-bal" style={{ color: line.balance_qty <= 0 ? "#dc2626" : "#0f766e" }}>
                    Balance: {fmt(line.balance_qty)} {line.unit} {line.balance_qty <= 0 ? "(fully invoiced)" : `of ${fmt(line.total_qty)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {value && <p className="pinv-dd-status"><Check size={11} style={{ marginRight: 3 }} />{label} linked</p>}
    </div>
  );
}

// ─── Row Actions Menu (kebab, portal-based — same fix as FPO module) ─────

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
    <button type="button" className={`pinv-row-menu-item${danger ? " pinv-row-menu-item--danger" : ""}`} onClick={() => { setOpen(false); onClick(); }}>
      {icon}<span>{label}</span>
    </button>
  );

  const panel = open ? (
    <div ref={panelRef} className="pinv-row-menu-panel" style={{ position: "fixed", top: pos.top, left: pos.left, width: 190, zIndex: 9999 }}>
      <Item icon={<span style={{ fontSize: 14 }}>✏️</span>} label="Edit" onClick={onEdit} />
      <Item icon={<Printer size={14} color="#0284c7" />} label="Print" onClick={onPrint} />
      <div className="pinv-row-menu-divider" />
      <Item icon={<Trash2 size={14} color="#dc2626" />} label="Delete" onClick={onDelete} danger />
    </div>
  ) : null;

  return (
    <>
      <button ref={triggerRef} type="button" className="pinv-row-menu-btn" onClick={toggle} title="Actions"><MoreVertical size={16} /></button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function PurchaseInvoice() {
  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width = useWidth();

  const [invoices, setInvoices] = useState<PurchaseInvoicePayload[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<PurchaseInvoicePayload>(defaultForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [invGenerating, setInvGenerating] = useState(false);
  const [sec, setSec] = useState({ details: true, items: true, gst: true });

  const [deleteTarget, setDeleteTarget] = useState<PurchaseInvoicePayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Fetch list ──
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPurchaseInvoices({ search, page, limit: pageSize });
      setInvoices(res.data);
      setTotal(res.total);
    } catch (e: any) {
      pushToast("error", "Load Failed", e.message || "Could not fetch purchase invoices.");
    } finally { setLoading(false); }
  }, [search, page, pageSize, pushToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { setPage(1); }, [search, pageSize]);
  useEffect(() => { document.body.style.overflow = showModal ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [showModal]);

  // ── Totals (live, recomputed from items + header rate/gst) ──
  const totals = useMemo(() => {
    const items = form.items || [];
    const delivered_qty = +items.reduce((s, i) => s + (Number(i.delivered_qty) || 0), 0).toFixed(2);
    const sub_total = +items.reduce((s, i) => {
      const rate = i.rate !== undefined && i.rate !== null && i.rate !== ('' as any) ? Number(i.rate) : Number(form.rate) || 0;
      return s + (Number(i.delivered_qty) || 0) * rate;
    }, 0).toFixed(2);
    const gstPct = (Number(form.cgst_pct) || 0) + (Number(form.sgst_pct) || 0) + (Number(form.igst_pct) || 0);
    const gst_amount = +(sub_total * gstPct / 100).toFixed(2);
    const net_value = +(sub_total + gst_amount).toFixed(2);
    const balance_due = +(net_value - (Number(form.advance) || 0)).toFixed(2);
    const balance_qty = +((Number(form.total_order_qty) || 0) - (Number(form.already_invoiced_qty) || 0) - delivered_qty).toFixed(2);
    return { delivered_qty, sub_total, gst_amount, net_value, balance_due, balance_qty };
  }, [form]);

  // ── PO line selection → autofill chain ──
  const selectPoLine = (line: PoLineOption | null) => {
    if (!line) {
      setForm(f => ({
        ...f, po_type: "fabric", fpo_id: null, ypo_id: null, po_item_id: null, po_no: "", po_date: "",
        supplier: "", supplier_address: "", supplier_gstin: "", quality: "", hsn_code: "", unit: "MTR", rate: 0,
        total_order_qty: 0, already_invoiced_qty: 0,
        gst_type: "CGST_SGST", cgst_pct: 0, sgst_pct: 0, igst_pct: 0, advance: 0,
      }));
      return;
    }
    setForm(f => ({
      ...f,
      po_type: line.po_type,
      fpo_id: line.po_type === "fabric" ? line.po_id : null,
      ypo_id: line.po_type === "yarn" ? line.po_id : null,
      po_item_id: line.item_id,
      po_no: line.po_no,
      po_date: line.po_date,
      due_date: f.due_date || line.due_date || "",
      supplier: line.supplier,
      supplier_address: line.supplier_address,
      supplier_gstin: line.supplier_gstin,
      quality: line.quality,
      hsn_code: line.hsn_code,
      unit: line.unit,
      rate: line.rate,
      total_order_qty: line.total_qty,
      already_invoiced_qty: line.already_invoiced_qty,
      gst_type: line.gst_type,
      cgst_pct: line.cgst_pct,
      sgst_pct: line.sgst_pct,
      igst_pct: line.igst_pct,
      advance: line.advance,
    }));
    pushToast("info", `${line.po_type === "fabric" ? "FPO" : "YPO"} ${line.po_no} linked`,
      `Autofilled → Supplier: ${line.supplier} | Quality: ${line.quality || "—"} | Balance: ${fmt(line.balance_qty)} ${line.unit}`);
  };

  // ── Item row handlers ──
  const updateItem = (idx: number, patch: Partial<PurchaseInvoiceItem>) =>
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
      const res = await getNextInvoiceNo();
      setForm(f => ({ ...f, invoice_no: res.invoice_no }));
    } catch {
      setForm(f => ({ ...f, invoice_no: `PINV-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}` }));
      pushToast("warning", "Invoice No Fallback", "Server unavailable — used a local placeholder. Verify before saving.");
    } finally { setInvGenerating(false); }
  };

  const handleOpenEdit = async (inv: PurchaseInvoicePayload) => {
    setEditId(inv.id!); setSaveError(""); setSec({ details: true, items: true, gst: true }); setShowModal(true);
    try {
      const full = await getPurchaseInvoiceById(inv.id!);
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
    if (!form.fpo_id && !form.ypo_id) { setSaveError("Please select a PO No (FPO/YPO) to invoice against."); return; }
    if (!form.items.some(i => Number(i.delivered_qty) > 0)) { setSaveError("Add at least one delivery row with a quantity greater than zero."); return; }
    setSaving(true);
    try {
      const payload = { ...form, ...totals };
      if (editId) {
        await updatePurchaseInvoice(editId, payload);
        pushToast("success", "Invoice Updated", `"${form.invoice_no}" updated successfully.`);
      } else {
        await createPurchaseInvoice(payload);
        pushToast("success", "Invoice Created", `"${form.invoice_no}" created successfully.`);
      }
      handleClose();
      fetchInvoices();
    } catch (e: any) {
      const msg = e.message || "Failed to save purchase invoice.";
      setSaveError(msg); pushToast("error", "Save Failed", msg);
    } finally { setSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    try {
      await deletePurchaseInvoice(deleteTarget.id!);
      pushToast("warning", "Invoice Deleted", `"${deleteTarget.invoice_no}" has been deleted.`);
      setDeleteTarget(null); fetchInvoices();
    } catch (e: any) {
      pushToast("error", "Delete Failed", e.message || "Could not delete purchase invoice.");
    } finally { setDeleteConfirming(false); }
  };

  // ── Simple print (tabular, no letterhead — see FPO's handlePrintFpo for a
  //    company-letterhead pattern you can port here later if needed) ──
  const handlePrint = async (invInput: PurchaseInvoicePayload) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { pushToast("error", "Popup Blocked", "Please allow popups to print this invoice."); return; }
    let inv = invInput;
    if (invInput.id) {
      try { inv = await getPurchaseInvoiceById(invInput.id); } catch { /* fall back to row data */ }
    }
    const items = inv.items ?? [];
    const rows = items.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="r">${fmt(it.delivered_qty)}</td>
        <td>${it.piece_no || "—"}</td>
        <td>${it.roll_no || "—"}</td>
        <td>${it.lot_no || "—"}</td>
        <td class="r">₹${fmt(it.rate ?? inv.rate)}</td>
        <td class="r">₹${fmt(it.amount ?? (Number(it.delivered_qty) * Number(it.rate ?? inv.rate)))}</td>
      </tr>`).join("");

    win.document.write(`<!DOCTYPE html><html><head><title>Purchase Invoice — ${inv.invoice_no}</title>
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
      <h2>Purchase Invoice</h2>
      <p class="sub">${inv.invoice_no} — printed ${new Date().toLocaleString()}</p>
      <table class="meta">
        <tr>
          <td style="width:50%;"><span class="lbl">PO No (${inv.po_type === "fabric" ? "Fabric" : "Yarn"})</span><br/>${inv.po_no || "—"} &nbsp;•&nbsp; ${fmtDate(inv.po_date)}</td>
          <td style="width:50%;"><span class="lbl">Invoice Date / Due Date</span><br/>${fmtDate(inv.invoice_date)} &nbsp;→&nbsp; ${fmtDate(inv.due_date) || "—"}</td>
        </tr>
        <tr>
          <td><span class="lbl">Supplier</span><br/><strong>${inv.supplier}</strong>${inv.supplier_address ? `<br/>${String(inv.supplier_address).replace(/\n/g, "<br/>")}` : ""}${inv.supplier_gstin ? `<br/>GSTIN: ${inv.supplier_gstin}` : ""}</td>
          <td><span class="lbl">Quality / HSN / Unit / Rate</span><br/>${inv.quality || "—"} &nbsp;•&nbsp; HSN ${inv.hsn_code || "—"} &nbsp;•&nbsp; ${inv.unit} &nbsp;•&nbsp; ₹${fmt(inv.rate)}</td>
        </tr>
      </table>
      <table class="items">
        <thead><tr><th class="c">#</th><th class="r">Meter/Qty</th><th>Piece No</th><th>Roll No</th><th>Lot No</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
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

        .pinv-wrap{font-family:'DM Sans',sans-serif;font-size:14px;color:#1e293b;}
        .pinv-page-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;}
        .pinv-page-header h1{margin:0;font-size:20px;font-weight:800;color:#0f766e;}
        .pinv-page-header p{margin:3px 0 0;font-size:13px;color:#64748b;}
        .pinv-new-btn{display:flex;align-items:center;gap:6px;background:#0d9488;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(13,148,136,.35);}
        .pinv-new-btn:hover{background:#0f766e;}

        .pinv-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;}
        .pinv-search-wrap{position:relative;flex:1;min-width:180px;max-width:320px;}
        .pinv-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);}
        .pinv-search{width:100%;padding:8px 12px 8px 34px;border:1px solid #99f6e4;border-radius:8px;font-size:13px;outline:none;background:#fff;}
        .pinv-search:focus{border-color:#0d9488;}
        .pinv-page-size{display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;margin-left:auto;}
        .pinv-page-size select{border:1px solid #99f6e4;border-radius:6px;padding:5px 8px;font-size:13px;background:#fff;cursor:pointer;outline:none;}

        .pinv-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.07);margin-bottom:24px;}
        .pinv-table-wrap{overflow-x:auto;}
        .pinv-table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px;}
        .pinv-table thead tr{background:#0f766e;}
        .pinv-table th{padding:11px 12px;color:#fff;font-weight:700;text-align:left;font-size:12px;white-space:nowrap;}
        .pinv-table th.th-r{text-align:right;}
        .pinv-table tbody tr:nth-child(odd) td{background:#fff;}
        .pinv-table tbody tr:nth-child(even) td{background:#f0fdfa;}
        .pinv-table tbody tr:hover td{background:#ccfbf1;}
        .pinv-table td{padding:10px 12px;color:#374151;font-size:12px;white-space:nowrap;}
        .pinv-td-num{text-align:right;font-family:'DM Mono',monospace;}
        .pinv-empty{text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;}
        .pinv-inv-no{font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:2px 7px;}
        .pinv-po-no{font-weight:600;color:#0369a1;}
        .pinv-status-chip{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;}
        .pinv-status-Pending{background:#fef3c7;color:#b45309;}
        .pinv-status-Paid{background:#dcfce7;color:#166534;}
        .pinv-status-Draft{background:#f3f4f6;color:#374151;}
        .pinv-status-Cancelled{background:#fee2e2;color:#991b1b;}

        .pinv-row-menu-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid #e2e8f0;background:#fff;border-radius:7px;cursor:pointer;color:#64748b;}
        .pinv-row-menu-btn:hover{background:#f0fdfa;border-color:#99f6e4;color:#0d9488;}
        .pinv-row-menu-panel{background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.16);overflow:hidden;animation:ddSlide .12s ease;padding:4px;}
        .pinv-row-menu-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 11px;border:none;background:transparent;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:#374151;text-align:left;}
        .pinv-row-menu-item:hover{background:#f8fafc;}
        .pinv-row-menu-item--danger{color:#dc2626;}
        .pinv-row-menu-item--danger:hover{background:#fef2f2;}
        .pinv-row-menu-divider{height:1px;background:#f1f5f9;margin:3px 4px;}

        .pinv-pg-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px solid #f1f5f9;background:#f0fdfa;font-size:12px;color:#64748b;flex-wrap:wrap;gap:8px;}
        .pinv-pg-btns{display:flex;gap:4px;align-items:center;}
        .pinv-pg-btn{padding:4px 10px;border:1px solid #99f6e4;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;min-width:30px;height:30px;display:flex;align-items:center;justify-content:center;}
        .pinv-pg-btn:hover:not(:disabled){background:#f0fdfa;}
        .pinv-pg-btn.active{background:#0d9488;color:#fff;border-color:#0d9488;font-weight:700;}
        .pinv-pg-btn:disabled{border-color:#e2e8f0;background:#f1f5f9;color:#94a3b8;cursor:not-allowed;}

        .pinv-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;z-index:2000;overflow-y:auto;padding:16px 8px;}
        .pinv-modal{background:#fff;border-radius:14px;width:100%;max-width:920px;box-shadow:0 8px 40px rgba(0,0,0,.22);display:flex;flex-direction:column;max-height:calc(100vh - 32px);}
        .pinv-modal-header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#0d9488,#0f766e);flex-shrink:0;}
        .pinv-modal-title{color:#fff;font-weight:800;font-size:18px;margin:0;}
        .pinv-modal-subtitle{font-size:11px;color:rgba(255,255,255,.8);font-family:'DM Mono',monospace;margin-top:2px;}
        .pinv-modal-body{padding:16px 20px;overflow-y:auto;flex:1;}
        .pinv-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #f1f5f9;background:#f8fafc;flex-shrink:0;border-radius:0 0 14px 14px;}

        .pinv-section-head{display:flex;justify-content:space-between;align-items:center;background:#f0fdfa;border:1px solid #99f6e4;border-left:4px solid #0d9488;border-radius:10px;padding:10px 14px;cursor:pointer;margin-top:18px;user-select:none;}
        .pinv-section-title{font-weight:700;font-size:13px;color:#0f766e;}
        .pinv-grid-3{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:480px){.pinv-grid-3{grid-template-columns:repeat(2,1fr);}}
        @media(min-width:768px){.pinv-grid-3{grid-template-columns:repeat(3,1fr);}}
        .pinv-col-full{grid-column:1/-1;}
        .pinv-hint{margin:3px 0 0;font-size:11px;color:#94a3b8;}
        .pinv-hint--warn{color:#b45309;}
        .pinv-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;font-family:'DM Sans',sans-serif;color:#1e293b;outline:none;background:#fff;}
        .pinv-input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1);}
        .pinv-input--locked{background:#f0fdfa;border-color:#99f6e4;color:#0f766e;font-weight:700;}
        .pinv-input--autofill{border-color:#99f6e4;background:#f0fdfa;color:#0f766e;font-weight:600;}
        .pinv-textarea{resize:vertical;line-height:1.6;white-space:pre-line;}
        .pinv-error-banner{display:flex;align-items:center;gap:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#ef4444;padding:10px 16px;margin-bottom:14px;font-size:13px;}

        .pinv-dd-wrap{position:relative;}
        .pinv-dd-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 12px;height:40px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;font-size:13px;cursor:pointer;outline:none;text-align:left;transition:border-color .15s,box-shadow .15s;}
        .pinv-dd-trigger:hover{border-color:#0d9488;}
        .pinv-dd-trigger.open{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.12);}
        .pinv-dd-trigger.has-value{border-color:#99f6e4;background:#f0fdfa;}
        .pinv-dd-content{flex:1;overflow:hidden;min-width:0;}
        .pinv-dd-placeholder{color:#9ca3af;}
        .pinv-dd-badge{background:#0d9488;color:#fff;border-radius:5px;padding:2px 8px;font-size:12px;font-weight:700;font-family:'DM Mono',monospace;white-space:nowrap;}
        .pinv-dd-clear{display:flex;align-items:center;padding:0 2px;cursor:pointer;color:#94a3b8;}
        .pinv-dd-panel{position:absolute;top:100%;left:0;right:0;z-index:400;background:#fff;border:1px solid #99f6e4;border-top:none;border-radius:0 0 10px 10px;box-shadow:0 8px 24px rgba(13,148,136,.13);animation:ddSlide .15s ease;}
        .pinv-dd-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #ccfbf1;background:#f0fdfa;}
        .pinv-dd-search{flex:1;border:none;outline:none;font-size:12.5px;color:#1e293b;background:transparent;}
        .pinv-dd-count{padding:4px 12px;font-size:11px;color:#94a3b8;font-weight:600;border-bottom:1px solid #f1f5f9;background:#f0fdfa;}
        .pinv-dd-list{max-height:280px;overflow-y:auto;}
        .pinv-dd-option{padding:9px 12px;cursor:pointer;border-bottom:1px solid #f0fdfa;}
        .pinv-dd-option:hover{background:#f0fdfa;}
        .pinv-dd-opt-row1{display:flex;align-items:center;gap:7px;}
        .pinv-po-type-chip{font-size:9px;font-weight:800;border-radius:4px;padding:1px 6px;letter-spacing:.03em;}
        .pinv-po-type-chip--fabric{background:#ede9fe;color:#6d28d9;}
        .pinv-po-type-chip--yarn{background:#fef3c7;color:#92400e;}
        .pinv-dd-opt-no{font-family:'DM Mono',monospace;font-weight:700;font-size:12.5px;color:#0f766e;}
        .pinv-dd-opt-date{font-size:11px;color:#94a3b8;margin-left:auto;}
        .pinv-dd-opt-row2{display:flex;gap:8px;margin-top:3px;}
        .pinv-dd-opt-supplier{font-size:12px;font-weight:600;color:#374151;}
        .pinv-dd-opt-quality{font-size:11px;color:#64748b;}
        .pinv-dd-opt-row3{margin-top:3px;}
        .pinv-dd-opt-bal{font-size:10.5px;font-weight:700;}
        .pinv-dd-status{font-size:11px;margin-top:4px;color:#0d9488;font-weight:700;display:flex;align-items:center;font-family:'DM Mono',monospace;}

        .pinv-item-table-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
        .pinv-item-count{font-size:12px;color:#64748b;font-weight:600;}
        .pinv-add-row-btn{display:flex;align-items:center;gap:5px;background:#f0fdfa;color:#0d9488;border:1px solid #99f6e4;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;}
        .pinv-add-row-btn:hover{background:#ccfbf1;}
        .pinv-item-table-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;}
        .pinv-item-table{width:100%;border-collapse:collapse;font-size:12px;min-width:560px;}
        .pinv-ith{padding:8px 10px;background:#f0fdfa;color:#0f766e;font-weight:700;text-align:left;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:11px;}
        .pinv-ith--r{text-align:right;}
        .pinv-irow-even td{background:#fff;}
        .pinv-irow-odd td{background:#f0fdfa;}
        .pinv-itd{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
        .pinv-itd--amt{text-align:right;font-family:'DM Mono',monospace;font-weight:700;color:#0f766e;}
        .pinv-itd--c{text-align:center;}
        .pinv-iinput{width:100%;border:1px solid #cbd5e1;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;color:#1e293b;background:#fff;}
        .pinv-iinput:focus{border-color:#0d9488;}
        .pinv-iinput--r{text-align:right;}
        .pinv-del-row-btn{background:#fff1f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .pinv-del-row-btn:hover{background:#fee2e2;}

        .pinv-progress-bar{position:relative;height:8px;border-radius:6px;background:#e2e8f0;overflow:hidden;margin-top:6px;}
        .pinv-progress-fill{height:100%;background:linear-gradient(90deg,#0d9488,#14b8a6);border-radius:6px;transition:width .2s;}

        .pinv-gst-section{background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px;margin-top:10px;}
        .pinv-gst-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px;}
        @media(min-width:576px){.pinv-gst-grid{grid-template-columns:repeat(3,1fr);}}
        .pinv-gst-row{display:flex;align-items:center;gap:8px;}
        .pinv-gst-label{width:38px;font-size:13px;font-weight:700;color:#0f766e;flex-shrink:0;}
        .pinv-gst-input{width:68px;border:1px solid #99f6e4;border-radius:6px;padding:5px 8px;font-size:13px;text-align:right;outline:none;background:#fff;flex-shrink:0;}
        .pinv-gst-input:focus{border-color:#0d9488;}
        .pinv-gst-pct{font-size:12px;color:#94a3b8;flex-shrink:0;}
        .pinv-sub-row{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #99f6e4;padding-top:8px;margin-top:4px;}
        .pinv-net-row{display:flex;align-items:center;justify-content:space-between;border-top:2px solid #0d9488;padding-top:10px;margin-top:8px;}
        .pinv-net-label{font-size:15px;font-weight:700;color:#1e293b;}
        .pinv-net-val{font-size:20px;font-weight:800;color:#0d9488;}

        .pinv-cancel-btn{padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#475569;}
        .pinv-cancel-btn:hover{background:#f1f5f9;}
        .pinv-save-btn{display:flex;align-items:center;gap:6px;padding:9px 24px;border:none;background:#16a34a;color:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(22,163,74,.3);}
        .pinv-save-btn:disabled{opacity:.7;cursor:not-allowed;}
        .pinv-save-btn:hover:not(:disabled){background:#15803d;}

        .pinv-confirm-overlay{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;}
        .pinv-confirm-box{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.22);padding:28px 24px;max-width:400px;width:100%;text-align:center;}
        .pinv-confirm-actions{display:flex;gap:10px;justify-content:center;}
        .pinv-confirm-cancel{padding:9px 22px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#475569;font-weight:600;font-size:13px;cursor:pointer;}
        .pinv-confirm-del{padding:9px 22px;border:none;border-radius:8px;background:#dc2626;color:#fff;font-weight:700;font-size:13px;cursor:pointer;}
        .pinv-confirm-del:disabled{background:#fca5a5;cursor:not-allowed;}

        input:focus,select:focus,textarea:focus{outline:none;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#f1f5f9;}
        ::-webkit-scrollbar-thumb{background:#99f6e4;border-radius:3px;}
      `}</style>

      <div className="pinv-wrap">
        {/* ── Page Header ── */}
        <div className="pinv-page-header">
          <div>
            <h1>Purchase Invoice</h1>
            <p>{total} invoice{total !== 1 ? "s" : ""} — supplier bills against Fabric &amp; Yarn Purchase Orders</p>
          </div>
          <button className="pinv-new-btn" onClick={handleNew}><Plus size={15} /> Add Invoice Bill</button>
        </div>

        {/* ── Toolbar ── */}
        <div className="pinv-toolbar">
          <div className="pinv-search-wrap">
            <Search size={14} color="#94a3b8" />
            <input className="pinv-search" placeholder="Search invoice no, PO no, supplier…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="pinv-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="pinv-card">
          <div className="pinv-table-wrap">
            <table className="pinv-table">
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
                  <tr><td colSpan={10} className="pinv-empty"><Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /></td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={10} className="pinv-empty">{search ? "No invoices match your search." : 'No purchase invoices yet. Click "Add Invoice Bill" to create one.'}</td></tr>
                ) : invoices.map((inv, i) => (
                  <tr key={inv.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="pinv-inv-no">{inv.invoice_no}</span></td>
                    <td style={{ color: "#64748b" }}>{fmtDate(inv.invoice_date)}</td>
                    <td><span className="pinv-po-no">{inv.po_no || "—"}</span></td>
                    <td style={{ fontWeight: 600 }}>{inv.supplier}</td>
                    {width >= 768 && <td className="pinv-td-num">{fmt(inv.delivered_qty)} {inv.unit}</td>}
                    <td className="pinv-td-num" style={{ fontWeight: 700, color: "#0d9488" }}>₹{fmt(inv.net_value)}</td>
                    {width >= 900 && <td className="pinv-td-num" style={{ color: (inv.balance_due || 0) > 0 ? "#dc2626" : "#166534" }}>₹{fmt(inv.balance_due)}</td>}
                    <td><span className={`pinv-status-chip pinv-status-${inv.status || "Pending"}`}>{inv.status || "Pending"}</span></td>
                    <td style={{ textAlign: "center" }}>
                      <RowActionsMenu onEdit={() => handleOpenEdit(inv)} onPrint={() => handlePrint(inv)} onDelete={() => setDeleteTarget(inv)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="pinv-pg-bar">
              <span>Page {page} of {totalPages} — {total} record(s)</span>
              <div className="pinv-pg-btns">
                <button className="pinv-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="pinv-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                <button className="pinv-pg-btn active">{page}</button>
                <button className="pinv-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="pinv-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ════ CREATE / EDIT MODAL ════ */}
        {showModal && (
          <div className="pinv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="pinv-modal">
              <div className="pinv-modal-header">
                <div>
                  <h2 className="pinv-modal-title">{editId ? "✏️ Edit Purchase Invoice" : "➕ Add Invoice Bill"}</h2>
                  <p className="pinv-modal-subtitle">{form.invoice_no || "Generating Invoice No…"}</p>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }} onClick={handleClose}><X size={22} color="#fff" /></button>
              </div>

              <div className="pinv-modal-body">
                {saveError && (
                  <div className="pinv-error-banner">
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>{saveError}</span>
                    <button onClick={() => setSaveError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14} /></button>
                  </div>
                )}

                {/* ── Purchase Invoice Details ── */}
                <SectionHead title="Purchase Invoice Details" open={sec.details} onToggle={() => setSec(p => ({ ...p, details: !p.details }))} />
                {sec.details && (
                  <div className="pinv-grid-3" style={{ paddingTop: 12, paddingBottom: 4 }}>

                    <Field label="Invoice No" type="locked">
                      <div className={`pinv-input pinv-input--locked`} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 38 }}>
                        {invGenerating ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : (form.invoice_no || "Auto-generated")}
                      </div>
                      <p className="pinv-hint">Auto-generated (PINV-YYYY-NNN)</p>
                    </Field>

                    <Field label="Invoice Date" type="date">
                      <input className="pinv-input" type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} />
                    </Field>

                    <Field label="Due Date" type="date">
                      <input className="pinv-input" type="date" value={form.due_date || ""} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                    </Field>

                    <div className="pinv-col-full">
                      <Field label="PO No" type="lookup" required hint="Selecting a PO auto-fills Supplier, Quality, Rate, HSN, Unit, GST & Balance below">
                        <PoLineDropdown value={form.po_item_id ? String(form.po_item_id) : ""} label={form.po_no} onSelect={selectPoLine} />
                      </Field>
                    </div>

                    <Field label="Supplier" type={form.po_item_id ? "autofill" : "text"} required>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="text" placeholder="e.g. MADURAI WEAVING MILLS" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
                    </Field>

                    <Field label="Quality / Construction" type={form.po_item_id ? "autofill" : "text"}>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="text" value={form.quality} onChange={e => setForm({ ...form, quality: e.target.value })} />
                    </Field>

                    <Field label="HSN Code" type={form.po_item_id ? "autofill" : "text"}>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="text" value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
                    </Field>

                    <Field label="Unit" type={form.po_item_id ? "autofill" : "select"}>
                      <select className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                        {["MTR", "KG", "PCS", "YDS", "ROLL"].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>

                    <Field label="Rate (₹)" type={form.po_item_id ? "autofill" : "number"}>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="number" min={0} step="0.01" value={form.rate || ""} onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} />
                    </Field>

                    <div className="pinv-col-full">
                      <Field label="Total Order Qty vs Balance" type="computed">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "#374151" }}>
                          <span>Ordered: <strong style={{ color: "#0f766e" }}>{fmt(form.total_order_qty)} {form.unit}</strong></span>
                          <span>Already Invoiced: <strong style={{ color: "#b45309" }}>{fmt(form.already_invoiced_qty || 0)} {form.unit}</strong></span>
                          <span>Balance After This: <strong style={{ color: totals.balance_qty < 0 ? "#dc2626" : "#166534" }}>{fmt(totals.balance_qty)} {form.unit}</strong></span>
                        </div>
                        <div className="pinv-progress-bar">
                          <div className="pinv-progress-fill" style={{ width: `${Math.min(100, form.total_order_qty ? (((form.already_invoiced_qty || 0) + totals.delivered_qty) / form.total_order_qty) * 100 : 0)}%` }} />
                        </div>
                        {totals.balance_qty < 0 && <p className="pinv-hint pinv-hint--warn">⚠ This invoice's delivered qty exceeds the remaining PO balance — double-check before saving.</p>}
                      </Field>
                    </div>

                    <div className="pinv-col-full">
                      <Field label="Supplier Address" type={form.po_item_id ? "autofill" : "text"} hint="Auto-filled from the linked PO's supplier — editable">
                        <textarea className={`pinv-input pinv-textarea${form.po_item_id ? " pinv-input--autofill" : ""}`} rows={3} value={form.supplier_address} onChange={e => setForm({ ...form, supplier_address: e.target.value })} />
                      </Field>
                    </div>

                    <Field label="Supplier GSTIN" type={form.po_item_id ? "autofill" : "text"}>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="text" value={form.supplier_gstin} onChange={e => setForm({ ...form, supplier_gstin: e.target.value })} />
                    </Field>

                    <Field label="Advance (₹)" type={form.po_item_id ? "autofill" : "number"}>
                      <input className={`pinv-input${form.po_item_id ? " pinv-input--autofill" : ""}`} type="number" min={0} step="0.01" value={form.advance || ""} onChange={e => setForm({ ...form, advance: parseFloat(e.target.value) || 0 })} />
                    </Field>

                    <Field label="Status" type="select">
                      <select className="pinv-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                        {["Draft", "Pending", "Paid", "Cancelled"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Field>

                    <div className="pinv-col-full">
                      <Field label="Remarks" type="text">
                        <input className="pinv-input" type="text" placeholder="e.g. PURCHASE" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                )}

                {/* ── Delivery Items ── */}
                <SectionHead title="Delivery Items" open={sec.items} onToggle={() => setSec(p => ({ ...p, items: !p.items }))} />
                {sec.items && (
                  <div style={{ paddingTop: 10, paddingBottom: 8 }}>
                    <div className="pinv-item-table-header">
                      <span className="pinv-item-count">{form.items.length} item{form.items.length !== 1 ? "s" : ""}</span>
                      <button type="button" className="pinv-add-row-btn" onClick={addItem}><PlusCircle size={13} /> Add Row</button>
                    </div>
                    <div className="pinv-item-table-wrap">
                      <table className="pinv-item-table">
                        <thead>
                          <tr>
                            <th className="pinv-ith pinv-ith--r" style={{ width: 90 }}>Meter/Qty <FTypeBadge type="number" /></th>
                            <th className="pinv-ith" style={{ minWidth: 140 }}>Piece No</th>
                            <th className="pinv-ith" style={{ minWidth: 140 }}>Roll No</th>
                            <th className="pinv-ith" style={{ minWidth: 120 }}>Lot No</th>
                            <th className="pinv-ith pinv-ith--r" style={{ width: 90 }}>Rate</th>
                            <th className="pinv-ith pinv-ith--r" style={{ width: 110 }}>Amount <FTypeBadge type="computed" /></th>
                            <th className="pinv-ith" style={{ width: 34 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item, idx) => {
                            const rowRate = item.rate !== undefined && item.rate !== null && (item.rate as any) !== "" ? Number(item.rate) : Number(form.rate) || 0;
                            const amount = (Number(item.delivered_qty) || 0) * rowRate;
                            return (
                              <tr key={idx} className={idx % 2 === 0 ? "pinv-irow-even" : "pinv-irow-odd"}>
                                <td className="pinv-itd"><input className="pinv-iinput pinv-iinput--r" type="number" min={0} step="0.01" value={item.delivered_qty || ""} onChange={e => updateItem(idx, { delivered_qty: parseFloat(e.target.value) || 0 })} /></td>
                                <td className="pinv-itd"><input className="pinv-iinput" type="text" value={item.piece_no} onChange={e => updateItem(idx, { piece_no: e.target.value })} /></td>
                                <td className="pinv-itd"><input className="pinv-iinput" type="text" value={item.roll_no} onChange={e => updateItem(idx, { roll_no: e.target.value })} /></td>
                                <td className="pinv-itd"><input className="pinv-iinput" type="text" value={item.lot_no} onChange={e => updateItem(idx, { lot_no: e.target.value })} /></td>
                                <td className="pinv-itd"><input className="pinv-iinput pinv-iinput--r" type="number" min={0} step="0.01" placeholder={String(form.rate || 0)} value={item.rate ?? ""} onChange={e => updateItem(idx, { rate: e.target.value === "" ? undefined : parseFloat(e.target.value) })} /></td>
                                <td className="pinv-itd pinv-itd--amt">₹{fmt(amount)}</td>
                                <td className="pinv-itd pinv-itd--c">
                                  {form.items.length > 1 && <button className="pinv-del-row-btn" onClick={() => removeItem(idx)} title="Remove row"><Trash2 size={13} /></button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, alignItems: "center", padding: "10px 4px", borderTop: "2px solid #e2e8f0", marginTop: 4, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Total {form.unit}</span>
                        <strong style={{ fontSize: 16, fontWeight: 800, color: "#0d9488" }}>{fmt(totals.delivered_qty)}</strong>
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
                  <div className="pinv-gst-section">
                    <div className="pinv-grid-3" style={{ marginBottom: 12 }}>
                      <Field label="GST Type" type="select">
                        <select className="pinv-input" value={form.gst_type} onChange={e => setForm({ ...form, gst_type: e.target.value as GstType })}>
                          <option value="CGST_SGST">CGST + SGST</option>
                          <option value="IGST">IGST</option>
                          <option value="NONE">None</option>
                        </select>
                      </Field>
                    </div>
                    <div className="pinv-gst-grid">
                      {form.gst_type !== "IGST" && (
                        <>
                          <div className="pinv-gst-row"><span className="pinv-gst-label">CGST</span><input className="pinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.cgst_pct || ""} onChange={e => setForm({ ...form, cgst_pct: parseFloat(e.target.value) || 0 })} /><span className="pinv-gst-pct">%</span></div>
                          <div className="pinv-gst-row"><span className="pinv-gst-label">SGST</span><input className="pinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.sgst_pct || ""} onChange={e => setForm({ ...form, sgst_pct: parseFloat(e.target.value) || 0 })} /><span className="pinv-gst-pct">%</span></div>
                        </>
                      )}
                      {form.gst_type === "IGST" && (
                        <div className="pinv-gst-row"><span className="pinv-gst-label">IGST</span><input className="pinv-gst-input" type="number" min={0} max={100} step="0.01" value={form.igst_pct || ""} onChange={e => setForm({ ...form, igst_pct: parseFloat(e.target.value) || 0 })} /><span className="pinv-gst-pct">%</span></div>
                      )}
                    </div>
                    <div className="pinv-sub-row"><span>GST Amount</span><span style={{ fontWeight: 700 }}>₹{fmt(totals.gst_amount)}</span></div>
                    <div className="pinv-sub-row"><span>Advance</span><span style={{ fontWeight: 700 }}>₹{fmt(form.advance)}</span></div>
                    <div className="pinv-net-row">
                      <span className="pinv-net-label">Net Value / Balance Due</span>
                      <span className="pinv-net-val">₹{fmt(totals.net_value)} <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>(Due ₹{fmt(totals.balance_due)})</span></span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pinv-modal-footer">
                <button className="pinv-cancel-btn" onClick={handleClose}>Cancel</button>
                <button className="pinv-save-btn" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "💾 Save Invoice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ DELETE CONFIRM ════ */}
        {deleteTarget && (
          <div className="pinv-confirm-overlay">
            <div className="pinv-confirm-box">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
              <p style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>Delete Purchase Invoice?</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>
                This will permanently delete <strong>{deleteTarget.invoice_no}</strong> and free up its delivered qty from the PO balance. This action cannot be undone.
              </p>
              <div className="pinv-confirm-actions">
                <button className="pinv-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="pinv-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
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