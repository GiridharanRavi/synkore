// @ts-nocheck
// frontend/src/pages/admin/YarnPackingList.tsx
//
// Yarn Packing List — sits between Yarn Stock and (future) Yarn Invoice.
// Direct structural mirror of FabricPackingList.tsx, adapted for yarn:
//   - "Piece No"  → "Lot No"
//   - "Meter"     → "KGS" (received_kgs / packed_kgs)
//   - "Construction" → "Count/Sort" (count_desc) + HSN Code
//   - adds Supplier + Location columns to the item picker/table
//
// Flow:
//   1. New Packing List → pick a Customer/Yarn Order (search-select) →
//      autofills Order No, Count/Sort, Quality, Billing/Delivery (incl.
//      Pincode/State/Country/GST), Transport, Vehicle, Firm.
//   2. Pick lots from Yarn Stock (unpacked lots only, APPROVED inwards) →
//      each becomes a packing-list line with Lot No / Received KGS (from
//      stock) + editable Packed KGS.
//   3. Save → PL No auto-generated (YPL05606/26-27 style, resets each FY).
//   4. List row's ⋮ menu → Print, Edit, Convert to Yarn Invoice, Delete.
//
// Backend contract: routes/yarnPackingListRoutes.js

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, Loader2, AlertCircle, CheckCircle2, MoreVertical,
  Printer, Trash2, PenLine, FileOutput, ChevronDown, ChevronUp,
  Download, FileSpreadsheet, FileText,
} from "lucide-react";

import {
  getYarnPackingLists,
  getYarnPackingListById,
  createYarnPackingList,
  updateYarnPackingList,
  deleteYarnPackingList,
  convertYarnPackingListToInvoice,
  getNextYarnPlNo,
  getOrderSnapshotForYarnPacking,
  getAvailableYarnStock,
  YarnPackingListPayload,
  YarnPackingListItem,
  YarnStockPiece,
  YarnOrderSnapshot,
} from "../../api/services";

// ─── Yarn order list loader ──────────────────────────────────────────────
import * as OrdersAPI from "../../api/services";

const YARN_ORDER_FN_CANDIDATES = [
  "getYarnOrders",
  "getYarnOrderBookings",
  "getCustomerOrders",
  "getCustomerOrderList",
  "getAllCustomerOrders",
  "getOrders",
  "fetchCustomerOrders",
  "listCustomerOrders",
  "getOrderBookings",
  "getCustomerOrder",
];

function resolveYarnOrdersFn(): (() => Promise<any>) | null {
  for (const name of YARN_ORDER_FN_CANDIDATES) {
    const fn = (OrdersAPI as any)[name];
    if (typeof fn === "function") return fn;
  }
  return null;
}

// ─── TODO: fill in real per-firm letterhead details ─────────────────────────
// Same letterhead data as Fabric Packing List — swap in your actual per-firm
// address/GST/logo. Kept minimal here since it's identical across modules.
const COMPANY_INFO: Record<string, { name: string; logo?: string; address: string; pin?: string; gst: string; phone: string; email: string }> = {
  DEFAULT: {
    name: "SYNKORE TECH",
    address: "364/43, Kolathu Kadu, 4th Street Agraharam Post Pallipalayam",
    pin: "Namakkal-638008",
    gst: "TODO GSTIN",
    phone: "+91 81108 14250 | +91 90957 23186",
    email: "abhayanexport2019@gmail.com",
  },
};
const getCompanyInfo = (firm?: string) => COMPANY_INFO[(firm || "").toUpperCase()] || COMPANY_INFO.DEFAULT;

// ─── Utilities ────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().split("T")[0];

const fmtDate = (raw?: string | null): string => {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s || s === "null") return "—";
  if (s.includes("T") || s.endsWith("Z")) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  }
  const parts = s.slice(0, 10).split("-");
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
  }
  return s;
};

function fullAddressBlock(addr?: string, pincode?: string, state?: string, country?: string) {
  const lines = [addr || ""].filter(Boolean);
  const tail = [pincode ? `PIN: ${pincode}` : "", state || "", country || ""].filter(Boolean).join(", ");
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function csvCell(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: "Draft",     bg: "#f1f5f9", color: "#475569" },
  finalized: { label: "Packed",    bg: "#ffedd5", color: "#9a3412" },
  invoiced:  { label: "Invoiced",  bg: "#dcfce7", color: "#166534" },
};
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

// ─── Print (yarn packing-list layout — same box/letterhead pattern as Fabric) ─

function doPrintPackingList(pl: YarnPackingListPayload) {
  const co = getCompanyInfo(pl.firm);

  const rows = (pl.items || []).map((it, i) => `
    <tr class="${i % 2 === 0 ? "" : "alt"}">
      <td class="center">${i + 1}</td>
      <td class="center">${it.lot_no || "—"}</td>
      <td class="center">${it.count_desc || "—"}</td>
      <td class="center">${it.hsn_code || "—"}</td>
      <td>${it.supplier_name || "—"}</td>
      <td class="right">${fmt(it.received_kgs)}</td>
      <td class="right">${fmt(it.packed_kgs)}</td>
    </tr>`).join("");

  const billBlock = fullAddressBlock(pl.billing_address, pl.billing_pincode, pl.billing_state, pl.billing_country);
  const delBlock  = fullAddressBlock(pl.delivery_address, pl.delivery_pincode, pl.delivery_state, pl.delivery_country);

  const qrData = encodeURIComponent(`PL:${pl.pl_no} | Order:${pl.order_code || ""}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${qrData}`;

  const logoBlock = co.logo
    ? `<img src="${co.logo}" alt="logo" />`
    : `<div class="logo-fallback"><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>`;

  const win = window.open("", "_blank", "width=950,height=1100");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${pl.pl_no} — Yarn Packing List</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Times New Roman', Times, serif; font-size:12.5px; color:#1e293b; padding:22px 26px; }
  .box { border:1.5px solid #1e293b; }
  .co-head { display:flex; align-items:center; gap:16px; padding:14px 18px; border-bottom:1.5px solid #1e293b; }
  .co-head-logo { flex:0 0 auto; width:78px; display:flex; justify-content:center; }
  .co-head-logo img { width:70px; height:70px; object-fit:contain; display:block; }
  .logo-fallback { width:78px; height:60px; border-radius:10px; background:#c2410c; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:22px; letter-spacing:.04em; }
  .co-head-info { flex:1; text-align:center; }
  .co-head-info h1 { font-size:23px; font-weight:800; color:#c2410c; letter-spacing:.02em; margin-bottom:6px; text-align:center; }
  .co-head-info .addr-block { display:inline-block; text-align:left; }
  .co-head-info .addr-block p { font-size:12.5px; color:#1e293b; line-height:1.42; }
  .co-head-qr { flex:0 0 auto; width:96px; text-align:center; }
  .co-head-qr img { width:92px; height:92px; }
  .title-bar { text-align:center; font-weight:800; font-size:15px; letter-spacing:.06em; padding:7px; border-bottom:1.5px solid #1e293b; }
  .meta-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .meta-cell { flex:1; padding:8px 16px; font-size:12px; line-height:1.7; }
  .meta-cell:first-child { border-right:1.5px solid #1e293b; }
  .meta-cell b { display:inline-block; min-width:66px; }
  .addr-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .addr-cell { flex:1; padding:10px 16px; font-size:12px; line-height:1.55; }
  .addr-cell:first-child { border-right:1.5px solid #1e293b; }
  .addr-cell h4 { font-size:12.5px; margin-bottom:4px; }
  .ship-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .ship-cell { flex:1; padding:9px 16px; font-size:12px; line-height:1.7; }
  .ship-cell:first-child { border-right:1.5px solid #1e293b; }
  table { width:100%; border-collapse:collapse; }
  th { background:#d9d9d9; padding:8px 10px; font-size:12px; font-weight:700; text-align:center; border-bottom:1.5px solid #1e293b; border-right:1px solid #94a3b8; }
  th:last-child, td:last-child { border-right:none; }
  th.right { text-align:right; }
  td { padding:7px 10px; font-size:12px; border-bottom:1px solid #cbd5e1; border-right:1px solid #e2e8f0; }
  td.center { text-align:center; }
  td.right { text-align:right; }
  tr.alt td { background:#fff7ed; }
  tfoot td { font-weight:800; border-top:1.5px solid #1e293b; border-bottom:none; background:#d9d9d9; text-align:center; }
  tfoot td.right { text-align:right; }
  .prepared-name { padding:18px 20px 0; font-weight:700; font-size:13px; }
  .sign-row { display:flex; justify-content:space-between; padding:46px 26px 18px; font-size:12px; }
  .sign-row div { text-align:center; min-width:130px; border-top:1px solid #1e293b; padding-top:5px; font-weight:600; }
  .footer { text-align:right; font-size:10px; color:#94a3b8; padding:6px 16px; }
  @media print { body { padding:6px; } }
</style></head>
<body>
  <div class="box">
    <div class="co-head">
      <div class="co-head-logo">${logoBlock}</div>
      <div class="co-head-info">
        <h1>${co.name}</h1>
        <div class="addr-block">
          <p>${co.address}</p>
          ${co.pin ? `<p>${co.pin}</p>` : ""}
          <p>GST No: ${co.gst}</p>
          <p>Ph: ${co.phone}${co.email ? `, E-mail: ${co.email}` : ""}</p>
        </div>
      </div>
      <div class="co-head-qr"><img src="${qrSrc}" alt="QR" /></div>
    </div>
    <div class="title-bar">YARN PACKING LIST</div>
    <div class="meta-row">
      <div class="meta-cell"><b>Order No</b> : ${pl.order_code || "—"}<br/><b>Count/Sort</b> : ${pl.count_desc || "—"}</div>
      <div class="meta-cell"><b>PL No</b> : ${pl.pl_no}<br/><b>Date</b> : ${fmtDate(pl.pl_date)}</div>
    </div>
    <div class="addr-row">
      <div class="addr-cell"><h4>Billing To:</h4>${(pl.customer_name || "—")}<br/>${billBlock.replace(/\n/g, "<br/>")}${pl.billing_gst ? `<br/>GST No: ${pl.billing_gst}` : ""}</div>
      <div class="addr-cell"><h4>Delivery At:</h4>${(pl.delivery_name || pl.customer_name || "—")}<br/>${delBlock.replace(/\n/g, "<br/>")}${pl.delivery_gst ? `<br/>GST No: ${pl.delivery_gst}` : ""}</div>
    </div>
    <div class="ship-row">
      <div class="ship-cell"><b>Quality:</b> ${pl.quality || "—"}</div>
      <div class="ship-cell"><b>Transport Name</b> : ${pl.transport_name || "—"}<br/><b>Vehicle No</b> : ${pl.vehicle_no || "—"}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:44px">S.No</th>
          <th>Lot No</th>
          <th>Count/Sort</th>
          <th>HSN</th>
          <th>Supplier</th>
          <th class="right" style="width:100px">Received KGS</th>
          <th class="right" style="width:100px">Packed KGS</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="5">Total</td>
          <td class="right">${fmt(pl.items?.reduce((a, i) => a + (Number(i.received_kgs) || 0), 0) || 0)}</td>
          <td class="right">${fmt(pl.total_kgs || 0)}</td>
        </tr>
      </tfoot>
    </table>
    ${pl.prepared_by ? `<div class="prepared-name">${pl.prepared_by}</div>` : ""}
    <div class="sign-row">
      <div>Prepared By</div>
      <div>Checked By</div>
      <div>Approved By</div>
    </div>
    <div class="footer">Printed on ${new Date().toLocaleString("en-IN")} &nbsp;|&nbsp; Page 1 of 1</div>
  </div>
  <script>window.onload=()=>{window.print()}<\/script>
</body></html>`);
  win.document.close();
}

// ─── Row action menu (⋮) ────────────────────────────────────────────────────

const ROW_MENU_WIDTH = 220;
const ROW_MENU_HEIGHT = 190;

function RowMenu({ pl, onPrint, onEdit, onConvert, onDelete }: {
  pl: YarnPackingListPayload;
  onPrint: () => void; onEdit: () => void; onConvert: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const computePosition = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < ROW_MENU_HEIGHT && rect.top > ROW_MENU_HEIGHT;
    let left = rect.right - ROW_MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - ROW_MENU_WIDTH - 8));
    const top = openUp ? rect.top - ROW_MENU_HEIGHT - 4 : rect.bottom + 4;
    setCoords({ top, left });
  }, []);

  const toggleOpen = () => {
    if (!open) computePosition();
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const reposition = () => computePosition();
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, computePosition]);

  const alreadyInvoiced = pl.status === "invoiced";

  return (
    <>
      <button ref={btnRef} className="ypl-dots-btn" onClick={toggleOpen}>
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="ypl-row-menu"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: ROW_MENU_WIDTH }}
        >
          <button className="ypl-row-menu-item" onClick={() => { onPrint(); setOpen(false); }}>
            <Printer size={14} color="#c2410c" /> Print Packing List
          </button>
          <button className="ypl-row-menu-item" onClick={() => { onEdit(); setOpen(false); }}>
            <PenLine size={14} color="#9a3412" /> Edit
          </button>
          <button
            className="ypl-row-menu-item"
            disabled={alreadyInvoiced}
            style={alreadyInvoiced ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => { if (!alreadyInvoiced) { onConvert(); setOpen(false); } }}
          >
            <FileOutput size={14} color="#166534" />
            {alreadyInvoiced ? `Invoiced (${pl.invoice_no})` : "Convert to Yarn Invoice"}
          </button>
          <div className="ypl-row-menu-sep" />
          <button className="ypl-row-menu-item ypl-row-menu-item--danger" onClick={() => { onDelete(); setOpen(false); }}>
            <Trash2 size={14} color="#dc2626" /> Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Export menu (⬇ Export) ─────────────────────────────────────────────────

const EXPORT_MENU_WIDTH = 200;

function ExportMenu({ onExportCsv, onExportPrintAll }: {
  onExportCsv: () => void;
  onExportPrintAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className="ypl-export-btn" onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="ypl-export-menu" style={{ width: EXPORT_MENU_WIDTH }}>
          <button className="ypl-row-menu-item" onClick={() => { onExportCsv(); setOpen(false); }}>
            <FileSpreadsheet size={14} color="#166534" /> Export as CSV
          </button>
          <button className="ypl-row-menu-item" onClick={() => { onExportPrintAll(); setOpen(false); }}>
            <FileText size={14} color="#c2410c" /> Print / PDF (current page)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Order search-select ────────────────────────────────────────────────────

function OrderSearchSelect({ value, options, loading, onSelect }: {
  value: string; options: any[]; loading: boolean; onSelect: (o: any | null) => void;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value ?? ""); }, [value]);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const orderLabel = (o: any) => o.order_code ?? o.order_no ?? o.co_no ?? `#${o.id}`;
  const custLabel  = (o: any) => o.customer_name ?? o.customer ?? "";

  const filtered = options.filter(o =>
    orderLabel(o).toLowerCase().includes((query ?? "").toLowerCase()) ||
    custLabel(o).toLowerCase().includes((query ?? "").toLowerCase())
  );

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          className="ypl-input"
          type="text"
          placeholder={loading ? "Loading orders…" : "Search Order No or customer…"}
          value={query ?? ""}
          disabled={loading}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ paddingRight: 30 }}
        />
        <ChevronDown size={14} style={{ position: "absolute", right: 10, color: "#94a3b8", pointerEvents: "none" }} />
      </div>
      {open && (
        <div className="ypl-dropdown">
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              {loading ? "Loading…" : "No orders found"}
            </div>
          ) : filtered.slice(0, 50).map(o => (
            <button key={o.id} type="button" className="ypl-dropdown-item"
              onClick={() => { setQuery(orderLabel(o)); setOpen(false); onSelect(o); }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "#9a3412", fontSize: 13 }}>{orderLabel(o)}</span>
              <span style={{ color: "#64748b", fontSize: 12, marginLeft: 10 }}>{custLabel(o)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stock lot picker ────────────────────────────────────────────────────────

function StockLotPicker({ countDesc, selectedIds, onAdd }: {
  countDesc?: string; selectedIds: Set<number>; onAdd: (piece: YarnStockPiece) => void;
}) {
  const [pieces, setPieces]   = useState<YarnStockPiece[]>([]);
  const [meta, setMeta]       = useState<{
    total_unpacked: number;
    requested_count_desc: string | null;
    count_desc_found_in_stock: boolean | null;
    available_count_descs?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [onlyThisCount, setOnlyThisCount] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAvailableYarnStock({
        count_desc: onlyThisCount && countDesc ? countDesc : undefined,
        search: search || undefined,
      });
      const body = res?.data ?? res;
      if (Array.isArray(body)) {
        setPieces(body);
        setMeta(null);
      } else {
        setPieces(body?.pieces || []);
        setMeta({
          total_unpacked: body?.total_unpacked ?? 0,
          requested_count_desc: body?.requested_count_desc ?? null,
          count_desc_found_in_stock: body?.count_desc_found_in_stock ?? null,
          available_count_descs: body?.available_count_descs,
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [countDesc, onlyThisCount, search]);

  useEffect(() => { load(); }, [load]);

  const showCountMismatchHint =
    !loading && pieces.length === 0 && meta &&
    meta.requested_count_desc && meta.count_desc_found_in_stock === false &&
    meta.total_unpacked > 0;

  const showTrulyEmptyHint =
    !loading && pieces.length === 0 && meta && meta.total_unpacked === 0;

  return (
    <div className="ypl-picker">
      <div className="ypl-picker-toolbar">
        <div className="ypl-search-wrap" style={{ maxWidth: 260 }}>
          <Search size={13} />
          <input className="ypl-search" placeholder="Search lot / HSN / supplier…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {countDesc && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyThisCount} onChange={e => setOnlyThisCount(e.target.checked)} />
            Only Count/Sort {countDesc}
          </label>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{pieces.length} available</span>
      </div>
      <div className="ypl-picker-list">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : pieces.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {showCountMismatchHint ? (
              <>
                <div style={{ marginBottom: 6 }}>
                  No unpacked stock for Count/Sort <strong>{meta.requested_count_desc}</strong>.
                </div>
                {meta.available_count_descs && meta.available_count_descs.length > 0 ? (
                  <div style={{ fontSize: 12 }}>
                    Count/Sort values currently in unpacked stock:{" "}
                    <span style={{ fontFamily: "'DM Mono',monospace", color: "#9a3412" }}>
                      {meta.available_count_descs.join(", ")}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 12 }}>
                    Uncheck "Only Count/Sort" above to see all {meta.total_unpacked} unpacked lot(s).
                  </div>
                )}
              </>
            ) : showTrulyEmptyHint ? (
              "No unpacked yarn stock exists yet — inward some stock via Yarn Purchase Inward first."
            ) : (
              "No unpacked stock lots found."
            )}
          </div>
        ) : pieces.map(p => {
          const already = selectedIds.has(p.id ?? p.item_id);
          return (
            <div key={p.id ?? p.item_id} className="ypl-picker-row">
              <div>
                <span className="ypl-mono" style={{ fontWeight: 700, color: "#9a3412" }}>{p.lot_no || `#${p.id ?? p.item_id}`}</span>
                <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 8 }}>
                  {p.count_desc || "—"} · HSN {p.hsn_code || "—"} · {p.supplier_name || "—"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="ypl-mono" style={{ fontSize: 12, color: "#374151" }}>{fmt(p.received_kgs)} KGS</span>
                <button
                  type="button"
                  className="ypl-add-piece-btn"
                  disabled={already}
                  onClick={() => onAdd(p)}
                >
                  {already ? "Added" : "+ Add"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function YarnPackingList() {
  const [lists, setLists]   = useState<YarnPackingListPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const LIMIT = 10;

  const [orderOptions, setOrderOptions] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersFnMissing, setOrdersFnMissing] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit]       = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<YarnPackingListPayload>(emptyForm());
  const [plGenerating, setPlGenerating] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedCode, setSavedCode] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<YarnPackingListPayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const [convertTarget, setConvertTarget] = useState<YarnPackingListPayload | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{ invoice_no: string } | null>(null);

  const width = useWidth();

  function emptyForm(): YarnPackingListPayload {
    return {
      pl_no: "", pl_date: today(),
      order_id: null, order_code: "", count_desc: "", quality: "",
      customer_id: null, customer_name: "",
      billing_address: "", billing_pincode: "", billing_state: "", billing_country: "", billing_gst: "",
      delivery_name: "",
      delivery_address: "", delivery_pincode: "", delivery_state: "", delivery_country: "", delivery_gst: "",
      transport_name: "", vehicle_no: "", firm: "",
      prepared_by: "", remarks: "",
      items: [],
    };
  }

  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getYarnPackingLists();
      setLists((res?.data ?? res) || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  useEffect(() => {
    (async () => {
      const fn = resolveYarnOrdersFn();
      if (!fn) {
        console.error(
          "YarnPackingList: no yarn/customer-orders loader found in api/services.ts. " +
          "Tried:", YARN_ORDER_FN_CANDIDATES,
          "— add the real export name to YARN_ORDER_FN_CANDIDATES in YarnPackingList.tsx."
        );
        setOrdersFnMissing(true);
        return;
      }
      setLoadingOrders(true);
      try {
        const res = await fn();
        setOrderOptions((res?.data ?? res) || []);
      } catch { /* ignore — dropdown just stays empty */ }
      finally { setLoadingOrders(false); }
    })();
  }, []);

  useEffect(() => {
    document.body.style.overflow = showModal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal]);

  // ── Filter + paginate ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return lists;
    return lists.filter(pl =>
      (pl.pl_no || "").toLowerCase().includes(q) ||
      (pl.order_code || "").toLowerCase().includes(q) ||
      (pl.customer_name || "").toLowerCase().includes(q)
    );
  }, [lists, search]);

  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const pageRows = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  // ── Totals live-computed from items ──
  const totals = useMemo(() => {
    const items = form.items || [];
    return items.reduce((acc, it) => {
      acc.kgs += Number(it.packed_kgs ?? it.received_kgs) || 0;
      return acc;
    }, { kgs: 0 });
  }, [form.items]);

  const selectedStockIds = useMemo(
    () => new Set((form.items || []).map(i => i.yarn_item_id).filter(Boolean) as number[]),
    [form.items]
  );

  // ── Open create ──
  const handleNew = async () => {
    setForm(emptyForm());
    setIsEdit(false); setEditId(null);
    setSaveError(""); setSavedCode("");
    setShowModal(true);
    setPlGenerating(true);
    try {
      const res = await getNextYarnPlNo();
      const no = (res?.data ?? res)?.pl_no || "";
      setForm(f => ({ ...f, pl_no: no }));
    } catch { /* leave blank, server will generate on save */ }
    finally { setPlGenerating(false); }
  };

  // ── Open edit ──
  const handleOpenEdit = async (pl: YarnPackingListPayload) => {
    setSaveError(""); setSavedCode("");
    setIsEdit(true); setEditId(pl.id!);
    setShowModal(true);
    try {
      const res = await getYarnPackingListById(pl.id!);
      const data = res?.data ?? res;
      setForm({ ...emptyForm(), ...data, pl_date: (data.pl_date || today()).toString().slice(0, 10) });
    } catch {
      setForm({ ...emptyForm(), ...pl });
    }
  };

  const handleClose = () => {
    setShowModal(false); setForm(emptyForm());
    setSaveError(""); setSavedCode("");
  };

  // ── Order select → autofill ──
  const handleOrderSelect = async (order: any | null) => {
    if (!order) {
      setForm(f => ({
        ...f, order_id: null, order_code: "", count_desc: "", quality: "",
        customer_id: null, customer_name: "",
        billing_address: "", billing_pincode: "", billing_state: "", billing_country: "", billing_gst: "",
        delivery_name: "",
        delivery_address: "", delivery_pincode: "", delivery_state: "", delivery_country: "", delivery_gst: "",
        transport_name: "", vehicle_no: "", firm: "",
      }));
      return;
    }
    setOrderLoading(true);
    try {
      const res = await getOrderSnapshotForYarnPacking(order.id);
      const snap: YarnOrderSnapshot = res?.data ?? res;
      setForm(f => ({
        ...f,
        order_id: snap.order_id,
        order_code: snap.order_code || order.order_code || order.order_no || "",
        count_desc: snap.count_desc || "",
        quality: snap.quality || "",
        customer_id: snap.customer_id,
        customer_name: snap.customer_name || order.customer_name || "",
        billing_address: snap.billing_address || "",
        billing_pincode: snap.billing_pincode || "",
        billing_state: snap.billing_state || "",
        billing_country: snap.billing_country || "",
        billing_gst: snap.billing_gst || "",
        delivery_name: snap.delivery_name || "",
        delivery_address: snap.delivery_address || "",
        delivery_pincode: snap.delivery_pincode || "",
        delivery_state: snap.delivery_state || "",
        delivery_country: snap.delivery_country || "",
        delivery_gst: snap.delivery_gst || "",
        transport_name: snap.transport_name || "",
        vehicle_no: snap.vehicle_no || "",
        firm: snap.firm || "",
      }));
    } catch (err: any) {
      console.error(
        "getOrderSnapshotForYarnPacking failed — Count/Sort/Quality/Firm/Transport/" +
        "Vehicle/Billing/Delivery (incl. Pincode/State/Country/GST) will stay " +
        "blank until this is fixed:",
        err?.response?.status, err?.response?.data || err?.message
      );
      setForm(f => ({
        ...f,
        order_id: order.id,
        order_code: order.order_code || order.order_no || "",
        customer_name: order.customer_name || order.customer || "",
      }));
    } finally { setOrderLoading(false); }
  };

  // ── Item ops ──
  const addLotToForm = (piece: YarnStockPiece) => {
    setForm(f => {
      const pieceId = piece.id ?? piece.item_id;
      if ((f.items || []).some(i => i.yarn_item_id === pieceId)) return f;
      const newItem: YarnPackingListItem = {
        yarn_item_id: pieceId,
        lot_no: piece.lot_no,
        count_desc: piece.count_desc,
        hsn_code: piece.hsn_code,
        received_kgs: piece.received_kgs,
        packed_kgs: piece.received_kgs,
        rate: piece.rate,
        supplier_name: piece.supplier_name,
        location_name: piece.location_name,
      };
      return { ...f, items: [...(f.items || []), newItem] };
    });
  };
  const removeItem = (idx: number) =>
    setForm(f => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, patch: Partial<YarnPackingListItem>) =>
    setForm(f => {
      const items = [...(f.items || [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...f, items };
    });

  // ── Save ──
  const handleSave = async () => {
    setSaveError("");
    if (!form.order_id) { setSaveError("Select a Customer Order first."); return; }
    if (!form.items || form.items.length === 0) { setSaveError("Add at least one yarn stock lot."); return; }
    setSaving(true);
    try {
      const payload = { ...form, total_kgs: totals.kgs, total_pieces: form.items.length };
      if (isEdit && editId) {
        await updateYarnPackingList(editId, payload);
        setSavedCode(form.pl_no);
      } else {
        const res: any = await createYarnPackingList(payload);
        setSavedCode(res?.pl_no ?? res?.data?.pl_no ?? form.pl_no);
      }
      fetchLists();
    } catch (e: any) {
      // The real reason (message / sqlMessage / code) is in the backend's
      // JSON body — e.response.data — not the generic axios e.message.
      const serverMsg  = e?.response?.data?.message || e?.response?.data?.sqlMessage;
      const serverCode = e?.response?.data?.code;
      console.error("Save Yarn Packing List failed — full server response:", e?.response?.data || e);
      setSaveError(
        serverMsg
          ? `${serverMsg}${serverCode ? ` (${serverCode})` : ""}`
          : (e?.message || "Failed to save packing list.")
      );
    } finally { setSaving(false); }
  };

  // ── Delete ──
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    try {
      await deleteYarnPackingList(deleteTarget.id!);
      setDeleteTarget(null);
      fetchLists();
    } catch (e: any) {
      console.error("Delete Yarn Packing List failed:", e?.response?.data || e?.message);
    }
    finally { setDeleteConfirming(false); }
  };

  // ── Convert to invoice ──
  const openConvert = (pl: YarnPackingListPayload) => { setConvertTarget(pl); setConvertResult(null); };
  const handleConvertConfirm = async () => {
    if (!convertTarget) return;
    setConverting(true);
    try {
      const res: any = await convertYarnPackingListToInvoice(convertTarget.id!);
      const data = res?.data ?? res;
      setConvertResult({ invoice_no: data.invoice_no });
      fetchLists();
    } catch (e: any) {
      console.error("Convert to invoice failed:", e?.response?.data || e?.message);
      setConvertResult({ invoice_no: "" });
    } finally { setConverting(false); }
  };

  // ── Print from list row (fetch full item detail first) ──
  const handlePrintRow = async (pl: YarnPackingListPayload) => {
    try {
      const res = await getYarnPackingListById(pl.id!);
      doPrintPackingList(res?.data ?? res);
    } catch {
      doPrintPackingList(pl);
    }
  };

  // ── Export: CSV of the currently filtered list ──
  const handleExportCsv = () => {
    const header = ["S.No", "PL No", "Date", "Order No", "Customer", "Count/Sort", "Lots", "Total KGS", "Status"];
    const lines = [header.map(csvCell).join(",")];
    filtered.forEach((pl, i) => {
      lines.push([
        i + 1,
        pl.pl_no || "",
        fmtDate(pl.pl_date),
        pl.order_code || "",
        pl.customer_name || "",
        pl.count_desc || "",
        pl.total_pieces ?? (pl.items?.length || 0),
        fmt(pl.total_kgs || 0),
        (STATUS_CFG[pl.status || "draft"] || STATUS_CFG.draft).label,
      ].map(csvCell).join(","));
    });
    downloadTextFile(`Yarn_Packing_Lists_${today()}.csv`, lines.join("\r\n"));
  };

  // ── Export: quick print-preview of the current page as a simple table ──
  const handleExportPrintAll = () => {
    const win = window.open("", "_blank", "width=1000,height=1000");
    if (!win) return;
    const rows = pageRows.map((pl, i) => `
      <tr>
        <td>${(page - 1) * LIMIT + i + 1}</td>
        <td>${pl.pl_no || "—"}</td>
        <td>${fmtDate(pl.pl_date)}</td>
        <td>${pl.order_code || "—"}</td>
        <td>${pl.customer_name || "—"}</td>
        <td>${pl.count_desc || "—"}</td>
        <td class="right">${pl.total_pieces ?? (pl.items?.length || 0)}</td>
        <td class="right">${fmt(pl.total_kgs || 0)}</td>
        <td>${(STATUS_CFG[pl.status || "draft"] || STATUS_CFG.draft).label}</td>
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Yarn Packing Lists</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Times New Roman', Times, serif; font-size:12px; color:#1e293b; padding:26px 30px; }
  h1 { text-align:center; font-size:18px; margin-bottom:14px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#f1f5f9; padding:8px 10px; font-size:11px; text-align:left; border:1px solid #cbd5e1; }
  td { padding:7px 10px; font-size:11.5px; border:1px solid #e2e8f0; }
  td.right, th.right { text-align:right; }
  @media print { body { padding:8px; } }
</style></head>
<body>
  <h1>Yarn Packing Lists</h1>
  <table>
    <thead><tr><th>#</th><th>PL No</th><th>Date</th><th>Order No</th><th>Customer</th><th>Count/Sort</th><th class="right">Lots</th><th class="right">KGS</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>{window.print()}<\/script>
</body></html>`);
    win.document.close();
  };

  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .ypl-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; min-height:100vh; background:#f1f5f9; }

        .ypl-page-header { padding:16px 28px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        .ypl-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#c2410c; }
        .ypl-page-header p  { margin:2px 0 0; font-size:12px; color:#64748b; }
        .ypl-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .ypl-new-btn { display:flex; align-items:center; gap:6px; background:#c2410c; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(194,65,12,.3); font-family:'DM Sans',sans-serif; }
        .ypl-new-btn:hover { background:#9a3412; }

        .ypl-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#c2410c; border:1px solid #fed7aa; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ypl-export-btn:hover { background:#fff7ed; }
        .ypl-export-menu { position:absolute; top:calc(100% + 6px); right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:600; overflow:hidden; }

        .ypl-toolbar { padding:0 28px 16px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .ypl-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .ypl-search-wrap svg { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .ypl-search { width:100%; padding:8px 12px 8px 30px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; outline:none; }
        .ypl-search:focus { border-color:#c2410c; }
        .ypl-rec-count { font-size:13px; color:#64748b; margin-left:auto; }

        .ypl-card { margin:0 28px 28px; background:#fff; border-radius:12px; box-shadow:0 1px 6px rgba(0,0,0,.07); border:1px solid #e2e8f0; overflow:hidden; }
        .ypl-table-wrap { overflow-x:auto; }
        .ypl-table { width:100%; border-collapse:collapse; font-size:13px; min-width:900px; }
        .ypl-table thead tr { background:#c2410c; }
        .ypl-table th { padding:11px 14px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .ypl-table th.th-r { text-align:right; }
        .ypl-table th.th-c { text-align:center; }
        .ypl-table tbody tr:nth-child(odd) td { background:#fff; }
        .ypl-table tbody tr:nth-child(even) td { background:#fff7ed; }
        .ypl-table td { padding:10px 14px; color:#374151; font-size:12.5px; white-space:nowrap; }
        .ypl-mono { font-family:'DM Mono',monospace; }
        .ypl-pl-no { font-family:'DM Mono',monospace; font-weight:700; color:#c2410c; background:#ffedd5; border:1px solid #fed7aa; border-radius:6px; padding:2px 7px; }
        .ypl-order-no { font-weight:700; color:#0e7490; }
        .ypl-td-num { text-align:right; font-family:'DM Mono',monospace; font-weight:700; }
        .ypl-td-c { text-align:center; }
        .ypl-empty { text-align:center; padding:48px 16px; color:#94a3b8; font-size:13px; }

        .ypl-dots-btn { background:none; border:none; cursor:pointer; padding:4px; border-radius:6px; display:flex; align-items:center; color:#64748b; }
        .ypl-dots-btn:hover { background:#f1f5f9; }
        .ypl-row-menu { background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:5000; min-width:210px; overflow:hidden; }
        .ypl-row-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; border:none; background:none; cursor:pointer; font-size:12.5px; color:#374151; font-family:'DM Sans',sans-serif; text-align:left; }
        .ypl-row-menu-item:hover:not(:disabled) { background:#f8fafc; }
        .ypl-row-menu-item--danger { color:#dc2626; }
        .ypl-row-menu-sep { height:1px; background:#f1f5f9; margin:2px 0; }

        .ypl-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#fff7ed; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .ypl-pg-btns { display:flex; gap:4px; align-items:center; }
        .ypl-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif; }
        .ypl-pg-btn.active { background:#c2410c; color:#fff; border-color:#c2410c; font-weight:700; }
        .ypl-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        /* Modal */
        .ypl-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:24px 16px; }
        .ypl-modal { background:#fff; border-radius:16px; width:100%; max-width:1000px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 48px); }
        .ypl-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; border-radius:16px 16px 0 0; background:linear-gradient(135deg,#c2410c,#7c2d12); flex-shrink:0; }
        .ypl-modal-title { color:#fff; font-weight:700; font-size:18px; margin:0; }
        .ypl-modal-subtitle { font-size:11px; color:rgba(255,255,255,.75); font-family:'DM Mono',monospace; margin-top:2px; }
        .ypl-modal-close-btn { background:none; border:none; cursor:pointer; display:flex; opacity:.85; }
        .ypl-modal-close-btn:hover { opacity:1; }
        .ypl-modal-body { padding:20px 24px; overflow-y:auto; flex:1; }
        .ypl-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }

        .ypl-section-head { font-weight:700; font-size:13px; color:#c2410c; background:#ffedd5; border:1px solid #fed7aa; border-radius:10px; padding:10px 14px; margin-top:16px; margin-bottom:10px; }

        .ypl-grid-3 { display:grid; grid-template-columns:1fr; gap:14px; }
        @media(min-width:480px){ .ypl-grid-3 { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:768px){ .ypl-grid-3 { grid-template-columns:repeat(3,1fr); } }
        .ypl-col-full { grid-column:1/-1; }

        .ypl-addr-grid { display:grid; grid-template-columns:1fr; gap:20px; grid-column:1/-1; margin-top:2px; }
        @media(min-width:640px){ .ypl-addr-grid { grid-template-columns:1fr 1fr; } }
        .ypl-addr-col { display:flex; flex-direction:column; gap:10px; }
        .ypl-addr-subrow { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

        .ypl-label { display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
        .ypl-required { color:#ef4444; }
        .ypl-input { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; }
        .ypl-input:focus { border-color:#c2410c; }
        .ypl-input:disabled, .ypl-input[readonly] { background:#f8fafc; color:#64748b; }
        .ypl-textarea { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; resize:vertical; min-height:78px; line-height:1.5; }
        .ypl-textarea:focus { border-color:#c2410c; }
        .ypl-display-field { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; font-size:13px; background:#f8fafc; color:#475569; min-height:38px; display:flex; align-items:center; }
        .ypl-display-field--filled { background:#ffedd5; border-color:#fdba74; color:#9a3412; font-weight:700; font-family:'DM Mono',monospace; }

        .ypl-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.12); z-index:500; max-height:220px; overflow-y:auto; }
        .ypl-dropdown-item { display:block; width:100%; text-align:left; padding:9px 14px; border:none; background:none; cursor:pointer; font-family:'DM Sans',sans-serif; border-bottom:1px solid #f1f5f9; }
        .ypl-dropdown-item:hover { background:#fff7ed; }

        .ypl-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }

        /* Lot picker */
        .ypl-picker { border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
        .ypl-picker-toolbar { display:flex; align-items:center; gap:12px; padding:10px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; }
        .ypl-picker-list { max-height:220px; overflow-y:auto; }
        .ypl-picker-row { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid #f1f5f9; }
        .ypl-picker-row:hover { background:#fffaf5; }
        .ypl-add-piece-btn { background:#ffedd5; border:1px solid #fed7aa; color:#c2410c; border-radius:6px; padding:4px 10px; font-size:11.5px; font-weight:700; cursor:pointer; }
        .ypl-add-piece-btn:hover:not(:disabled) { background:#fed7aa; }
        .ypl-add-piece-btn:disabled { opacity:.5; cursor:not-allowed; }

        /* Selected items table */
        .ypl-item-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
        .ypl-item-table th { padding:8px 10px; background:#ffedd5; color:#c2410c; font-weight:700; text-align:left; font-size:11px; border-bottom:1px solid #e2e8f0; }
        .ypl-item-table th.right { text-align:right; }
        .ypl-item-table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
        .ypl-item-table td.right { text-align:right; }
        .ypl-iinput { width:90px; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:12px; text-align:right; font-family:'DM Sans',sans-serif; }
        .ypl-iinput:focus { border-color:#c2410c; outline:none; }
        .ypl-del-row-btn { background:#fff1f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; }

        .ypl-total-section { background:#ffedd5; border:1px solid #fed7aa; border-radius:12px; padding:14px 18px; margin-top:12px; display:flex; gap:24px; flex-wrap:wrap; }
        .ypl-total-item { display:flex; flex-direction:column; gap:2px; }
        .ypl-total-label { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
        .ypl-total-val { font-size:16px; font-weight:800; color:#c2410c; font-family:'DM Mono',monospace; }

        .ypl-cancel-btn { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; }
        .ypl-cancel-btn:hover { background:#f1f5f9; }
        .ypl-save-btn { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#c2410c; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
        .ypl-save-btn:hover:not(:disabled) { background:#9a3412; }
        .ypl-save-btn:disabled { opacity:.7; cursor:not-allowed; }

        .ypl-ok-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:12px; }
        .ypl-ok-icon { width:64px; height:64px; border-radius:50%; background:#ffedd5; display:flex; align-items:center; justify-content:center; font-size:30px; }
        .ypl-ok-title { font-size:18px; font-weight:700; color:#1e293b; margin:0; }
        .ypl-ok-code { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#c2410c; margin:0; }
        .ypl-ok-close { margin-top:12px; padding:9px 24px; border:none; border-radius:8px; background:#c2410c; color:#fff; font-weight:600; font-size:13px; cursor:pointer; }

        /* Confirm dialogs */
        .ypl-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .ypl-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
        .ypl-confirm-title { font-size:17px; font-weight:700; color:#1e293b; margin:8px 0; }
        .ypl-confirm-sub { font-size:13px; color:#64748b; margin:0 0 22px; line-height:1.6; }
        .ypl-confirm-actions { display:flex; gap:10px; justify-content:center; }
        .ypl-confirm-cancel { padding:9px 22px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; }
        .ypl-confirm-del { padding:9px 22px; border:none; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
        .ypl-confirm-ok { padding:9px 22px; border:none; border-radius:8px; background:#166534; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
      `}</style>

      <div className="ypl-wrap">
        <div className="ypl-page-header">
          <div>
            <h1>Yarn Packing List</h1>
            <p>Pack yarn stock lots against a customer order and generate a packing list</p>
          </div>
          <div className="ypl-header-actions">
            <ExportMenu onExportCsv={handleExportCsv} onExportPrintAll={handleExportPrintAll} />
            <button className="ypl-new-btn" onClick={handleNew}><Plus size={15} /> New Packing List</button>
          </div>
        </div>

        <div className="ypl-toolbar">
          <div className="ypl-search-wrap">
            <Search size={13} />
            <input className="ypl-search" placeholder="Search PL no, order no, customer…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="ypl-rec-count">{filtered.length} record(s)</span>
        </div>

        <div className="ypl-card">
          <div className="ypl-table-wrap">
            <table className="ypl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PL No</th>
                  <th>Date</th>
                  <th>Order No</th>
                  <th>Customer</th>
                  {width >= 768 && <th>Count/Sort</th>}
                  <th className="th-r">Lots</th>
                  <th className="th-r">KGS</th>
                  <th className="th-c">Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="ypl-empty"><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={10} className="ypl-empty">
                    {search ? "No packing lists match your search." : 'No packing lists yet. Click "New Packing List" to create one.'}
                  </td></tr>
                ) : pageRows.map((pl, i) => (
                  <tr key={pl.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                    <td><span className="ypl-pl-no">{pl.pl_no}</span></td>
                    <td style={{ color: "#64748b" }}>{fmtDate(pl.pl_date)}</td>
                    <td><span className="ypl-order-no">{pl.order_code || "—"}</span></td>
                    <td>{pl.customer_name || "—"}</td>
                    {width >= 768 && <td>{pl.count_desc || "—"}</td>}
                    <td className="ypl-td-num">{pl.total_pieces ?? (pl.items?.length || 0)}</td>
                    <td className="ypl-td-num">{fmt(pl.total_kgs || 0)} KGS</td>
                    <td className="ypl-td-c"><StatusBadge status={pl.status || "draft"} /></td>
                    <td className="ypl-td-c">
                      <RowMenu
                        pl={pl}
                        onPrint={() => handlePrintRow(pl)}
                        onEdit={() => handleOpenEdit(pl)}
                        onConvert={() => openConvert(pl)}
                        onDelete={() => setDeleteTarget(pl)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="ypl-pg-bar">
              <span>Page {page} of {totalPages} — {filtered.length} record(s)</span>
              <div className="ypl-pg-btns">
                <button className="ypl-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="ypl-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`ypl-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="ypl-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="ypl-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* CREATE / EDIT MODAL */}
        {showModal && (
          <div className="ypl-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="ypl-modal">
              <div className="ypl-modal-header">
                <div>
                  <h2 className="ypl-modal-title">{isEdit ? "✏️ Edit Packing List" : "🧶 New Packing List"}</h2>
                  <p className="ypl-modal-subtitle">{plGenerating ? "Generating PL No…" : (form.pl_no || "—")}</p>
                </div>
                <button className="ypl-modal-close-btn" onClick={handleClose}><X size={20} color="#fff" /></button>
              </div>

              {savedCode ? (
                <div className="ypl-ok-wrap">
                  <div className="ypl-ok-icon"><CheckCircle2 size={30} color="#c2410c" /></div>
                  <p className="ypl-ok-title">Packing List Saved!</p>
                  <p className="ypl-ok-code">{savedCode}</p>
                  <button className="ypl-ok-close" onClick={handleClose}>Close</button>
                </div>
              ) : (
                <>
                  <div className="ypl-modal-body">
                    {saveError && (
                      <div className="ypl-error-banner">
                        <AlertCircle size={15} />
                        <span>{saveError}</span>
                        <button onClick={() => setSaveError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14} /></button>
                      </div>
                    )}

                    <div className="ypl-section-head">Order &amp; Delivery Details</div>
                    <div className="ypl-grid-3">
                      <div>
                        <label className="ypl-label">Customer Order <span className="ypl-required">*</span></label>
                        <OrderSearchSelect value={form.order_code || ""} options={orderOptions} loading={loadingOrders} onSelect={handleOrderSelect} />
                        {ordersFnMissing && (
                          <p className="ypl-hint" style={{ color: "#b45309", marginTop: 4, fontSize: 11 }}>
                            ⚠ No orders loader found in services.ts — see console, or type the Order No / Count-Sort / Customer fields below manually.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="ypl-label">Customer Name {orderLoading && "(loading…)"}</label>
                        <input className="ypl-input" value={form.customer_name || ""} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Autofills from Customer Order" />
                      </div>
                      <div>
                        <label className="ypl-label">PL No</label>
                        <div className={`ypl-display-field${form.pl_no ? " ypl-display-field--filled" : ""}`}>
                          {plGenerating ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : (form.pl_no || "Auto-generated")}
                        </div>
                      </div>
                      <div>
                        <label className="ypl-label">PL Date</label>
                        <input className="ypl-input" type="date" value={form.pl_date} onChange={e => setForm(f => ({ ...f, pl_date: e.target.value }))} />
                      </div>

                      <div>
                        <label className="ypl-label">Count/Sort</label>
                        <input className="ypl-input" value={form.count_desc || ""} onChange={e => setForm(f => ({ ...f, count_desc: e.target.value }))} />
                      </div>
                      <div>
                        <label className="ypl-label">Quality</label>
                        <input className="ypl-input" value={form.quality || ""} onChange={e => setForm(f => ({ ...f, quality: e.target.value }))} />
                      </div>
                      <div>
                        <label className="ypl-label">Firm</label>
                        <input className="ypl-input" value={form.firm || ""} onChange={e => setForm(f => ({ ...f, firm: e.target.value }))} placeholder="VP TEX / YARN INDIA / SYNTHETIC" />
                      </div>

                      <div>
                        <label className="ypl-label">Transport Name</label>
                        <input className="ypl-input" value={form.transport_name || ""} onChange={e => setForm(f => ({ ...f, transport_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="ypl-label">Vehicle No</label>
                        <input className="ypl-input" value={form.vehicle_no || ""} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))} />
                      </div>
                      <div>
                        <label className="ypl-label">Prepared By</label>
                        <input className="ypl-input" value={form.prepared_by || ""} onChange={e => setForm(f => ({ ...f, prepared_by: e.target.value }))} />
                      </div>

                      {/* ── Billing (left) / Delivery (right) — address, pincode/state, country, GST ── */}
                      <div className="ypl-addr-grid">
                        <div className="ypl-addr-col">
                          <div>
                            <label className="ypl-label">Billing Address {orderLoading && "(loading…)"}</label>
                            <textarea
                              className="ypl-textarea"
                              rows={3}
                              value={form.billing_address || ""}
                              onChange={e => setForm(f => ({ ...f, billing_address: e.target.value }))}
                              placeholder="Autofills from Customer Order"
                            />
                          </div>
                          <div className="ypl-addr-subrow">
                            <div>
                              <label className="ypl-label">Pincode</label>
                              <input className="ypl-input" value={form.billing_pincode || ""} onChange={e => setForm(f => ({ ...f, billing_pincode: e.target.value }))} />
                            </div>
                            <div>
                              <label className="ypl-label">State</label>
                              <input className="ypl-input" value={form.billing_state || ""} onChange={e => setForm(f => ({ ...f, billing_state: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="ypl-label">Country</label>
                            <input className="ypl-input" value={form.billing_country || ""} onChange={e => setForm(f => ({ ...f, billing_country: e.target.value }))} />
                          </div>
                          <div>
                            <label className="ypl-label">GST No</label>
                            <input className="ypl-input" value={form.billing_gst || ""} onChange={e => setForm(f => ({ ...f, billing_gst: e.target.value }))} />
                          </div>
                        </div>

                        <div className="ypl-addr-col">
                          <div>
                            <label className="ypl-label">Delivery Address {orderLoading && "(loading…)"}</label>
                            <textarea
                              className="ypl-textarea"
                              rows={3}
                              value={form.delivery_address || ""}
                              onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                              placeholder="Autofills from Customer Order"
                            />
                          </div>
                          <div className="ypl-addr-subrow">
                            <div>
                              <label className="ypl-label">Pincode</label>
                              <input className="ypl-input" value={form.delivery_pincode || ""} onChange={e => setForm(f => ({ ...f, delivery_pincode: e.target.value }))} />
                            </div>
                            <div>
                              <label className="ypl-label">State</label>
                              <input className="ypl-input" value={form.delivery_state || ""} onChange={e => setForm(f => ({ ...f, delivery_state: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="ypl-label">Country</label>
                            <input className="ypl-input" value={form.delivery_country || ""} onChange={e => setForm(f => ({ ...f, delivery_country: e.target.value }))} />
                          </div>
                          <div>
                            <label className="ypl-label">GST No</label>
                            <input className="ypl-input" value={form.delivery_gst || ""} onChange={e => setForm(f => ({ ...f, delivery_gst: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ypl-section-head">Pick Yarn Stock Lots</div>
                    <StockLotPicker countDesc={form.count_desc} selectedIds={selectedStockIds} onAdd={addLotToForm} />

                    <table className="ypl-item-table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}>#</th>
                          <th>Lot No</th>
                          <th>Supplier</th>
                          <th className="right">Received KGS</th>
                          <th className="right">Packed KGS</th>
                          <th style={{ width: 30 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.items || []).length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", padding: 14 }}>No lots added yet.</td></tr>
                        ) : (form.items || []).map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ color: "#94a3b8" }}>{idx + 1}</td>
                            <td className="ypl-mono">{it.lot_no || "—"}</td>
                            <td>{it.supplier_name || "—"}</td>
                            <td className="right ypl-mono">{fmt(it.received_kgs)}</td>
                            <td className="right">
                              <input className="ypl-iinput" type="number" step="0.01" value={it.packed_kgs}
                                onChange={e => updateItem(idx, { packed_kgs: parseFloat(e.target.value) || 0 })} />
                            </td>
                            <td>
                              <button className="ypl-del-row-btn" onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="ypl-total-section">
                      <div className="ypl-total-item"><span className="ypl-total-label">Lots</span><span className="ypl-total-val">{(form.items || []).length}</span></div>
                      <div className="ypl-total-item"><span className="ypl-total-label">Total Packed KGS</span><span className="ypl-total-val">{fmt(totals.kgs)} KGS</span></div>
                    </div>
                  </div>

                  <div className="ypl-modal-footer">
                    <button className="ypl-cancel-btn" onClick={handleClose}>Cancel</button>
                    <button className="ypl-save-btn" onClick={handleSave} disabled={saving}>
                      {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "💾 Save Packing List"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* DELETE CONFIRM */}
        {deleteTarget && (
          <div className="ypl-confirm-overlay">
            <div className="ypl-confirm-box">
              <AlertCircle size={36} color="#dc2626" />
              <p className="ypl-confirm-title">Delete Packing List?</p>
              <p className="ypl-confirm-sub">This will permanently delete <strong>{deleteTarget.pl_no}</strong> and release its lots back to available stock.</p>
              <div className="ypl-confirm-actions">
                <button className="ypl-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="ypl-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
                  {deleteConfirming ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONVERT TO INVOICE CONFIRM */}
        {convertTarget && (
          <div className="ypl-confirm-overlay">
            <div className="ypl-confirm-box">
              {convertResult ? (
                convertResult.invoice_no ? (
                  <>
                    <CheckCircle2 size={36} color="#166534" />
                    <p className="ypl-confirm-title">Converted!</p>
                    <p className="ypl-confirm-sub">Yarn Invoice <strong>{convertResult.invoice_no}</strong> created from <strong>{convertTarget.pl_no}</strong>.</p>
                    <div className="ypl-confirm-actions">
                      <button className="ypl-confirm-ok" onClick={() => setConvertTarget(null)}>Done</button>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle size={36} color="#dc2626" />
                    <p className="ypl-confirm-title">Conversion Failed</p>
                    <p className="ypl-confirm-sub">Could not convert {convertTarget.pl_no} to an invoice. Please try again.</p>
                    <div className="ypl-confirm-actions">
                      <button className="ypl-confirm-cancel" onClick={() => setConvertTarget(null)}>Close</button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <FileOutput size={36} color="#c2410c" />
                  <p className="ypl-confirm-title">Convert to Yarn Invoice?</p>
                  <p className="ypl-confirm-sub">This creates an invoice from <strong>{convertTarget.pl_no}</strong> ({fmt(convertTarget.total_kgs || 0)} KGS, {convertTarget.total_pieces ?? convertTarget.items?.length ?? 0} lots). This action can't be undone.</p>
                  <div className="ypl-confirm-actions">
                    <button className="ypl-confirm-cancel" onClick={() => setConvertTarget(null)}>Cancel</button>
                    <button className="ypl-confirm-ok" disabled={converting} onClick={handleConvertConfirm}>
                      {converting ? "Converting…" : "Yes, Convert"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}