// frontend/src/pages/admin/OrderBookings.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  Order,
  OrderItem,
  CreateOrderPayload,
} from "../../api/services";

// ─── NEW: import edit/delete API functions ────────────────────────────────────
import { updateOrder, deleteOrder } from "../../api/services";

// ── ADD THIS IMPORT ──────────────────────────
import { useNotification } from "./NotificationContext";
// ─────────────────────────────────────────────

// ─── Utility ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  Pending:    { background: "#fef9c3", color: "#854d0e" },
  Confirmed:  { background: "#dbeafe", color: "#1e40af" },
  Dispatched: { background: "#f3e8ff", color: "#6b21a8" },
  Completed:  { background: "#dcfce7", color: "#166534" },
  Cancelled:  { background: "#fee2e2", color: "#991b1b" },
};

// ─── Factories ────────────────────────────────────────────────────────────────
const emptyItem = (): OrderItem => ({
  construction_po: "", meter: 0, rate: 0,
  disc_type: "None", disc_pct: 0, disc_value: 0, total_value: 0,
});

const defaultForm = (): CreateOrderPayload => ({
  order_type: "Domestic", quality_type: "Regular",
  hsn_code: "", sort_no: "", quality: "", delivery_instruction: "",
  cgst_pct: 0, sgst_pct: 0, igst_pct: 5,
  items: [emptyItem()],
});

// ─── All styles ───────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:        { minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#1e293b" },
  pageHeader:  { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  pageTitle:   { margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" },
  pageSub:     { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  newBtn:      { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.3)" },
  toolbar:     { padding: "16px 28px", display: "flex", alignItems: "center", gap: 12 },
  searchInput: { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 14px", fontSize: 13, width: 300, outline: "none", background: "#fff", color: "#1e293b" },
  recCount:    { fontSize: 13, color: "#64748b" },
  tableWrap:   { margin: "0 28px 28px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0", overflow: "hidden" },
  table:       { width: "100%", borderCollapse: "collapse" as const },
  theadRow:    { background: "#2563eb" },
  th:          { padding: "12px 16px", color: "#fff", fontWeight: 600, textAlign: "left" as const, whiteSpace: "nowrap" as const, fontSize: 13 },
  thR:         { padding: "12px 16px", color: "#fff", fontWeight: 600, textAlign: "right" as const, whiteSpace: "nowrap" as const, fontSize: 13 },
  thC:         { padding: "12px 16px", color: "#fff", fontWeight: 600, textAlign: "center" as const, whiteSpace: "nowrap" as const, fontSize: 13 },
  tdE:         { padding: "11px 16px", background: "#fff", fontSize: 13 },
  tdO:         { padding: "11px 16px", background: "#f8fafc", fontSize: 13 },
  emptyTd:     { padding: "48px 16px", textAlign: "center" as const, color: "#94a3b8" },
  badge:       { display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
  pgBar:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", fontSize: 13, color: "#64748b" },
  pgGroup:     { display: "flex", gap: 4 },
  pgBtn:       { padding: "5px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, color: "#1e293b" },
  pgActive:    { padding: "5px 12px", border: "1px solid #2563eb", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 13 },
  pgDisabled:  { padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed", fontSize: 13 },

  actionGroup: { display: "flex", alignItems: "center", gap: 6, justifyContent: "center" },
  editBtn:     { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1px solid #93c5fd", borderRadius: 6, background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  delRowBtn:   { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff1f2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" },

  overlay:     { position: "fixed" as const, inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 32, paddingBottom: 16, overflowY: "auto" as const },
  modal:       { background: "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.22)", width: "100%", maxWidth: 960, margin: "0 16px 16px" },
  mHead:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#2563eb", borderRadius: "16px 16px 0 0" },
  mHeadEdit:   { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#0f766e", borderRadius: "16px 16px 0 0" },
  mTitle:      { color: "#fff", fontWeight: 700, fontSize: 17, margin: 0 },
  mClose:      { background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: "1", padding: "0 4px" },
  mBody:       { padding: 24 },

  row3:        { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 },
  row13:       { display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 16 },
  fLabel:      { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 },
  input:       { width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", boxSizing: "border-box" as const },
  select:      { width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", boxSizing: "border-box" as const },

  secHdr:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  secTitle:    { fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  addRowBtn:   { display: "flex", alignItems: "center", gap: 4, border: "1px solid #93c5fd", borderRadius: 8, padding: "5px 12px", background: "#eff6ff", color: "#2563eb", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  itemWrap:    { border: "1px solid #e2e8f0", borderRadius: 8, overflowX: "auto" as const, marginBottom: 16 },
  itemTable:   { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  iTh:         { padding: "8px 10px", background: "#f1f5f9", color: "#475569", fontWeight: 600, textAlign: "left" as const, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  iThR:        { padding: "8px 10px", background: "#f1f5f9", color: "#475569", fontWeight: 600, textAlign: "right" as const, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  iTdE:        { padding: "6px 8px", background: "#fff", borderBottom: "1px solid #f1f5f9" },
  iTdO:        { padding: "6px 8px", background: "#eff6ff", borderBottom: "1px solid #f1f5f9" },
  iInput:      { width: "100%", border: "1px solid #cbd5e1", borderRadius: 4, padding: "4px 6px", fontSize: 12, outline: "none", color: "#1e293b", background: "#fff", boxSizing: "border-box" as const },
  iInputR:     { width: "100%", border: "1px solid #cbd5e1", borderRadius: 4, padding: "4px 6px", fontSize: 12, outline: "none", color: "#1e293b", background: "#fff", textAlign: "right" as const, boxSizing: "border-box" as const },
  iInputDis:   { width: "100%", border: "1px solid #e2e8f0", borderRadius: 4, padding: "4px 6px", fontSize: 12, outline: "none", color: "#94a3b8", background: "#f8fafc", textAlign: "right" as const, boxSizing: "border-box" as const },
  iSelect:     { width: "100%", border: "1px solid #cbd5e1", borderRadius: 4, padding: "4px 6px", fontSize: 12, outline: "none", background: "#fff", color: "#1e293b" },
  delBtn:      { background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, fontWeight: 700, padding: 0, lineHeight: "1" },

  botGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 },
  textarea:    { width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1e293b", outline: "none", resize: "none" as const, boxSizing: "border-box" as const, fontFamily: "inherit", height: 110 },
  gstBox:      { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px" },
  gstRow:      { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  gstLabel:    { width: 40, fontSize: 13, fontWeight: 700, color: "#475569" },
  gstInput:    { width: 70, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" as const, outline: "none", background: "#fff" },
  gstAmt:      { marginLeft: "auto", fontFamily: "monospace", fontSize: 13, color: "#334155" },
  netRow:      { display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: 10, marginTop: 4 },
  netLabel:    { fontSize: 14, fontWeight: 700, color: "#1e293b" },
  netVal:      { fontSize: 18, fontWeight: 800, color: "#1d4ed8", fontFamily: "'DM Sans', sans-serif" },

  errBox:      { background: "#fff1f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
  actRow:      { display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  cancelBtn:   { padding: "9px 20px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  saveBtn:     { padding: "9px 22px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 6px rgba(22,163,74,0.3)" },
  updateBtn:   { padding: "9px 22px", border: "none", borderRadius: 8, background: "#0f766e", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 6px rgba(15,118,110,0.3)" },
  saveDis:     { padding: "9px 22px", border: "none", borderRadius: 8, background: "#86efac", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "not-allowed" },

  okWrap:      { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12 },
  okIcon:      { width: 64, height: 64, background: "#dcfce7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 },
  okTitle:     { fontSize: 18, fontWeight: 700, color: "#1e293b", margin: 0 },
  okCode:      { fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 700, color: "#2563eb", margin: 0 },
  okClose:     { marginTop: 12, padding: "9px 24px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" },

  confirmOverlay: { position: "fixed" as const, inset: 0, zIndex: 2000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" },
  confirmBox:     { background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.22)", padding: "32px 28px", maxWidth: 400, width: "100%", margin: "0 16px", textAlign: "center" as const },
  confirmIcon:    { fontSize: 40, marginBottom: 12 },
  confirmTitle:   { fontSize: 17, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" },
  confirmSub:     { fontSize: 13, color: "#64748b", margin: "0 0 24px" },
  confirmActions: { display: "flex", gap: 10, justifyContent: "center" },
  confirmCancel:  { padding: "9px 22px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  confirmDel:     { padding: "9px 22px", border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  confirmDelDis:  { padding: "9px 22px", border: "none", borderRadius: 8, background: "#fca5a5", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "not-allowed" },

  // ── Loading spinner overlay inside modal ──
  loadingWrap: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 16 },
  spinner:     { width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: "4px solid #0f766e", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingText: { fontSize: 14, color: "#64748b" },
};

// ═════════════════════════════════════════════════════════════════════════════
export default function OrderBookings() {
  const { addNotification } = useNotification();

  const [orders,  setOrders]  = useState<Order[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const LIMIT = 10;

  // ── Create modal state ──
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState<CreateOrderPayload>(defaultForm());
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedCode, setSavedCode] = useState("");

  // ── Edit modal state ──
  // FIX: use a boolean `showEditModal` to open the modal immediately,
  //      and `editLoadingData` to show a spinner while the API call is in flight.
  const [showEditModal,  setShowEditModal]  = useState(false);
  const [editLoadingData, setEditLoadingData] = useState(false);
  const [editOrder,      setEditOrder]      = useState<Order | null>(null);
  const [editForm,       setEditForm]       = useState<CreateOrderPayload>(defaultForm());
  const [editSaving,     setEditSaving]     = useState(false);
  const [editError,      setEditError]      = useState("");
  const [editSuccess,    setEditSuccess]    = useState(false);

  // ── Delete confirm state ──
  const [deleteTarget,     setDeleteTarget]     = useState<Order | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError,      setDeleteError]      = useState("");

  // ── Fetch list ──
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrders(page, LIMIT, search);
      setOrders(res.data);
      setTotal(res.total);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── GST calc (create form) ──
  const basicTotal = useMemo(
    () => form.items.reduce((s, i) => s + (i.total_value || 0), 0),
    [form.items]
  );
  const cgstAmt  = +(basicTotal * (Number(form.cgst_pct) || 0) / 100).toFixed(2);
  const sgstAmt  = +(basicTotal * (Number(form.sgst_pct) || 0) / 100).toFixed(2);
  const igstAmt  = +(basicTotal * (Number(form.igst_pct) || 0) / 100).toFixed(2);
  const netTotal = +((basicTotal + cgstAmt + sgstAmt + igstAmt) || 0).toFixed(2);

  // ── GST calc (edit form) ──
  // Coerce to Number() defensively — API may return string values
  const editBasicTotal = useMemo(
    () => editForm.items.reduce((s, i) => s + (Number(i.total_value) || 0), 0),
    [editForm.items]
  );
  const editCgstAmt  = +(editBasicTotal * (Number(editForm.cgst_pct) || 0) / 100).toFixed(2);
  const editSgstAmt  = +(editBasicTotal * (Number(editForm.sgst_pct) || 0) / 100).toFixed(2);
  const editIgstAmt  = +(editBasicTotal * (Number(editForm.igst_pct) || 0) / 100).toFixed(2);
  const editNetTotal = +((editBasicTotal + editCgstAmt + editSgstAmt + editIgstAmt) || 0).toFixed(2);

  // ── Item helpers ──
  const recalcItem = (item: OrderItem): OrderItem => {
    const basic   = +(item.meter * item.rate).toFixed(2);
    let discValue = 0;
    if (item.disc_type === "Percent") discValue = +(basic * item.disc_pct / 100).toFixed(2);
    else if (item.disc_type === "Flat") discValue = item.disc_value;
    return { ...item, disc_value: discValue, total_value: +(basic - discValue).toFixed(2) };
  };

  const makeUpdateItem = (
    setter: React.Dispatch<React.SetStateAction<CreateOrderPayload>>
  ) => (idx: number, patch: Partial<OrderItem>) =>
    setter((f) => {
      const items = [...f.items];
      items[idx]  = recalcItem({ ...items[idx], ...patch });
      return { ...f, items };
    });

  const updateItem     = makeUpdateItem(setForm);
  const updateEditItem = makeUpdateItem(setEditForm);

  const makeAddItem = (setter: React.Dispatch<React.SetStateAction<CreateOrderPayload>>) =>
    () => setter((f) => ({ ...f, items: [...f.items, emptyItem()] }));

  const makeRemoveItem = (setter: React.Dispatch<React.SetStateAction<CreateOrderPayload>>) =>
    (idx: number) => setter((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const addItem        = makeAddItem(setForm);
  const addEditItem    = makeAddItem(setEditForm);
  const removeItem     = makeRemoveItem(setForm);
  const removeEditItem = makeRemoveItem(setEditForm);

  /* =========================
     CREATE SAVE
  ========================= */
  const handleSave = async () => {
    setSaveError("");
    if (!form.hsn_code || !form.sort_no || !form.quality) {
      setSaveError("HSN Code, Sort No & Quality are required."); return;
    }
    if (form.items.some((i) => !i.construction_po)) {
      setSaveError("All Construction rows must have a description."); return;
    }
    setSaving(true);
    try {
      const res = await createOrder(form);
      setSavedCode(res.order_code);
      addNotification('success', 'Order Created', `New order "${res.order_code}" has been created successfully.`);
      fetchOrders();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to save order.";
      setSaveError(msg);
      addNotification('error', 'Order Save Failed', msg);
    } finally { setSaving(false); }
  };

  const handleClose = () => {
    setShowModal(false);
    setForm(defaultForm());
    setSaveError("");
    setSavedCode("");
  };

  /* =========================
     OPEN EDIT — FIX IS HERE
     Open the modal immediately, then load data in background.
  ========================= */
  const handleOpenEdit = async (order: Order) => {
    // 1. Reset all edit state
    setEditError("");
    setEditSuccess(false);
    setEditOrder(order);          // set the row data we already have from the list
    setEditForm({                 // pre-populate with list data so modal isn't blank
      order_type:           order.order_type,
      quality_type:         order.quality_type,
      hsn_code:             order.hsn_code,
      sort_no:              order.sort_no,
      quality:              order.quality,
      delivery_instruction: order.delivery_instruction ?? "",
      cgst_pct:             Number(order.cgst_pct) || 0,
      sgst_pct:             Number(order.sgst_pct) || 0,
      igst_pct:             Number(order.igst_pct) || 0,
      items:                [emptyItem()],
    });

    // 2. Open the modal immediately — user sees it right away
    setShowEditModal(true);
    setEditLoadingData(true);

    // 3. Fetch the full order (with line items) in the background
    try {
      const full = await getOrderById(order.id);
      setEditOrder(full);
      setEditForm({
        order_type:           full.order_type,
        quality_type:         full.quality_type,
        hsn_code:             full.hsn_code,
        sort_no:              full.sort_no,
        quality:              full.quality,
        delivery_instruction: full.delivery_instruction ?? "",
        cgst_pct:             Number(full.cgst_pct) || 0,
        sgst_pct:             Number(full.sgst_pct) || 0,
        igst_pct:             Number(full.igst_pct) || 0,
        items: (full.items && full.items.length > 0)
          ? full.items.map((i) => ({
              id:              i.id,
              order_id:        i.order_id,
              construction_po: i.construction_po,
              meter:           Number(i.meter)       || 0,
              rate:            Number(i.rate)        || 0,
              disc_type:       i.disc_type,
              disc_pct:        Number(i.disc_pct)    || 0,
              disc_value:      Number(i.disc_value)  || 0,
              total_value:     Number(i.total_value) || 0,
            }))
          : [emptyItem()],
      });
    } catch {
      // If the detail fetch fails, the modal still shows with list-level data
      // Just show an error message inside the modal
      setEditError("Could not load full order details. You may still edit basic fields.");
    } finally {
      setEditLoadingData(false);
    }
  };

  const handleEditClose = () => {
    setShowEditModal(false);
    setEditOrder(null);
    setEditForm(defaultForm());
    setEditError("");
    setEditSuccess(false);
    setEditLoadingData(false);
  };

  /* =========================
     UPDATE SAVE
  ========================= */
  const handleUpdate = async () => {
    setEditError("");
    if (!editForm.hsn_code || !editForm.sort_no || !editForm.quality) {
      setEditError("HSN Code, Sort No & Quality are required."); return;
    }
    if (editForm.items.some((i) => !i.construction_po)) {
      setEditError("All Construction rows must have a description."); return;
    }
    setEditSaving(true);
    try {
      await updateOrder(editOrder!.id, editForm);
      setEditSuccess(true);
      addNotification('success', 'Order Updated', `Order "${editOrder!.order_code}" has been updated successfully.`);
      fetchOrders();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to update order.";
      setEditError(msg);
      addNotification('error', 'Order Update Failed', msg);
    } finally { setEditSaving(false); }
  };

  /* =========================
     DELETE
  ========================= */
  const handleDeleteClick = (order: Order) => {
    setDeleteTarget(order);
    setDeleteError("");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    setDeleteError("");
    try {
      await deleteOrder(deleteTarget.id);
      addNotification('warning', 'Order Deleted', `Order "${deleteTarget.order_code}" and all its line items have been permanently deleted.`);
      setDeleteTarget(null);
      fetchOrders();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Failed to delete order.";
      setDeleteError(msg);
      addNotification('error', 'Delete Failed', msg);
    } finally { setDeleteConfirming(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const pgNums     = Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1);

  // ─── Shared form body renderer ─────────────────────────────────────────────
  const renderFormBody = (
    f: CreateOrderPayload,
    setF: React.Dispatch<React.SetStateAction<CreateOrderPayload>>,
    updItem: (idx: number, patch: Partial<OrderItem>) => void,
    addIt: () => void,
    rmIt:  (idx: number) => void,
    basicTot: number,
    cgst: number,
    sgst: number,
    igst: number,
    net:  number,
    errMsg: string,
    isSaving: boolean,
    isEdit: boolean,
    onSave: () => void,
    onClose: () => void,
  ) => (
    <div style={S.mBody}>
      {/* Row 1 */}
      <div style={S.row3}>
        <FField label="Order Type">
          <select style={S.select} value={f.order_type}
            onChange={(e) => setF({ ...f, order_type: e.target.value as "Domestic" | "Export" })}>
            <option>Domestic</option>
            <option>Export</option>
          </select>
        </FField>
        <FField label="Quality Type">
          <select style={S.select} value={f.quality_type}
            onChange={(e) => setF({ ...f, quality_type: e.target.value })}>
            {["Regular","Premium","Economy","Special"].map((q) => <option key={q}>{q}</option>)}
          </select>
        </FField>
        <FField label="HSN Code *">
          <input style={S.input} type="text" placeholder="e.g. 551611"
            value={f.hsn_code}
            onChange={(e) => setF({ ...f, hsn_code: e.target.value })} />
        </FField>
      </div>

      {/* Row 2 */}
      <div style={S.row13}>
        <FField label="Sort No *">
          <input style={S.input} type="text" placeholder="e.g. 30742"
            value={f.sort_no}
            onChange={(e) => setF({ ...f, sort_no: e.target.value })} />
        </FField>
        <FField label="Quality (Full Description) *">
          <input style={S.input} type="text"
            placeholder="31/1 ECOVERO VORTEX X 30/1 ECOVERO HIGH TWIST / 68 X 56 - 63 1/1 PLAIN"
            value={f.quality}
            onChange={(e) => setF({ ...f, quality: e.target.value })} />
        </FField>
      </div>

      {/* Line items */}
      <div>
        <div style={S.secHdr}>
          <span style={S.secTitle}>Construction / Items</span>
          <button style={S.addRowBtn} onClick={addIt}>＋ Add Row</button>
        </div>
        <div style={S.itemWrap}>
          <table style={S.itemTable}>
            <thead>
              <tr>
                <th style={{ ...S.iTh,  width: 220 }}>Construction as PO</th>
                <th style={{ ...S.iThR, width: 80  }}>Meter</th>
                <th style={{ ...S.iThR, width: 80  }}>Rate</th>
                <th style={{ ...S.iThR, width: 100 }}>Basic Value</th>
                <th style={{ ...S.iTh,  width: 90  }}>Disc. Type</th>
                <th style={{ ...S.iThR, width: 70  }}>Disc. %</th>
                <th style={{ ...S.iThR, width: 100 }}>Disc. Value</th>
                <th style={{ ...S.iThR, width: 100 }}>Total Value</th>
                <th style={{ ...S.iTh,  width: 30  }}></th>
              </tr>
            </thead>
            <tbody>
              {f.items.map((item, idx) => {
                const itd   = idx % 2 === 0 ? S.iTdE : S.iTdO;
                const basic = +(item.meter * item.rate).toFixed(2);
                return (
                  <tr key={idx}>
                    <td style={itd}>
                      <input style={S.iInput} type="text"
                        placeholder="30ECOVERO X 30ECOVERO HT -68X56-63"
                        value={item.construction_po}
                        onChange={(e) => updItem(idx, { construction_po: e.target.value })} />
                    </td>
                    <td style={itd}>
                      <input style={S.iInputR} type="number" min={0}
                        value={item.meter || ""}
                        onChange={(e) => updItem(idx, { meter: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td style={itd}>
                      <input style={S.iInputR} type="number" min={0} step="0.01"
                        value={item.rate || ""}
                        onChange={(e) => updItem(idx, { rate: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td style={{ ...itd, textAlign: "right", fontFamily: "'DM Sans', sans-serif", color: "#334155" }}>
                      {fmt(basic)}
                    </td>
                    <td style={itd}>
                      <select style={S.iSelect} value={item.disc_type}
                        onChange={(e) => updItem(idx, { disc_type: e.target.value as OrderItem["disc_type"] })}>
                        <option>None</option>
                        <option>Flat</option>
                        <option>Percent</option>
                      </select>
                    </td>
                    <td style={itd}>
                      <input
                        style={item.disc_type !== "Percent" ? S.iInputDis : S.iInputR}
                        type="number" min={0} step="0.01"
                        value={item.disc_pct || ""}
                        disabled={item.disc_type !== "Percent"}
                        onChange={(e) => updItem(idx, { disc_pct: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td style={itd}>
                      <input
                        style={item.disc_type !== "Flat" ? S.iInputDis : S.iInputR}
                        type="number" min={0} step="0.01"
                        value={item.disc_value || ""}
                        disabled={item.disc_type !== "Flat"}
                        onChange={(e) => updItem(idx, { disc_value: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td style={{ ...itd, textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#1d4ed8" }}>
                      {fmt(item.total_value)}
                    </td>
                    <td style={{ ...itd, textAlign: "center" }}>
                      {f.items.length > 1 && (
                        <button style={S.delBtn} onClick={() => rmIt(idx)}>✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery + GST */}
      <div style={S.botGrid}>
        <FField label="Delivery Instruction">
          <textarea style={S.textarea} placeholder="AT SAME"
            value={f.delivery_instruction}
            onChange={(e) => setF({ ...f, delivery_instruction: e.target.value })} />
        </FField>

        <div style={S.gstBox}>
          <GstRow label="CGST" pct={f.cgst_pct} amount={cgst}
            onPctChange={(v) => setF({ ...f, cgst_pct: v })} />
          <GstRow label="SGST" pct={f.sgst_pct} amount={sgst}
            onPctChange={(v) => setF({ ...f, sgst_pct: v })} />
          <GstRow label="IGST" pct={f.igst_pct} amount={igst}
            onPctChange={(v) => setF({ ...f, igst_pct: v })} />
          <div style={S.netRow}>
            <span style={S.netLabel}>Net Value</span>
            <span style={S.netVal}>₹{fmt(net)}</span>
          </div>
        </div>
      </div>

      {errMsg && <div style={S.errBox}>⚠ {errMsg}</div>}

      <div style={S.actRow}>
        <button style={S.cancelBtn} onClick={onClose}
          onMouseOver={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseOut={(e)  => (e.currentTarget.style.background = "#fff")}
        >Cancel</button>
        <button
          style={isSaving ? S.saveDis : (isEdit ? S.updateBtn : S.saveBtn)}
          disabled={isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : isEdit ? "✏️ Update Order" : "💾 Save Order"}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>
      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Order Bookings</h1>
          <p style={S.pageSub}>Manage &amp; create fabric orders</p>
        </div>
        <button style={S.newBtn} onClick={() => setShowModal(true)}
          onMouseOver={(e) => (e.currentTarget.style.background = "#1d4ed8")}
          onMouseOut={(e)  => (e.currentTarget.style.background = "#2563eb")}
        >
          <span style={{ fontSize: 18, lineHeight: "1" }}>＋</span> New Order
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div style={S.toolbar}>
        <input style={S.searchInput} type="text"
          placeholder="Search by code, sort no, quality…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <span style={S.recCount}>{total} record(s)</span>
      </div>

      {/* ── Table ── */}
      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr style={S.theadRow}>
                <th style={S.th}>#</th>
                <th style={S.th}>Order Code</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Sort No</th>
                <th style={S.th}>Quality</th>
                <th style={S.th}>HSN</th>
                <th style={S.thR}>Net Value</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Date</th>
                <th style={S.thC}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={S.emptyTd}>Loading…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={10} style={S.emptyTd}>No orders found. Click "New Order" to create one.</td></tr>
              ) : orders.map((o, i) => {
                const td = i % 2 === 0 ? S.tdE : S.tdO;
                return (
                  <tr key={o.id}>
                    <td style={{ ...td, color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                    <td style={{ ...td, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "#2563eb" }}>{o.order_code}</td>
                    <td style={td}>{o.order_type}</td>
                    <td style={td}>{o.sort_no}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.quality}>{o.quality}</td>
                    <td style={td}>{o.hsn_code}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>₹{fmt(o.net_value)}</td>
                    <td style={td}>
                      <span style={{ ...S.badge, ...(STATUS_STYLE[o.status] || {}) }}>{o.status}</span>
                    </td>
                    <td style={{ ...td, color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(o.created_at).toLocaleDateString("en-IN")}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <div style={S.actionGroup}>
                        <button
                          style={S.editBtn}
                          title="Edit order"
                          onClick={() => handleOpenEdit(o)}
                          onMouseOver={(e) => (e.currentTarget.style.background = "#dbeafe")}
                          onMouseOut={(e)  => (e.currentTarget.style.background = "#eff6ff")}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          style={S.delRowBtn}
                          title="Delete order"
                          onClick={() => handleDeleteClick(o)}
                          onMouseOver={(e) => (e.currentTarget.style.background = "#fee2e2")}
                          onMouseOut={(e)  => (e.currentTarget.style.background = "#fff1f2")}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={S.pgBar}>
          <span>Page {page} of {totalPages}</span>
          <div style={S.pgGroup}>
            <button style={page === 1 ? S.pgDisabled : S.pgBtn} disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}>← Prev</button>
            {pgNums.map((p) => (
              <button key={p} style={p === page ? S.pgActive : S.pgBtn}
                onClick={() => setPage(p)}>{p}</button>
            ))}
            <button style={page === totalPages ? S.pgDisabled : S.pgBtn} disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      </div>

      {/* ════════════ CREATE MODAL ════════════ */}
      {showModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.mHead}>
              <h2 style={S.mTitle}>New Order Booking</h2>
              <button style={S.mClose} onClick={handleClose}>✕</button>
            </div>

            {savedCode ? (
              <div style={S.okWrap}>
                <div style={S.okIcon}>✅</div>
                <p style={S.okTitle}>Order Saved Successfully!</p>
                <p style={S.okCode}>{savedCode}</p>
                <button style={S.okClose} onClick={handleClose}>Close</button>
              </div>
            ) : renderFormBody(
              form, setForm, updateItem, addItem, removeItem,
              basicTotal, cgstAmt, sgstAmt, igstAmt, netTotal,
              saveError, saving, false, handleSave, handleClose,
            )}
          </div>
        </div>
      )}

      {/* ════════════ EDIT MODAL ════════════
          FIX: controlled by `showEditModal` boolean — opens instantly on click.
      */}
      {showEditModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.mHeadEdit}>
              <h2 style={S.mTitle}>
                Edit Order — {editOrder?.order_code ?? "…"}
              </h2>
              <button style={S.mClose} onClick={handleEditClose}>✕</button>
            </div>

            {/* While fetching full details, show a spinner */}
            {editLoadingData ? (
              <div style={S.loadingWrap}>
                <div style={S.spinner} />
                <span style={S.loadingText}>Loading order details…</span>
              </div>
            ) : editSuccess ? (
              <div style={S.okWrap}>
                <div style={{ ...S.okIcon, background: "#ccfbf1" }}>✅</div>
                <p style={S.okTitle}>Order Updated Successfully!</p>
                <p style={S.okCode}>{editOrder?.order_code}</p>
                <button style={{ ...S.okClose, background: "#0f766e" }} onClick={handleEditClose}>Close</button>
              </div>
            ) : renderFormBody(
              editForm, setEditForm, updateEditItem, addEditItem, removeEditItem,
              editBasicTotal, editCgstAmt, editSgstAmt, editIgstAmt, editNetTotal,
              editError, editSaving, true, handleUpdate, handleEditClose,
            )}
          </div>
        </div>
      )}

      {/* ════════════ DELETE CONFIRM ════════════ */}
      {deleteTarget && (
        <div style={S.confirmOverlay}>
          <div style={S.confirmBox}>
            <div style={S.confirmIcon}>🗑️</div>
            <p style={S.confirmTitle}>Delete Order?</p>
            <p style={S.confirmSub}>
              This will permanently delete order <strong>{deleteTarget.order_code}</strong> and all its line items. This action cannot be undone.
            </p>
            {deleteError && <div style={{ ...S.errBox, marginBottom: 16 }}>⚠ {deleteError}</div>}
            <div style={S.confirmActions}>
              <button style={S.confirmCancel} onClick={() => setDeleteTarget(null)}
                onMouseOver={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseOut={(e)  => (e.currentTarget.style.background = "#fff")}
              >Cancel</button>
              <button
                style={deleteConfirming ? S.confirmDelDis : S.confirmDel}
                disabled={deleteConfirming}
                onClick={handleDeleteConfirm}
              >
                {deleteConfirming ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={S.fLabel}>{label}</label>
      {children}
    </div>
  );
}

function GstRow({ label, pct, amount, onPctChange }: {
  label: string; pct: number; amount: number; onPctChange: (v: number) => void;
}) {
  return (
    <div style={S.gstRow}>
      <span style={S.gstLabel}>{label}</span>
      <input style={S.gstInput} type="number" min={0} max={100} step="0.01"
        value={pct || ""}
        onChange={(e) => onPctChange(parseFloat(e.target.value) || 0)} />
      <span style={{ fontSize: 12, color: "#94a3b8" }}>%</span>
      <span style={S.gstAmt}>₹{fmt(amount)}</span>
    </div>
  );
}