// ============================================================
//  EditDevelopmentProcess.tsx
//  Full Pipeline Edit — Fetch · Edit · Update · Delete
//  Panels: Request Info | Dev Analysis | Yardage MOQ | Price List | Chat
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "../../api/axios";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestInfo {
  id: number;
  request_code: string;
  customer_name: string;
  agent_name: string;
  sample_type: string;
  fabric_code: string;
  fabric_quality: string;
  color: string;
  quantity_meters: string;
  status: string;
  customer_comments: string;
  created_at?: string;
}

interface DevAnalysis {
  id?: number;
  style_number: string;
  construction: string;
  blend: string;
  gsm: string;
  weave_type: string;
  analyzed_by: string;
  analysis_date: string;
  remarks: string;
}

interface YardageMOQRow {
  id: number;
  fabric_code: string;
  order_type: string;
  moq_meters: string;
  moq_yards: string;
  price_per_meter: string;
  price_per_yard: string;
  currency: string;
  valid_from: string;
  valid_until: string;
}

interface PriceListRow {
  id: number;
  fabric_code: string;
  fabric_quality: string;
  color: string;
  list_type: string;
  min_quantity_meters: string;
  max_quantity_meters: string;
  price_per_meter: string;
  total_price: string;
  discount_percent: string;
  final_price: string;
  currency: string;
  remarks: string;
}

interface ChatMessage {
  id: number;
  sender: "user" | "admin" | "bot";
  message: string;
  is_read: number;
  created_at: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type PanelKey = "p0" | "p1" | "p2" | "p3";

// ─── Empty defaults ────────────────────────────────────────────────────────────

const emptyDevAnalysis = (): DevAnalysis => ({
 style_number: "", construction: "", blend: "",
  gsm: "", weave_type: "", 
  analyzed_by: "", analysis_date: "", remarks: "",
});

const emptyYardage = (): Omit<YardageMOQRow, "id"> => ({
  fabric_code: "", order_type: "sample", moq_meters: "", moq_yards: "",
  price_per_meter: "", price_per_yard: "", currency: "INR",
  valid_from: "", valid_until: "",
});

const emptyPrice = (): Omit<PriceListRow, "id"> => ({
  fabric_code: "", fabric_quality: "", color: "", list_type: "sample_meter",
  min_quantity_meters: "", max_quantity_meters: "", price_per_meter: "",
  total_price: "", discount_percent: "0", final_price: "", currency: "INR", remarks: "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toStr    = (v: any)             => (v == null ? "" : String(v));
const dateStr  = (v: any)             => (v ? String(v).split("T")[0] : "");
const toFixed2 = (n: number)          => (isNaN(n) ? "0.00" : n.toFixed(2));
const calcYards     = (m: string)     => toFixed2((parseFloat(m) || 0) * 1.09361);
const calcPriceYard = (ppm: string)   => toFixed2((parseFloat(ppm) || 0) / 1.09361);
const calcTotal     = (qty: string, ppm: string) =>
  toFixed2((parseFloat(qty) || 0) * (parseFloat(ppm) || 0));
const calcFinal     = (total: string, disc: string) =>
  toFixed2(parseFloat(total) * (1 - (parseFloat(disc) || 0) / 100));

// ─── STEP CONFIG ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: "p0", icon: "📋", label: "Request Info",  sub: "sample_requests",      accent: "#475569" },
  { id: "p1", icon: "🔬", label: "Dev Analysis",  sub: "development_analysis", accent: "#6366f1" },
  { id: "p2", icon: "📦", label: "Yardage & MOQ", sub: "yardage_moq_price",    accent: "#f59e0b" },
  { id: "p3", icon: "🏷️", label: "Price List",    sub: "fabric_price_list",    accent: "#10b981" },
  { id: "p4", icon: "💬", label: "Chat",           sub: "chat_messages",        accent: "#8b5cf6" },
];

// ─── Reusable mini-components ─────────────────────────────────────────────────

const Field = ({
  label, value, onChange, type = "text", readOnly, required, wide, placeholder,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; readOnly?: boolean; required?: boolean; wide?: boolean; placeholder?: string;
}) => (
  <div className={`dp-field${wide ? " dp-wide" : ""}`}>
    <label className="dp-label">{label}{required && <span className="dp-req">*</span>}</label>
    <input
      className={`dp-input${readOnly ? " dp-ro" : ""}`}
      type={type} value={value} readOnly={readOnly} placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
    />
  </div>
);

const Select = ({
  label, value, onChange, options, wide,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[]; wide?: boolean;
}) => (
  <div className={`dp-field${wide ? " dp-wide" : ""}`}>
    <label className="dp-label">{label}</label>
    <select className="dp-input dp-sel" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Textarea = ({
  label, value, onChange, wide, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; wide?: boolean; placeholder?: string;
}) => (
  <div className={`dp-field${wide ? " dp-wide" : ""}`}>
    <label className="dp-label">{label}</label>
    <textarea
      className="dp-ta" value={value} rows={3} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const SaveBtn = ({ state, onClick, label = "Save Changes" }: {
  state: SaveState; onClick: () => void; label?: string;
}) => (
  <button
    className={`dp-savebtn s-${state}`}
    onClick={onClick}
    disabled={state === "saving"}
  >
    {state === "saving" ? <><span className="dp-spin" />Saving…</> :
     state === "saved"  ? "✓ Saved!" :
     state === "error"  ? "⚠ Retry" : label}
  </button>
);

const DeleteBtn = ({ onClick, label = "Delete", disabled }: {
  onClick: () => void; label?: string; disabled?: boolean;
}) => (
  <button className="dp-delbtn" onClick={onClick} disabled={disabled}>
    🗑 {label}
  </button>
);

const Toast = ({ msg, type }: { msg: string; type: "success" | "error" | "info" }) => (
  <div className={`dp-toast dp-toast-${type}`}>{msg}</div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function EditDevelopmentProcess() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();

  const [activeStep, setActiveStep] = useState("p0");
  const [loading,    setLoading]    = useState(true);
  const [fetchErr,   setFetchErr]   = useState<string | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  // ── Panel data ──
  const [requestInfo,  setRequestInfo]  = useState<RequestInfo | null>(null);
  const [devAnalysis,  setDevAnalysis]  = useState<DevAnalysis>(emptyDevAnalysis());
  const [yardageRows,  setYardageRows]  = useState<YardageMOQRow[]>([]);
  const [priceRows,    setPriceRows]    = useState<PriceListRow[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // ── Per-panel save states ──
  const [saveStates, setSaveStates] = useState<Record<PanelKey, SaveState>>({
    p0: "idle", p1: "idle", p2: "idle", p3: "idle",
  });

  // ── Add-new form state ──
  const [newYardage,    setNewYardage]    = useState<Omit<YardageMOQRow, "id">>(emptyYardage());
  const [newPrice,      setNewPrice]      = useState<Omit<PriceListRow,  "id">>(emptyPrice());
  const [addingYardage, setAddingYardage] = useState(false);
  const [addingPrice,   setAddingPrice]   = useState(false);

  // ── Inline edit state ──
  const [editYardageId,   setEditYardageId]   = useState<number | null>(null);
  const [editYardageForm, setEditYardageForm] = useState<YardageMOQRow | null>(null);
  const [editPriceId,     setEditPriceId]     = useState<number | null>(null);
  const [editPriceForm,   setEditPriceForm]   = useState<PriceListRow | null>(null);

  // ── Chat ──
  const [chatTxt,     setChatTxt]     = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatPollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const setSave = (p: PanelKey, s: SaveState) =>
    setSaveStates((prev) => ({ ...prev, [p]: s }));

  const afterSave = (p: PanelKey, msg: string) => {
    setSave(p, "saved");
    showToast(msg, "success");
    setTimeout(() => setSave(p, "idle"), 2500);
  };

  const onError = (p: PanelKey, err: any) => {
    setSave(p, "error");
    showToast(err?.response?.data?.message || "Save failed", "error");
    setTimeout(() => setSave(p, "idle"), 3000);
  };

  // ─── FETCH all data ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchErr(null);
    try {
      // Fetch request info
      const { data } = await axios.get(`/development-process/${id}`);
      const sr = data.sampleRequest || {};

      setRequestInfo({
        id:                sr.id               ?? 0,
        request_code:      toStr(sr.request_code),
        customer_name:     toStr(sr.customer_name),
        agent_name:        toStr(sr.agent_name),
        sample_type:       toStr(sr.sample_type),
        fabric_code:       toStr(sr.fabric_code),
        fabric_quality:    toStr(sr.fabric_quality),
        color:             toStr(sr.color),
        quantity_meters:   toStr(sr.quantity_meters),
        status:            toStr(sr.status),
        customer_comments: toStr(sr.customer_comments),
        created_at:        dateStr(sr.created_at),
      });

      // Fetch dev analysis
      try {
        const daRes = await axios.get(`/dev-analysis?sample_request_id=${sr.id}`);
        const daArr = Array.isArray(daRes.data) ? daRes.data : [];
        const da = daArr[0] || {};
        setDevAnalysis({
          id:                da.id,
          style_number:      toStr(da.style_number),
          construction:      toStr(da.construction),
          blend:             toStr(da.blend),
          gsm:               toStr(da.gsm),
          weave_type:        toStr(da.weave_type),
          analyzed_by:       toStr(da.analyzed_by),
          analysis_date:     dateStr(da.analysis_date),
          remarks:           toStr(da.remarks),
        });
      } catch { setDevAnalysis(emptyDevAnalysis()); }

      // Fetch yardage rows
      try {
        const ymRes = await axios.get(`/yardage-moq?sample_request_id=${sr.id}`);
        const yRows = Array.isArray(ymRes.data) ? ymRes.data : [];
        setYardageRows(yRows.map((y: any) => ({
          id:              y.id,
          fabric_code:     toStr(y.fabric_code),
          order_type:      y.order_type  || "sample",
          moq_meters:      toStr(y.moq_meters),
          moq_yards:       toStr(y.moq_yards),
          price_per_meter: toStr(y.price_per_meter),
          price_per_yard:  toStr(y.price_per_yard),
          currency:        y.currency    || "INR",
          valid_from:      dateStr(y.valid_from),
          valid_until:     dateStr(y.valid_until),
        })));
      } catch { setYardageRows([]); }

      // Fetch price list rows
      try {
        const plRes = await axios.get(`/price-lists?sample_request_id=${sr.id}`);
        const pRows = Array.isArray(plRes.data) ? plRes.data : [];
        setPriceRows(pRows.map((p: any) => ({
          id:                  p.id,
          fabric_code:         toStr(p.fabric_code),
          fabric_quality:      toStr(p.fabric_quality),
          color:               toStr(p.color),
          list_type:           p.list_type || "sample_meter",
          min_quantity_meters: toStr(p.min_quantity_meters),
          max_quantity_meters: toStr(p.max_quantity_meters),
          price_per_meter:     toStr(p.price_per_meter),
          total_price:         toStr(p.total_price),
          discount_percent:    toStr(p.discount_percent),
          final_price:         toStr(p.final_price),
          currency:            p.currency || "INR",
          remarks:             toStr(p.remarks),
        })));
      } catch { setPriceRows([]); }

      // Chat
      setChatMessages(data.chatMessages || []);

    } catch (err: any) {
      const is404 = err?.response?.status === 404;
      setFetchErr(is404
        ? `No record found for "${id}".`
        : "Failed to load pipeline data.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const startChatPoll = useCallback(() => {
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    chatPollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/development-process/${id}/chat`);
        setChatMessages(Array.isArray(res.data) ? res.data : []);
      } catch { /* silent */ }
    }, 5000);
  }, [id]);

  const stopChatPoll = () => {
    if (chatPollRef.current) clearInterval(chatPollRef.current);
  };

  useEffect(() => {
    if (activeStep === "p4") startChatPoll();
    else stopChatPoll();
    return stopChatPoll;
  }, [activeStep, startChatPoll]);

  // ─── SAVE: P0 — Request Info ──────────────────────────────────────────────
  const saveRequestInfo = async () => {
    if (!requestInfo) return;
    setSave("p0", "saving");
    try {
      const r = requestInfo;
      await axios.put(`/development-process/${id}/request-info`, {
        customer_name:     r.customer_name,
        agent_name:        r.agent_name,
        sample_type:       r.sample_type,
        fabric_code:       r.fabric_code,
        fabric_quality:    r.fabric_quality,
        color:             r.color,
        quantity_meters:   r.quantity_meters,
        status:            r.status,
        customer_comments: r.customer_comments,
      });
      afterSave("p0", "Request info updated!");
    } catch (err) { onError("p0", err); }
  };

  // ─── SAVE: P1 — Dev Analysis (upsert) ────────────────────────────────────
  const saveDevAnalysis = async () => {
    if (!requestInfo) return;
    setSave("p1", "saving");
    try {
      await axios.post(`/dev-analysis`, {
        sample_request_id: requestInfo.id,
        ...devAnalysis,
      });
      afterSave("p1", "Development analysis saved!");
      await fetchAll();
    } catch (err) { onError("p1", err); }
  };

  // Delete dev analysis record
  const deleteDevAnalysis = async () => {
    if (!devAnalysis.id) return;
    if (!window.confirm("Delete this development analysis record?")) return;
    try {
      await axios.delete(`/dev-analysis/${devAnalysis.id}`);
      setDevAnalysis(emptyDevAnalysis());
      showToast("Development analysis deleted", "info");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Delete failed", "error");
    }
  };

  // ─── SAVE: P2 — Yardage new row ───────────────────────────────────────────
  const addYardageRow = async () => {
    if (!requestInfo) return;
    setSave("p2", "saving");
    try {
      const ny = newYardage;
      await axios.post(`/yardage-moq`, {
        sample_request_id: requestInfo.id,
        fabric_code:     ny.fabric_code || requestInfo.fabric_code,
        order_type:      ny.order_type,
        moq_meters:      ny.moq_meters,
        price_per_meter: ny.price_per_meter,
        currency:        ny.currency,
        valid_from:      ny.valid_from  || null,
        valid_until:     ny.valid_until || null,
      });
      afterSave("p2", "Yardage row added!");
      setNewYardage(emptyYardage());
      setAddingYardage(false);
      await fetchAll();
    } catch (err) { onError("p2", err); }
  };

  const updateYardageRow = async () => {
    if (!editYardageForm) return;
    setSave("p2", "saving");
    try {
      await axios.put(`/yardage-moq/${editYardageForm.id}`, {
        fabric_code:     editYardageForm.fabric_code,
        order_type:      editYardageForm.order_type,
        moq_meters:      editYardageForm.moq_meters,
        price_per_meter: editYardageForm.price_per_meter,
        currency:        editYardageForm.currency,
        valid_from:      editYardageForm.valid_from  || null,
        valid_until:     editYardageForm.valid_until || null,
      });
      afterSave("p2", "Yardage row updated!");
      setEditYardageId(null);
      setEditYardageForm(null);
      await fetchAll();
    } catch (err) { onError("p2", err); }
  };

  const deleteYardageRow = async (rowId: number) => {
    if (!window.confirm("Delete this yardage record?")) return;
    try {
      await axios.delete(`/yardage-moq/${rowId}`);
      showToast("Yardage record deleted", "info");
      await fetchAll();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Delete failed", "error");
    }
  };

  // ─── SAVE: P3 — Price List ────────────────────────────────────────────────
  const addPriceRow = async () => {
    if (!requestInfo) return;
    setSave("p3", "saving");
    try {
      const np    = newPrice;
      await axios.post(`/price-lists`, {
        sample_request_id:   requestInfo.id,
        fabric_code:         np.fabric_code    || requestInfo.fabric_code,
        fabric_quality:      np.fabric_quality || requestInfo.fabric_quality,
        color:               np.color          || requestInfo.color,
        list_type:           np.list_type,
        min_quantity_meters: np.min_quantity_meters,
        max_quantity_meters: np.max_quantity_meters,
        price_per_meter:     np.price_per_meter,
        discount_percent:    np.discount_percent,
        currency:            np.currency,
        remarks:             np.remarks,
      });
      afterSave("p3", "Price entry added!");
      setNewPrice(emptyPrice());
      setAddingPrice(false);
      await fetchAll();
    } catch (err) { onError("p3", err); }
  };

  const updatePriceRow = async () => {
    if (!editPriceForm) return;
    setSave("p3", "saving");
    try {
      const ep    = editPriceForm;
      const total = calcTotal(ep.min_quantity_meters, ep.price_per_meter);
      const final = calcFinal(total, ep.discount_percent);
      await axios.put(`/price-lists/${ep.id}`, {
        fabric_code:         ep.fabric_code,
        fabric_quality:      ep.fabric_quality,
        color:               ep.color,
        list_type:           ep.list_type,
        min_quantity_meters: ep.min_quantity_meters,
        max_quantity_meters: ep.max_quantity_meters,
        price_per_meter:     ep.price_per_meter,
        discount_percent:    ep.discount_percent,
        total_price:         total,
        final_price:         final,
        currency:            ep.currency,
        remarks:             ep.remarks,
      });
      afterSave("p3", "Price entry updated!");
      setEditPriceId(null);
      setEditPriceForm(null);
      await fetchAll();
    } catch (err) { onError("p3", err); }
  };

  const deletePriceRow = async (rowId: number) => {
    if (!window.confirm("Delete this price entry?")) return;
    try {
      await axios.delete(`/price-lists/${rowId}`);
      showToast("Price entry deleted", "info");
      await fetchAll();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Delete failed", "error");
    }
  };

  // ─── Chat send ────────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatTxt.trim()) return;
    const msg = chatTxt.trim();
    setChatTxt("");
    setChatSending(true);
    try {
      await axios.post(`/development-process/${id}/chat`, { sender: "admin", message: msg });
      const res = await axios.get(`/development-process/${id}/chat`);
      setChatMessages(Array.isArray(res.data) ? res.data : []);
    } catch {
      showToast("Message failed to send", "error");
    } finally {
      setChatSending(false);
    }
  };

  // ─── Loading / Error states ───────────────────────────────────────────────

  if (loading) return (
    <div className="dp-loading">
      <div className="dp-spinner" />
      <span>Loading pipeline…</span>
      <DPStyles />
    </div>
  );

  if (!requestInfo) return (
    <div className="dp-notfound">
      <p>{fetchErr || "Record not found."}</p>
      <button className="dp-backbtn" onClick={() => navigate(-1)}>← Go Back</button>
      <DPStyles />
    </div>
  );

  const ri = requestInfo;

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <DPStyles />
      <div className="dp-root">

        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* ── Topbar ── */}
        <div className="dp-topbar">
          <div className="dp-crumbs">
            <span className="dp-crumb" onClick={() => navigate("/admin/development")}>
              Development
            </span>
            <span className="dp-sep">›</span>
            <span className="dp-crumb-cur">Edit · {ri.request_code}</span>
          </div>
          <button className="dp-backbtn" onClick={() => navigate(-1)}>← Back</button>
        </div>

        {fetchErr && <div className="dp-fetcherr">⚠ {fetchErr}</div>}

        {/* ── Header card ── */}
        <div className="dp-header-card">
          <div className="dp-header-icon">🧵</div>
          <div className="dp-header-main">
            <div className="dp-header-code">{ri.request_code}</div>
            <div className="dp-header-name">{ri.customer_name || "—"}</div>
            <div className="dp-header-agent">{ri.agent_name}</div>
            <div className="dp-header-badges">
              {ri.sample_type && <span className="dp-badge dp-badge-type">{ri.sample_type}</span>}
              {ri.status      && <span className="dp-badge dp-badge-status">{ri.status}</span>}
            </div>
          </div>
          <div className="dp-header-meta">
            <div><label>Fabric Code</label><p>{ri.fabric_code    || "—"}</p></div>
            <div><label>Quality</label>    <p>{ri.fabric_quality || "—"}</p></div>
            <div><label>Color</label>      <p>{ri.color          || "—"}</p></div>
            <div><label>Qty (m)</label>    <p>{ri.quantity_meters || "—"}</p></div>
          </div>
        </div>

        {/* ── Pipeline Tabs ── */}
        <div className="dp-pipeline-wrap">
          <div className="dp-pipeline">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                className={`dp-step${activeStep === s.id ? " dp-step-act" : ""}`}
                style={{ "--sa": s.accent } as React.CSSProperties}
                onClick={() => setActiveStep(s.id)}
              >
                {i > 0 && <span className="dp-arrow">›</span>}
                <span className="dp-step-icon">{s.icon}</span>
                <span className="dp-step-label">{s.label}</span>
                <span className="dp-step-sub">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Panel content ── */}
        <div className="dp-panel">

          {/* ═══ P0 — Request Info ═══════════════════════════════════ */}
          {activeStep === "p0" && (
            <div>
              <PanelHeader icon="📋" title="Request Information" sub="sample_requests" accent="#475569">
                <SaveBtn state={saveStates.p0} onClick={saveRequestInfo} />
              </PanelHeader>
              <div className="dp-grid">
                <Field label="Request Code" value={ri.request_code} readOnly />
                <Select
                  label="Status" value={ri.status}
                  onChange={(v) => setRequestInfo({ ...ri, status: v })}
                  options={[
                    { label: "— Select —",  value: "" },
                    { label: "Pending",     value: "Pending" },
                    { label: "Collected",   value: "Collected" },
                    { label: "In Progress", value: "In Progress" },
                    { label: "Approved",    value: "Approved" },
                    { label: "Rejected",    value: "Rejected" },
                  ]}
                />
                <Field label="Customer Name" value={ri.customer_name} required
                  onChange={(v) => setRequestInfo({ ...ri, customer_name: v })} />
                <Field label="Agent / Contact" value={ri.agent_name}
                  onChange={(v) => setRequestInfo({ ...ri, agent_name: v })} />
                <Select
                  label="Sample Type" value={ri.sample_type}
                  onChange={(v) => setRequestInfo({ ...ri, sample_type: v })}
                  options={[
                    { label: "— Select —", value: "" },
                    { label: "WhatsApp",   value: "WhatsApp" },
                    { label: "Parcel",     value: "Parcel" },
                    { label: "Email",      value: "Email" },
                    { label: "Courier",    value: "Courier" },
                    { label: "Walk-in",    value: "Walk-in" },
                  ]}
                />
                <Field label="Fabric Code" value={ri.fabric_code} required
                  onChange={(v) => setRequestInfo({ ...ri, fabric_code: v })} />
                <Field label="Fabric Quality" value={ri.fabric_quality}
                  onChange={(v) => setRequestInfo({ ...ri, fabric_quality: v })} />
                <Field label="Color" value={ri.color}
                  onChange={(v) => setRequestInfo({ ...ri, color: v })} />
                <Field label="Qty (Meters)" value={ri.quantity_meters} type="number"
                  onChange={(v) => setRequestInfo({ ...ri, quantity_meters: v })} />
                <Textarea label="Customer Comments" value={ri.customer_comments} wide
                  onChange={(v) => setRequestInfo({ ...ri, customer_comments: v })} />
              </div>
            </div>
          )}

          {/* ═══ P1 — Dev Analysis ═══════════════════════════════════ */}
          {activeStep === "p1" && (
            <div>
              <PanelHeader icon="🔬" title="Development Analysis" sub="development_analysis" accent="#6366f1">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {devAnalysis.id && (
                    <DeleteBtn onClick={deleteDevAnalysis} label="Delete Record" />
                  )}
                  <span className="dp-exists-badge">
                    {devAnalysis.id ? "✓ Existing record" : "+ New record"}
                  </span>
                  <SaveBtn state={saveStates.p1} onClick={saveDevAnalysis} />
                </div>
              </PanelHeader>

              {devAnalysis.id && (
                <div className="dp-summary-bar">
                  <span>ID #{devAnalysis.id}</span>
                  {devAnalysis.analyzed_by && <span>By: <b>{devAnalysis.analyzed_by}</b></span>}
                  {devAnalysis.gsm         && <span>GSM: <b>{devAnalysis.gsm}</b></span>}
          
                  {devAnalysis.blend       && <span>Blend: <b>{devAnalysis.blend}</b></span>}
                  {devAnalysis.weave_type  && <span>Weave: <b>{devAnalysis.weave_type}</b></span>}
                </div>
              )}

              <div className="dp-grid">
            
                <Field label="Style Number" value={devAnalysis.style_number}
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, style_number: v })} />
                <Field label="Construction" value={devAnalysis.construction}
                  placeholder="e.g. 2/1 Twill"
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, construction: v })} />
                <Field label="Blend" value={devAnalysis.blend}
                  placeholder="e.g. 60% Cotton 40% Poly"
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, blend: v })} />
                <Field label="GSM" value={devAnalysis.gsm} type="number"
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, gsm: v })} />
                <Field label="Weave Type" value={devAnalysis.weave_type}
                  placeholder="e.g. Plain, Twill, Satin"
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, weave_type: v })} />
                <Field label="Analyzed By" value={devAnalysis.analyzed_by}
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, analyzed_by: v })} />
                <Field label="Analysis Date" value={devAnalysis.analysis_date} type="date"
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, analysis_date: v })} />
                <Textarea label="Remarks" value={devAnalysis.remarks} wide
                  onChange={(v) => setDevAnalysis({ ...devAnalysis, remarks: v })} />
              </div>
            </div>
          )}

          {/* ═══ P2 — Yardage & MOQ ══════════════════════════════════ */}
          {activeStep === "p2" && (
            <div>
              <PanelHeader icon="📦" title="Yardage & MOQ" sub="yardage_moq_price" accent="#f59e0b">
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="dp-addbtn"
                    onClick={() => { setAddingYardage(true); setEditYardageId(null); }}>
                    + Add Row
                  </button>
                </div>
              </PanelHeader>

              {/* Existing rows table */}
              {yardageRows.length > 0 && (
                <div className="dp-table-wrap">
                  <div className="dp-table-title">
                    📋 {yardageRows.length} Saved Record{yardageRows.length > 1 ? "s" : ""}
                  </div>
                  <table className="dp-table">
                    <thead>
                      <tr>
                        {["Type","MOQ (m)","MOQ (yd)","Price/m","Price/yd","Currency","Valid From","Valid Until","Actions"].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yardageRows.map((row) => (
                        <tr key={row.id} className={editYardageId === row.id ? "dp-tr-editing" : ""}>
                          {editYardageId === row.id && editYardageForm ? (
                            <>
                              <td>
                                <select className="dp-inline-sel" value={editYardageForm.order_type}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, order_type: e.target.value })}>
                                  <option value="sample">Sample</option>
                                  <option value="bulk">Bulk</option>
                                </select>
                              </td>
                              <td>
                                <input className="dp-inline-in" type="number" value={editYardageForm.moq_meters}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, moq_meters: e.target.value })} />
                              </td>
                              <td className="dp-auto">{calcYards(editYardageForm.moq_meters)}</td>
                              <td>
                                <input className="dp-inline-in" type="number" value={editYardageForm.price_per_meter}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, price_per_meter: e.target.value })} />
                              </td>
                              <td className="dp-auto">{calcPriceYard(editYardageForm.price_per_meter)}</td>
                              <td>
                                <select className="dp-inline-sel" value={editYardageForm.currency}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, currency: e.target.value })}>
                                  {["INR","USD","EUR","GBP"].map(c => <option key={c}>{c}</option>)}
                                </select>
                              </td>
                              <td>
                                <input className="dp-inline-in" type="date" value={editYardageForm.valid_from}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, valid_from: e.target.value })} />
                              </td>
                              <td>
                                <input className="dp-inline-in" type="date" value={editYardageForm.valid_until}
                                  onChange={(e) => setEditYardageForm({ ...editYardageForm, valid_until: e.target.value })} />
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button className="dp-save-inline" onClick={updateYardageRow}>✓ Save</button>
                                  <button className="dp-cancel-inline" onClick={() => {
                                    setEditYardageId(null); setEditYardageForm(null);
                                  }}>✕</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td><span className={`dp-type-badge ${row.order_type}`}>{row.order_type}</span></td>
                              <td><b>{row.moq_meters}</b></td>
                              <td className="dp-muted">{calcYards(row.moq_meters)}</td>
                              <td>{row.price_per_meter}</td>
                              <td className="dp-muted">{calcPriceYard(row.price_per_meter)}</td>
                              <td>{row.currency}</td>
                              <td>{row.valid_from  || "—"}</td>
                              <td>{row.valid_until || "—"}</td>
                              <td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button className="dp-edit-inline" onClick={() => {
                                    setEditYardageId(row.id);
                                    setEditYardageForm({ ...row });
                                    setAddingYardage(false);
                                  }}>✏ Edit</button>
                                  <button className="dp-del-inline" onClick={() => deleteYardageRow(row.id)}>🗑</button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new yardage row form */}
              {(addingYardage || yardageRows.length === 0) && !editYardageId && (
                <div className="dp-add-form">
                  <div className="dp-add-form-title">
                    {yardageRows.length === 0 ? "Add First Yardage Record" : "+ Add New Row"}
                  </div>
                  <div className="dp-grid">
                    <Select label="Order Type" value={newYardage.order_type}
                      onChange={(v) => setNewYardage({ ...newYardage, order_type: v })}
                      options={[
                        { label: "Sample", value: "sample" },
                        { label: "Bulk",   value: "bulk" },
                      ]} />
                    <Select label="Currency" value={newYardage.currency}
                      onChange={(v) => setNewYardage({ ...newYardage, currency: v })}
                      options={["INR","USD","EUR","GBP"].map(c => ({ label: c, value: c }))} />
                    <Field label="MOQ (Meters)" value={newYardage.moq_meters} type="number" required
                      onChange={(v) => setNewYardage({ ...newYardage, moq_meters: v })} />
                    <Field label="MOQ (Yards) — auto" value={calcYards(newYardage.moq_meters)} readOnly />
                    <Field label={`Price / Meter (${newYardage.currency})`} value={newYardage.price_per_meter} type="number"
                      onChange={(v) => setNewYardage({ ...newYardage, price_per_meter: v })} />
                    <Field label="Price / Yard — auto" value={calcPriceYard(newYardage.price_per_meter)} readOnly />
                    <Field label="Valid From" value={newYardage.valid_from} type="date"
                      onChange={(v) => setNewYardage({ ...newYardage, valid_from: v })} />
                    <Field label="Valid Until" value={newYardage.valid_until} type="date"
                      onChange={(v) => setNewYardage({ ...newYardage, valid_until: v })} />
                  </div>

                  {newYardage.moq_meters && newYardage.price_per_meter && (
                    <div className="dp-conv-card">
                      <div className="dp-conv-row">
                        <div className="dp-conv-item">
                          <div className="dp-conv-label">MOQ Meters</div>
                          <div className="dp-conv-val">{newYardage.moq_meters} m</div>
                        </div>
                        <div className="dp-conv-arrow">⇄</div>
                        <div className="dp-conv-item">
                          <div className="dp-conv-label">MOQ Yards</div>
                          <div className="dp-conv-val">{calcYards(newYardage.moq_meters)} yd</div>
                        </div>
                      </div>
                      <div className="dp-conv-total">
                        Total MOQ Value: <b>{newYardage.currency} {toFixed2(
                          (parseFloat(newYardage.moq_meters) || 0) *
                          (parseFloat(newYardage.price_per_meter) || 0)
                        )}</b>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <SaveBtn state={saveStates.p2} onClick={addYardageRow} label="✓ Save Yardage Row" />
                    {yardageRows.length > 0 && (
                      <button className="dp-cancel-btn" onClick={() => setAddingYardage(false)}>Cancel</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ P3 — Price List ═════════════════════════════════════ */}
          {activeStep === "p3" && (
            <div>
              <PanelHeader icon="🏷️" title="Price List" sub="fabric_price_list" accent="#10b981">
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="dp-addbtn"
                    onClick={() => { setAddingPrice(true); setEditPriceId(null); }}>
                    + Add Entry
                  </button>
                </div>
              </PanelHeader>

              {priceRows.length > 0 && (
                <div className="dp-table-wrap">
                  <div className="dp-table-title">
                    🏷️ {priceRows.length} Saved Entr{priceRows.length > 1 ? "ies" : "y"}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="dp-table">
                      <thead>
                        <tr>
                          {["Type","Qty Range","Price/m","Discount","Total","Final","Currency","Remarks","Actions"].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {priceRows.map((row) => (
                          <tr key={row.id} className={editPriceId === row.id ? "dp-tr-editing" : ""}>
                            {editPriceId === row.id && editPriceForm ? (
                              <>
                                <td>
                                  <select className="dp-inline-sel" value={editPriceForm.list_type}
                                    onChange={(e) => setEditPriceForm({ ...editPriceForm, list_type: e.target.value })}>
                                    <option value="sample_meter">🧵 Sample</option>
                                    <option value="bulk_order">📦 Bulk</option>
                                  </select>
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                                    <input className="dp-inline-in" style={{ width: 54 }} type="number"
                                      value={editPriceForm.min_quantity_meters}
                                      onChange={(e) => setEditPriceForm({ ...editPriceForm, min_quantity_meters: e.target.value })} />
                                    <span>–</span>
                                    <input className="dp-inline-in" style={{ width: 54 }} type="number"
                                      value={editPriceForm.max_quantity_meters} placeholder="∞"
                                      onChange={(e) => setEditPriceForm({ ...editPriceForm, max_quantity_meters: e.target.value })} />
                                  </div>
                                </td>
                                <td>
                                  <input className="dp-inline-in" style={{ width: 70 }} type="number"
                                    value={editPriceForm.price_per_meter}
                                    onChange={(e) => setEditPriceForm({ ...editPriceForm, price_per_meter: e.target.value })} />
                                </td>
                                <td>
                                  <input className="dp-inline-in" style={{ width: 56 }} type="number"
                                    value={editPriceForm.discount_percent}
                                    onChange={(e) => setEditPriceForm({ ...editPriceForm, discount_percent: e.target.value })} />
                                  <span style={{ fontSize: 11, marginLeft: 2 }}>%</span>
                                </td>
                                <td className="dp-auto">
                                  {calcTotal(editPriceForm.min_quantity_meters, editPriceForm.price_per_meter)}
                                </td>
                                <td className="dp-final">
                                  {calcFinal(calcTotal(editPriceForm.min_quantity_meters, editPriceForm.price_per_meter), editPriceForm.discount_percent)}
                                </td>
                                <td>
                                  <select className="dp-inline-sel" value={editPriceForm.currency}
                                    onChange={(e) => setEditPriceForm({ ...editPriceForm, currency: e.target.value })}>
                                    {["INR","USD","EUR","GBP"].map(c => <option key={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <input className="dp-inline-in" style={{ width: 80 }}
                                    value={editPriceForm.remarks} placeholder="Notes"
                                    onChange={(e) => setEditPriceForm({ ...editPriceForm, remarks: e.target.value })} />
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button className="dp-save-inline" onClick={updatePriceRow}>✓</button>
                                    <button className="dp-cancel-inline" onClick={() => {
                                      setEditPriceId(null); setEditPriceForm(null);
                                    }}>✕</button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <span className={`dp-type-badge ${row.list_type}`}>
                                    {row.list_type === "bulk_order" ? "📦 Bulk" : "🧵 Sample"}
                                  </span>
                                </td>
                                <td>{row.min_quantity_meters}–{row.max_quantity_meters || "∞"} m</td>
                                <td>{row.price_per_meter}</td>
                                <td>{row.discount_percent}%</td>
                                <td className="dp-muted">{row.total_price}</td>
                                <td className="dp-final"><b>{row.final_price}</b></td>
                                <td>{row.currency}</td>
                                <td className="dp-muted">{row.remarks || "—"}</td>
                                <td>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button className="dp-edit-inline" onClick={() => {
                                      setEditPriceId(row.id);
                                      setEditPriceForm({ ...row });
                                      setAddingPrice(false);
                                    }}>✏</button>
                                    <button className="dp-del-inline" onClick={() => deletePriceRow(row.id)}>🗑</button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(addingPrice || priceRows.length === 0) && !editPriceId && (
                <div className="dp-add-form">
                  <div className="dp-add-form-title">
                    {priceRows.length === 0 ? "Add First Price Entry" : "+ New Price Entry"}
                  </div>
                  <div className="dp-grid">
                    <Select label="List Type" value={newPrice.list_type}
                      onChange={(v) => setNewPrice({ ...newPrice, list_type: v })}
                      options={[
                        { label: "Sample Meter", value: "sample_meter" },
                        { label: "Bulk Order",   value: "bulk_order" },
                      ]} />
                    <Select label="Currency" value={newPrice.currency}
                      onChange={(v) => setNewPrice({ ...newPrice, currency: v })}
                      options={["INR","USD","EUR","GBP"].map(c => ({ label: c, value: c }))} />
                    <Field label="Min Qty (m)" value={newPrice.min_quantity_meters} type="number"
                      onChange={(v) => setNewPrice({ ...newPrice, min_quantity_meters: v })} />
                    <Field label="Max Qty (m)" value={newPrice.max_quantity_meters} type="number"
                      placeholder="Leave blank for ∞"
                      onChange={(v) => setNewPrice({ ...newPrice, max_quantity_meters: v })} />
                    <Field label="Price / Meter" value={newPrice.price_per_meter} type="number" required
                      onChange={(v) => setNewPrice({ ...newPrice, price_per_meter: v })} />
                    <Field label="Discount (%)" value={newPrice.discount_percent} type="number"
                      onChange={(v) => setNewPrice({ ...newPrice, discount_percent: v })} />
                    <Field label="Total (auto)"
                      value={calcTotal(newPrice.min_quantity_meters, newPrice.price_per_meter)} readOnly />
                    <Field label="Final (auto)"
                      value={calcFinal(calcTotal(newPrice.min_quantity_meters, newPrice.price_per_meter), newPrice.discount_percent)} readOnly />
                    <Textarea label="Remarks" value={newPrice.remarks} wide
                      onChange={(v) => setNewPrice({ ...newPrice, remarks: v })} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <SaveBtn state={saveStates.p3} onClick={addPriceRow} label="✓ Save Price Entry" />
                    {priceRows.length > 0 && (
                      <button className="dp-cancel-btn" onClick={() => setAddingPrice(false)}>Cancel</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ P4 — Chat ═══════════════════════════════════════════ */}
          {activeStep === "p4" && (
            <div>
              <PanelHeader icon="💬" title="Chat" sub="chat_messages" accent="#8b5cf6">
                <span className="dp-chat-count">
                  {chatMessages.length} msg{chatMessages.length !== 1 ? "s" : ""}
                </span>
              </PanelHeader>
              <div className="dp-chatbox">
                {chatMessages.length === 0 && (
                  <div className="dp-chat-empty">
                    <span>💬</span>
                    <p>No messages yet — start the conversation.</p>
                  </div>
                )}
                {chatMessages.map((m) => (
                  <div key={m.id} className={`dp-bubble dp-bubble-${m.sender}`}>
                    <div className="dp-bubble-meta">
                      <span className="dp-bubble-sender">
                        {m.sender === "admin" ? "Admin" : m.sender === "bot" ? "Bot" : "User"}
                      </span>
                      <span className="dp-bubble-time">{m.created_at}</span>
                      {!m.is_read && m.sender !== "admin" && (
                        <span className="dp-unread">New</span>
                      )}
                    </div>
                    <p className="dp-bubble-msg">{m.message}</p>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <div className="dp-chat-input-row">
                <input
                  className="dp-chat-input"
                  placeholder="Type a message and press Enter…"
                  value={chatTxt}
                  onChange={(e) => setChatTxt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                  disabled={chatSending}
                />
                <button
                  className="dp-chat-send"
                  onClick={sendChat}
                  disabled={chatSending || !chatTxt.trim()}
                >
                  {chatSending ? "…" : "Send ↑"}
                </button>
              </div>
            </div>
          )}

        </div>{/* end dp-panel */}
      </div>{/* end dp-root */}
    </>
  );
}

// ─── Panel Header ─────────────────────────────────────────────────────────────

function PanelHeader({
  icon, title, sub, accent, children,
}: {
  icon: string; title: string; sub: string; accent: string; children?: React.ReactNode;
}) {
  return (
    <div className="dp-panel-header" style={{ "--paccent": accent } as React.CSSProperties}>
      <div className="dp-panel-hd-left">
        <span className="dp-panel-icon">{icon}</span>
        <div>
          <p className="dp-panel-title">{title}</p>
          <p className="dp-panel-sub"><code>{sub}</code></p>
        </div>
      </div>
      <div className="dp-panel-hd-right">{children}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function DPStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      @keyframes dp-spin    { to { transform: rotate(360deg); } }
      @keyframes dp-slidein { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }
      @keyframes dp-toastin { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:none; } }

      :root {
        --dp-bg:     #f0f2f5;
        --dp-white:  #ffffff;
        --dp-border: #e2e8f0;
        --dp-text:   #1e293b;
        --dp-muted:  #64748b;
        --dp-faint:  #94a3b8;
        --dp-indigo: #6366f1;
        --dp-radius: 12px;
        --dp-shadow: 0 1px 6px rgba(0,0,0,0.07);
      }

      .dp-root {
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        background: var(--dp-bg); min-height: 100vh;
        padding: 24px; color: var(--dp-text);
      }

      .dp-loading {
        display: flex; align-items: center; justify-content: center; gap: 14px;
        height: 60vh; color: var(--dp-indigo); font-size: 15px; font-weight: 600;
      }
      .dp-spinner {
        width: 22px; height: 22px; border-radius: 50%;
        border: 3px solid #e0e7ff; border-top-color: var(--dp-indigo);
        animation: dp-spin .8s linear infinite;
      }
      .dp-notfound { text-align: center; padding: 60px 24px; }
      .dp-notfound p { color: #dc2626; margin-bottom: 18px; }

      .dp-topbar {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 18px; gap: 12px; flex-wrap: wrap;
      }
      .dp-crumbs { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dp-faint); }
      .dp-crumb  { cursor: pointer; transition: color .15s; }
      .dp-crumb:hover { color: var(--dp-indigo); }
      .dp-sep      { color: #cbd5e1; }
      .dp-crumb-cur { color: var(--dp-text); font-weight: 700; }
      .dp-backbtn {
        padding: 8px 18px; border-radius: 8px; border: 1.5px solid var(--dp-border);
        background: var(--dp-white); color: var(--dp-muted);
        font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s;
      }
      .dp-backbtn:hover { background: #f8fafc; }

      .dp-fetcherr {
        background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;
        border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 600;
        margin-bottom: 16px;
      }

      .dp-header-card {
        background: var(--dp-white); border-radius: var(--dp-radius);
        border: 1px solid var(--dp-border); padding: 18px 22px;
        display: flex; align-items: center; gap: 18px;
        margin-bottom: 18px; flex-wrap: wrap; box-shadow: var(--dp-shadow);
      }
      .dp-header-icon {
        width: 56px; height: 56px; border-radius: 14px; background: #ede9fe;
        display: flex; align-items: center; justify-content: center;
        font-size: 28px; flex-shrink: 0;
      }
      .dp-header-main  { flex: 1; min-width: 160px; }
      .dp-header-code  { font-size: 11px; font-weight: 800; color: var(--dp-indigo); letter-spacing: .6px; }
      .dp-header-name  { font-size: 20px; font-weight: 800; color: var(--dp-text); }
      .dp-header-agent { font-size: 13px; color: var(--dp-muted); }
      .dp-header-badges { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
      .dp-badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
      .dp-badge-type   { background: #ede9fe; color: #7c3aed; }
      .dp-badge-status { background: #dcfce7; color: #15803d; }
      .dp-header-meta {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(90px,1fr));
        gap: 14px; flex: 1;
      }
      .dp-header-meta label { font-size: 10px; color: var(--dp-faint); text-transform: uppercase; letter-spacing: .6px; display: block; }
      .dp-header-meta p     { font-size: 14px; font-weight: 700; color: var(--dp-text); margin-top: 2px; }

      .dp-pipeline-wrap { overflow-x: auto; }
      .dp-pipeline {
        display: flex; background: var(--dp-white);
        border-radius: var(--dp-radius) var(--dp-radius) 0 0;
        border: 1px solid var(--dp-border); border-bottom: none;
        min-width: max-content; width: 100%;
      }
      .dp-step {
        flex: 1; min-width: 110px;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 13px 8px; border: none; background: transparent;
        cursor: pointer; position: relative;
        border-bottom: 3px solid transparent; transition: all .2s;
      }
      .dp-step:hover { background: #f8fafc; }
      .dp-step.dp-step-act { background: #fafbff; border-bottom-color: var(--sa); }
      .dp-step-icon  { font-size: 18px; }
      .dp-step-label { font-size: 11px; font-weight: 700; color: var(--dp-faint); text-align: center; }
      .dp-step.dp-step-act .dp-step-label { color: var(--dp-text); }
      .dp-step-sub   { font-size: 9px; color: #cbd5e1; font-weight: 500; }
      .dp-step.dp-step-act .dp-step-sub { color: var(--sa); }
      .dp-arrow {
        position: absolute; left: 0; top: 50%; transform: translateY(-60%);
        color: #ddd; font-size: 16px; pointer-events: none;
      }

      .dp-panel {
        background: var(--dp-white); border: 1px solid var(--dp-border);
        border-radius: 0 0 var(--dp-radius) var(--dp-radius);
        padding: 26px; animation: dp-slidein .22s ease;
      }

      .dp-panel-header {
        display: flex; align-items: flex-start; justify-content: space-between;
        margin-bottom: 22px; padding-bottom: 16px;
        border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; gap: 12px;
      }
      .dp-panel-hd-left  { display: flex; align-items: center; gap: 12px; }
      .dp-panel-hd-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .dp-panel-icon {
        width: 40px; height: 40px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; background: #f1f5f9; flex-shrink: 0;
      }
      .dp-panel-title { font-size: 15px; font-weight: 800; color: var(--dp-text); }
      .dp-panel-sub   { font-size: 11px; color: var(--dp-faint); margin-top: 1px; }
      .dp-panel-sub code {
        background: #f1f5f9; padding: 1px 5px; border-radius: 4px;
        font-size: 10px; color: var(--dp-indigo); font-weight: 700;
      }

      .dp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
      .dp-field { display: flex; flex-direction: column; gap: 4px; }
      .dp-wide  { grid-column: 1 / -1; }
      .dp-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .5px; }
      .dp-req   { color: #ef4444; margin-left: 2px; }
      .dp-input {
        padding: 9px 11px; border: 1.5px solid var(--dp-border); border-radius: 8px;
        font-size: 14px; color: var(--dp-text); background: var(--dp-white);
        outline: none; width: 100%; transition: border-color .15s, box-shadow .15s;
        font-family: inherit;
      }
      .dp-input:focus { border-color: var(--dp-indigo); box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
      .dp-ro  { background: #f8fafc; color: var(--dp-faint); cursor: not-allowed; }
      .dp-sel { cursor: pointer; }
      .dp-ta {
        padding: 9px 11px; border: 1.5px solid var(--dp-border); border-radius: 8px;
        font-size: 14px; color: var(--dp-text); background: var(--dp-white);
        outline: none; width: 100%; resize: vertical; min-height: 80px;
        font-family: inherit; transition: border-color .15s;
      }
      .dp-ta:focus { border-color: var(--dp-indigo); }

      .dp-savebtn {
        padding: 9px 20px; border-radius: 9px; border: none; font-size: 13px;
        font-weight: 700; cursor: pointer; display: inline-flex; align-items: center;
        gap: 8px; flex-shrink: 0; transition: all .2s; white-space: nowrap;
      }
      .dp-savebtn.s-idle   { background: var(--dp-indigo); color: #fff; }
      .dp-savebtn.s-idle:hover { background: #4f46e5; }
      .dp-savebtn.s-saving { background: #94a3b8; color: #fff; cursor: not-allowed; }
      .dp-savebtn.s-saved  { background: #10b981; color: #fff; }
      .dp-savebtn.s-error  { background: #ef4444; color: #fff; }
      .dp-spin {
        width: 13px; height: 13px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
        animation: dp-spin .7s linear infinite; flex-shrink: 0;
      }

      .dp-delbtn {
        padding: 9px 16px; border-radius: 9px; border: 1.5px solid #fca5a5;
        background: #fff; color: #dc2626; font-size: 13px; font-weight: 700;
        cursor: pointer; transition: all .15s; white-space: nowrap;
      }
      .dp-delbtn:hover    { background: #fee2e2; }
      .dp-delbtn:disabled { opacity: .5; cursor: not-allowed; }
      .dp-addbtn {
        padding: 9px 16px; border-radius: 9px; border: 1.5px dashed #94a3b8;
        background: #f8fafc; color: var(--dp-muted); font-size: 13px; font-weight: 700;
        cursor: pointer; transition: all .15s;
      }
      .dp-addbtn:hover { background: #f1f5f9; border-color: var(--dp-indigo); color: var(--dp-indigo); }
      .dp-cancel-btn {
        padding: 9px 16px; border-radius: 9px; border: 1.5px solid var(--dp-border);
        background: #fff; color: var(--dp-muted); font-size: 13px; font-weight: 600; cursor: pointer;
      }

      .dp-exists-badge {
        font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;
        background: #dbeafe; color: #1d4ed8;
      }

      .dp-summary-bar {
        display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
        background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 9px;
        padding: 10px 14px; margin-bottom: 18px; font-size: 13px; color: #374151;
      }
      .dp-summary-bar span { display: flex; align-items: center; gap: 4px; }
      .dp-pass { color: #16a34a; font-weight: 700; }
      .dp-fail { color: #dc2626; font-weight: 700; }

      .dp-table-wrap { border-radius: 10px; border: 1px solid var(--dp-border); overflow: hidden; margin-bottom: 20px; }
      .dp-table-title {
        padding: 10px 14px; background: #f8fafc;
        font-size: 11px; font-weight: 700; color: #374151;
        text-transform: uppercase; letter-spacing: .5px;
        border-bottom: 1px solid var(--dp-border);
      }
      .dp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .dp-table th {
        padding: 9px 11px; background: #f8fafc; text-align: left;
        font-size: 10px; font-weight: 700; color: var(--dp-faint);
        text-transform: uppercase; letter-spacing: .5px;
        border-bottom: 1px solid var(--dp-border); white-space: nowrap;
      }
      .dp-table td { padding: 10px 11px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
      .dp-table tr:last-child td { border-bottom: none; }
      .dp-tr-editing { background: #faf5ff; }
      .dp-muted { color: var(--dp-muted); }
      .dp-auto  { color: #92400e; font-style: italic; }
      .dp-final { color: #10b981; font-weight: 700; }

      .dp-type-badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
      .dp-type-badge.sample, .dp-type-badge.sample_meter { background: #dcfce7; color: #15803d; }
      .dp-type-badge.bulk,   .dp-type-badge.bulk_order   { background: #dbeafe; color: #1d4ed8; }

      .dp-inline-in {
        padding: 4px 7px; border: 1.5px solid var(--dp-border); border-radius: 6px;
        font-size: 12px; outline: none; font-family: inherit; width: 100%;
      }
      .dp-inline-in:focus { border-color: var(--dp-indigo); }
      .dp-inline-sel { padding: 4px 7px; border: 1.5px solid var(--dp-border); border-radius: 6px; font-size: 12px; cursor: pointer; }
      .dp-save-inline   { padding: 4px 10px; border-radius: 6px; border: none; background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; cursor: pointer; }
      .dp-cancel-inline { padding: 4px 10px; border-radius: 6px; border: none; background: #f1f5f9; color: var(--dp-muted); font-weight: 700; font-size: 12px; cursor: pointer; }
      .dp-edit-inline   { padding: 4px 10px; border-radius: 6px; border: none; background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 12px; cursor: pointer; }
      .dp-del-inline    { padding: 4px 8px;  border-radius: 6px; border: none; background: #fee2e2; color: #dc2626; font-size: 13px; cursor: pointer; }

      .dp-add-form { background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin-top: 4px; }
      .dp-add-form-title { font-size: 12px; font-weight: 700; color: var(--dp-indigo); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 14px; }

      .dp-conv-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin-top: 14px; }
      .dp-conv-row  { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 10px; }
      .dp-conv-item { text-align: center; }
      .dp-conv-label { font-size: 10px; color: #92400e; font-weight: 700; text-transform: uppercase; }
      .dp-conv-val   { font-size: 20px; font-weight: 800; color: #78350f; }
      .dp-conv-arrow { font-size: 20px; color: #d97706; }
      .dp-conv-total { text-align: center; font-size: 14px; color: #78350f; }

      .dp-chat-count { font-size: 12px; font-weight: 700; background: #f1f5f9; color: var(--dp-muted); padding: 4px 10px; border-radius: 20px; }
      .dp-chatbox {
        background: #f8fafc; border: 1px solid var(--dp-border); border-radius: 10px;
        padding: 16px; min-height: 220px; max-height: 420px; overflow-y: auto;
        display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;
      }
      .dp-chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; margin: auto; color: var(--dp-faint); font-size: 13px; }
      .dp-chat-empty span { font-size: 32px; }
      .dp-bubble { max-width: 70%; padding: 10px 14px; border-radius: 12px; }
      .dp-bubble-admin { background: #ede9fe; align-self: flex-end;  border-bottom-right-radius: 3px; }
      .dp-bubble-user  { background: #fff; border: 1px solid var(--dp-border); align-self: flex-start; border-bottom-left-radius: 3px; }
      .dp-bubble-bot   { background: #fef3c7; align-self: flex-start; border-bottom-left-radius: 3px; }
      .dp-bubble-meta  { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; flex-wrap: wrap; }
      .dp-bubble-sender { font-size: 11px; font-weight: 700; color: #475569; }
      .dp-bubble-time   { font-size: 10px; color: var(--dp-faint); }
      .dp-unread        { font-size: 9px; font-weight: 800; background: #ef4444; color: #fff; padding: 1px 6px; border-radius: 10px; }
      .dp-bubble-msg    { font-size: 13px; color: var(--dp-text); line-height: 1.5; }
      .dp-chat-input-row { display: flex; gap: 10px; }
      .dp-chat-input {
        flex: 1; padding: 10px 13px; border: 1.5px solid var(--dp-border);
        border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; transition: border-color .15s;
      }
      .dp-chat-input:focus { border-color: var(--dp-indigo); }
      .dp-chat-send {
        padding: 10px 20px; background: var(--dp-indigo); color: #fff;
        border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
        cursor: pointer; transition: background .15s;
      }
      .dp-chat-send:hover:not(:disabled) { background: #4f46e5; }
      .dp-chat-send:disabled { background: #c7d2fe; cursor: not-allowed; }

      .dp-toast {
        position: fixed; top: 22px; right: 22px; z-index: 9999;
        padding: 13px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
        box-shadow: 0 8px 28px rgba(0,0,0,0.16); animation: dp-toastin .25s ease;
      }
      .dp-toast-success { background: #f0fdf4; color: #15803d; border: 1px solid #86efac; }
      .dp-toast-error   { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
      .dp-toast-info    { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

      @media (max-width: 640px) {
        .dp-root { padding: 12px; }
        .dp-grid { grid-template-columns: 1fr; }
        .dp-step-label, .dp-step-sub { display: none; }
        .dp-step { min-width: 44px; }
        .dp-panel { padding: 16px; }
        .dp-header-meta { grid-template-columns: 1fr 1fr; }
      }
    `}</style>
  );
}