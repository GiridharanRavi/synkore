// @ts-nocheck
// frontend/src/pages/admin/FabricPackingList.tsx
//
// STATUS FLOW:
//   Create Packing List  → status = "finalized"  → badge "Open"
//   Convert to Invoice   → status = "invoiced"    → badge "Converted"
//   Invoice fully done   → status = "completed"   → badge "Completed"
//     (set by fabricInvoiceRoutes.js when an invoice referencing this PL No
//      is created)
//
// "Pick Fabric Stock Pieces" is split into TWO separate sections:
//   1. INWARD STOCK  — fabric stock that came in against the selected
//      Customer Order (Purchase Inward). Driven by the order's Sort No,
//      with a checkbox to widen the search to all unpacked inward stock.
//      Empty / shows a prompt until a Customer Order has been selected.
//   2. MANUAL STOCK   — fabric stock added directly via Fabric Stock →
//      "+ Add In-Stock" (badged "Manual" on the Fabric Stock page).
//      INDEPENDENT of the selected Customer Order — any unpacked manual
//      entry can be added to any packing list — with its own search box
//      + optional "match this Sort No" filter.
//
//   Both sections add into the SAME `form.items` array via the same
//   addPieceToForm() — a manually-picked piece flows into the packing
//   list exactly the same way an inward piece does (fpi_item_id still
//   points at the stock row's id either way).
//
//   Backend: GET /fabric-packing-list/available-stock returns
//   `inward_pieces` and `manual_pieces` as two separate arrays (plus a
//   legacy combined `pieces` field) — see fabricPackingListRoutes.js,
//   which is powered by the consolidated fabric-stock.js module (single
//   source of truth for both inward and manual stock — see that file for
//   why "Manual Stock" wasn't showing up before).
//
// COMPANY / PRINT-HEADER SELECTION:
//   The "Company (Print Header)" field is a search-select dropdown driven
//   by Company Details Master (`GET /api/company-details`, already loaded
//   into `companyRows` for the print function). Picking a company sets
//   `form.company_id` (exact match, used first) and `form.firm` (the
//   legacy AE/AEF text code, kept for backward compatibility with older
//   Packing Lists that only ever stored that field). A live "Header
//   Address Preview" shows exactly what will print at the top of the
//   Packing List — logo, address, GST, phone/e-mail — resolved the same
//   way doPrintPackingList() resolves it, so there are no surprises at
//   print time. See findCompanyRecord()/getCompanyInfo() below.
//
// ─────────────────────────────────────────────────────────────────────────
// CHANGED (THIS REVISION):
//
//   The Company (Print Header) dropdown is now FILTERED by the selected
//   Customer Order's firm (AE / AEF). Each Customer Order already carries
//   its own firm code (`snap.firm`, returned by getOrderSnapshotForPacking
//   — this is exactly the same field the old auto-match logic used), and
//   each row in Company Details Master carries a `firm` field too. So if
//   you've set up e.g. 3 companies under firm "AE" and 2 under firm
//   "AEF", selecting a Customer Order whose firm is "AE" now narrows the
//   Company search-select down to just those 3 — the AEF companies are
//   hidden until you pick an order that's firm "AEF".
//
//   New state: `orderFirm` (separate from `form.firm`, which continues to
//   mean "the firm of whichever company is currently selected"). This
//   keeps the two concepts cleanly separate:
//     • orderFirm  = which firm the currently-selected Customer Order
//                    belongs to (drives the dropdown filter only, never
//                    sent to the backend).
//     • form.firm  = the firm of the company actually chosen for the
//                    print header (unchanged legacy field, persisted).
//
//   Behaviour:
//     • Selecting a Customer Order sets orderFirm = snap.firm and filters
//       the Company dropdown to that firm. If a company was already
//       picked and its firm no longer matches the new order's firm, the
//       pick is cleared (form.company_id / form.firm reset to empty) so
//       you're never left with a mismatched combination — you just
//       re-pick from the now-filtered list.
//     • If the already-picked company's firm DOES still match the new
//       order, it's left alone (same "never overwrite a deliberate pick"
//       behaviour as before).
//     • Clearing the Customer Order clears orderFirm too, and the
//       dropdown goes back to showing every company (unfiltered) — same
//       as "Manual Stock" being independent of the order.
//     • Editing an existing Packing List seeds orderFirm from the loaded
//       record's own `firm` field (best-effort — it's just a client-side
//       filter convenience, so this doesn't require a backend change or
//       a live order re-fetch).
//     • A small hint under the "Company (Print Header)" label shows which
//       firm the dropdown is currently filtered to, and the dropdown's
//       empty state explains *why* it's empty (no companies exist for
//       that firm yet) instead of just looking broken.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, Loader2, AlertCircle, CheckCircle2, MoreVertical,
  Printer, Trash2, PenLine, FileOutput, ChevronDown, ChevronUp, PlusCircle,
  Download, FileSpreadsheet, FileText, ArrowRight, PackageSearch, PackagePlus,
  Building2,
} from "lucide-react";

import {
  getFabricPackingLists,
  getFabricPackingListById,
  createFabricPackingList,
  updateFabricPackingList,
  deleteFabricPackingList,
  convertPackingListToInvoice,
  getNextPlNo,
  getOrderSnapshotForPacking,
  getAvailableFabricStock,
  PackingListPayload,
  PackingListItem,
  FabricStockPiece,
  OrderSnapshot,
} from "../../api/services";

// ─── Customer order list loader ─────────────────────────────────────────────
import * as OrdersAPI from "../../api/services";

const CUSTOMER_ORDER_FN_CANDIDATES = [
  "getCustomerOrders",
  "getCustomerOrderList",
  "getAllCustomerOrders",
  "getOrders",
  "fetchCustomerOrders",
  "listCustomerOrders",
  "getOrderBookings",
  "getCustomerOrder",
];

function resolveCustomerOrdersFn(): (() => Promise<any>) | null {
  for (const name of CUSTOMER_ORDER_FN_CANDIDATES) {
    const fn = (OrdersAPI as any)[name];
    if (typeof fn === "function") return fn;
  }
  return null;
}

// ─── Company Details Master integration ─────────────────────────────────
const COMPANY_API = "/api/company-details";

interface CompanyRecord {
  id?: number;
  company_code?: string;
  firm?: string; // "AE" | "AEF" | ""
  company_name?: string;
  logo_path?: string | null;
  address?: string;
  works_address?: string;
  regd_office?: string;
  pin_code?: string;
  district?: string;
  state?: string;
  country?: string;
  gst_no?: string;
  pan_no?: string;
  email?: string;
  contact_no?: string;
  status?: string;
}

const FALLBACK_COMPANY_INFO = {
  name: "SYNKORE TECH",
  logo: "",
  address: "364/43, Kolathu Kadu, 4th Street Agraharam Post Pallipalayam",
  pin: "Namakkal-638008",
  gst: "TODO GSTIN",
  phone: "+91 81108 14250 | +91 90957 23186",
  email: "abhayanexport2019@gmail.com",
};

type PrintCompanyInfo = {
  name: string;
  logo: string;
  address: string;
  pin: string;
  gst: string;
  phone: string;
  email: string;
};

function sanitizeAddressText(raw?: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^address\s*:?\s*/i, "");
  s = s.replace(/\bGST\b[\s\S]*$/i, "");
  s = s.replace(/[,\s]+$/, "").trim();
  return s;
}

function sanitizePinText(raw?: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^pin(code)?\s*:?\s*/i, "");
  s = s.replace(/\bGST\b[\s\S]*$/i, "");
  s = s.replace(/[,\s]+$/, "").trim();
  return s;
}

function sanitizeGstText(raw?: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^gst\s*(in|no\.?)?\s*:?\s*/i, "");
  s = s.split(",")[0].trim();
  return s;
}

// Resolves which Company Details Master row should be used for a given
// Packing List / form. Priority:
//   1. Exact `id` match — set when the user explicitly picks a company
//      from the Company search-select in the PL form.
//   2. Legacy `firm` code match (AE/AEF) — for older Packing Lists that
//      only ever stored that text field, or if the user typed a firm
//      code without picking from the dropdown.
//   3. Whichever company is marked Active, else the first row.
function findCompanyRecord(
  opts: { id?: number | null; firm?: string },
  companyRows: CompanyRecord[]
): CompanyRecord | undefined {
  if (opts.id) {
    const byId = companyRows.find(c => c.id === opts.id);
    if (byId) return byId;
  }
  const wantFirm = (opts.firm || "").trim().toUpperCase();
  if (wantFirm) {
    const byFirm = companyRows.find(c => (c.firm || "").trim().toUpperCase() === wantFirm);
    if (byFirm) return byFirm;
  }
  if (companyRows.length > 0) {
    return companyRows.find(c => (c.status || "Active") === "Active") || companyRows[0];
  }
  return undefined;
}

function getCompanyInfo(
  opts: { id?: number | null; firm?: string },
  companyRows: CompanyRecord[]
): PrintCompanyInfo {
  const match = findCompanyRecord(opts, companyRows);

  if (!match) return { ...FALLBACK_COMPANY_INFO };

  const address = sanitizeAddressText(match.address) || FALLBACK_COMPANY_INFO.address;

  const cleanPinCode = sanitizePinText(match.pin_code);
  const pin = [
    cleanPinCode ? `PIN: ${cleanPinCode}` : "",
    match.state || "",
    match.country || "",
  ].filter(Boolean).join(", ");

  const gst = sanitizeGstText(match.gst_no) || FALLBACK_COMPANY_INFO.gst;

  const phone = match.contact_no || FALLBACK_COMPANY_INFO.phone;
  const email = match.email || FALLBACK_COMPANY_INFO.email;

  return {
    name: match.company_name || FALLBACK_COMPANY_INFO.name,
    logo: match.logo_path ? `${COMPANY_API}/logo/${match.logo_path}` : "",
    address,
    pin,
    gst,
    phone,
    email,
  };
}

// ─── Utilities ──────────────────────────────────────────────────────────
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
  finalized: { label: "Open",      bg: "#e0e7ff", color: "#4338ca" },
  invoiced:  { label: "Converted", bg: "#fef9c3", color: "#92400e" },
  completed: { label: "Completed", bg: "#dcfce7", color: "#166534" },
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

// ─── Print ───────────────────────────────────────────────────────────────
function doPrintPackingList(pl: PackingListPayload, companyRows: CompanyRecord[]) {
  if (!pl) {
    alert("Could not load this Packing List for printing. Please try again.");
    return;
  }

  const co = getCompanyInfo({ id: (pl as any).company_id, firm: pl.firm }, companyRows);
  const rows = (pl.items || []).map((it, i) => `
    <tr class="${i % 2 === 0 ? "" : "alt"}">
      <td class="center">${i + 1}</td>
      <td class="center">${it.piece_no || "—"}</td>
      <td class="center">${it.new_piece_no || it.piece_no || "—"}</td>
      <td class="right">${fmt(it.meter)}</td>
      <td class="right">${fmt(it.gross_wt)}</td>
      <td class="right">${fmt(it.net_wt)}</td>
    </tr>`).join("");

  const billBlock = fullAddressBlock(pl.billing_address, pl.billing_pincode, pl.billing_state, pl.billing_country);
  const delBlock  = fullAddressBlock(pl.delivery_address, pl.delivery_pincode, pl.delivery_state, pl.delivery_country);
  const qrData = encodeURIComponent(`PL:${pl.pl_no} | Order:${pl.order_code || ""}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${qrData}`;
const logoBlock = co.logo
    ? `<img src="${co.logo}" alt="logo" onerror="this.outerHTML='<div class=&quot;logo-fallback&quot;><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>'" />`
    : `<div class="logo-fallback"><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>`;

  const win = window.open("", "_blank", "width=950,height=1100");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${pl.pl_no} — Packing List</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Times New Roman', Times, serif; font-size:12.5px; color:#1e293b; padding:22px 26px; }
  .box { border:1.5px solid #1e293b; }
  .co-head { display:flex; align-items:center; gap:16px; padding:14px 18px; border-bottom:1.5px solid #1e293b; }
  .co-head-logo { flex:0 0 auto; width:78px; display:flex; justify-content:center; }
  .co-head-logo img { width:70px; height:70px; object-fit:contain; display:block; }
  .logo-fallback { width:78px; height:60px; border-radius:10px; background:#0f7a3d; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:22px; letter-spacing:.04em; }
  .co-head-info { flex:1; text-align:center; }
  .co-head-info h1 { font-size:23px; font-weight:800; color:#0f7a3d; letter-spacing:.02em; margin-bottom:6px; text-align:center; }
  .co-head-info .addr-block { display:inline-block; text-align:left; }
  .co-head-info .addr-block p { font-size:12.5px; color:#1e293b; line-height:1.42; margin:0 0 2px; }
  .co-head-info .addr-block p:last-child { margin-bottom:0; }
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
  tr.alt td { background:#f8fafc; }
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
          <p><b>GST No:</b> ${co.gst}</p>
          <p>Ph: ${co.phone}${co.email ? `, E-mail: ${co.email}` : ""}</p>
        </div>
      </div>
      <div class="co-head-qr"><img src="${qrSrc}" alt="QR" /></div>
    </div>
    <div class="title-bar">PACKING LIST</div>
    <div class="meta-row">
      <div class="meta-cell"><b>Order No</b> : ${pl.order_code || "—"}<br/><b>Sort No</b> : ${pl.sort_no || "—"}</div>
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
          <th colspan="2">Piece No</th>
          <th class="right" style="width:100px">Meter</th>
          <th class="right" style="width:100px">Gross Wt</th>
          <th class="right" style="width:100px">Net Wt</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total</td>
          <td class="right">${fmt(pl.total_meter || 0)}</td>
          <td class="right">${fmt(pl.total_gross_wt || 0)}</td>
          <td class="right">${fmt(pl.total_net_wt || 0)}</td>
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

// ─── Row action menu (⋮) ─────────────────────────────────────────────────

const ROW_MENU_WIDTH = 220;
const ROW_MENU_HEIGHT = 190;

function RowMenu({ pl, onPrint, onEdit, onConvert, onDelete }: {
  pl: PackingListPayload;
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

  const alreadyInvoiced = pl.status === "invoiced" || pl.status === "completed";
  const convertLabel =
    pl.status === "completed" ? `Completed (${pl.invoice_no || "—"})`
    : pl.status === "invoiced" ? `Converted (${pl.invoice_no || "—"})`
    : "Convert to Fabric Invoice";

  return (
    <>
      <button ref={btnRef} className="fpl-dots-btn" onClick={toggleOpen}>
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fpl-row-menu"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: ROW_MENU_WIDTH }}
        >
          <button className="fpl-row-menu-item" onClick={() => { onPrint(); setOpen(false); }}>
            <Printer size={14} color="#2563eb" /> Print Packing List
          </button>
          <button className="fpl-row-menu-item" onClick={() => { onEdit(); setOpen(false); }}>
            <PenLine size={14} color="#4338ca" /> Edit
          </button>
          <button
            className="fpl-row-menu-item"
            disabled={alreadyInvoiced}
            style={alreadyInvoiced ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => { if (!alreadyInvoiced) { onConvert(); setOpen(false); } }}
          >
            <FileOutput size={14} color="#166534" />
            {convertLabel}
          </button>
          <div className="fpl-row-menu-sep" />
          <button className="fpl-row-menu-item fpl-row-menu-item--danger" onClick={() => { onDelete(); setOpen(false); }}>
            <Trash2 size={14} color="#dc2626" /> Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Export menu ─────────────────────────────────────────────────────────
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
      <button className="fpl-export-btn" onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="fpl-export-menu" style={{ width: EXPORT_MENU_WIDTH }}>
          <button className="fpl-row-menu-item" onClick={() => { onExportCsv(); setOpen(false); }}>
            <FileSpreadsheet size={14} color="#166534" /> Export as CSV
          </button>
          <button className="fpl-row-menu-item" onClick={() => { onExportPrintAll(); setOpen(false); }}>
            <FileText size={14} color="#2563eb" /> Print / PDF (current page)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── OrderSearchSelect ────────────────────────────────────────────────────
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
          className="fpl-input"
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
        <div className="fpl-dropdown">
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              {loading ? "Loading…" : "No orders found"}
            </div>
          ) : filtered.slice(0, 50).map(o => (
            <button key={o.id} type="button" className="fpl-dropdown-item"
              onClick={() => { setQuery(orderLabel(o)); setOpen(false); onSelect(o); }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "#4338ca", fontSize: 13 }}>{orderLabel(o)}</span>
              <span style={{ color: "#64748b", fontSize: 12, marginLeft: 10 }}>{custLabel(o)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CompanySearchSelect ────────────────────────────────────────────────
// Search-select dropdown sourced from Company Details Master (`options`,
// already loaded for the print header — and now pre-filtered by the
// selected Customer Order's firm before it ever reaches this component,
// see filteredCompanyRows in the main component below). Lets the user
// pick which company record drives the printed Packing List header,
// instead of typing a raw "AE / AEF" firm code by hand.
//
// `emptyHint` lets the caller explain *why* the list is empty (e.g. "no
// companies exist yet for firm AEF") instead of a generic message — this
// matters now that the list can legitimately be filtered down to zero.
function CompanySearchSelect({ value, options, emptyHint, onSelect }: {
  value: string; options: CompanyRecord[]; emptyHint?: string; onSelect: (c: CompanyRecord | null) => void;
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

  const q = (query ?? "").toLowerCase();
  const filtered = options.filter(c =>
    (c.company_name || "").toLowerCase().includes(q) ||
    (c.company_code || "").toLowerCase().includes(q) ||
    (c.firm || "").toLowerCase().includes(q)
  );

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Building2 size={13} style={{ position: "absolute", left: 10, color: "#94a3b8", pointerEvents: "none" }} />
        <input
          className="fpl-input"
          type="text"
          placeholder="Search company name, code or firm…"
          value={query ?? ""}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ paddingLeft: 30, paddingRight: 30 }}
        />
        <ChevronDown size={14} style={{ position: "absolute", right: 10, color: "#94a3b8", pointerEvents: "none" }} />
      </div>
      {open && (
        <div className="fpl-dropdown">
          {options.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              {emptyHint || "No companies found in Company Details Master."}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              No matching companies.
            </div>
          ) : (
            filtered.slice(0, 50).map(c => (
              <button
                key={c.id}
                type="button"
                className="fpl-dropdown-item"
                onClick={() => { setQuery(c.company_name || ""); setOpen(false); onSelect(c); }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>{c.company_name || "—"}</span>
                  {c.firm ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef9c3", borderRadius: 6, padding: "1px 7px", whiteSpace: "nowrap" }}>{c.firm}</span>
                  ) : null}
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                  {c.company_code || ""}{c.gst_no ? ` · GST ${c.gst_no}` : ""}
                </div>
              </button>
            ))
          )}
          <button
            type="button"
            className="fpl-dropdown-item"
            style={{ color: "#dc2626", fontSize: 12, fontWeight: 600, textAlign: "center" }}
            onClick={() => { setQuery(""); setOpen(false); onSelect(null); }}
          >
            ✕ Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared stock-row rendering (used by both picker sections) ─────────────
type StockSource = "inward" | "manual";

function StockRow({ p, already, source, onAdd }: {
  p: FabricStockPiece; already: boolean; source: StockSource; onAdd: (p: FabricStockPiece) => void;
}) {
  return (
    <div className="fpl-picker-row">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="fpl-mono" style={{ fontWeight: 700, color: "#4338ca" }}>{p.piece_no || p.new_piece_no || `#${p.id}`}</span>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>
          {source === "manual" ? (p.fpi_no || "Manual Entry") : p.fpi_no} · Sort {p.sort_no || "—"}
        </span>
        {p.construction ? (
          <span style={{ color: "#7c3aed", fontSize: 11, fontWeight: 600, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6, padding: "1px 7px" }}>
            Quality: {p.construction}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="fpl-mono" style={{ fontSize: 12, color: "#374151" }}>{fmt(p.meter)} M</span>
        <button
          type="button"
          className="fpl-add-piece-btn"
          disabled={already}
          onClick={() => onAdd(p)}
        >
          {already ? "Added" : "+ Add"}
        </button>
      </div>
    </div>
  );
}

// ─── SECTION 1: Inward Stock (driven by the selected Customer Order) ───────
function InwardStockSection({ orderSelected, sortNo, selectedIds, onAdd }: {
  orderSelected: boolean; sortNo?: string; selectedIds: Set<number>; onAdd: (piece: FabricStockPiece) => void;
}) {
  const [pieces, setPieces]   = useState<FabricStockPiece[]>([]);
  const [meta, setMeta]       = useState<{
    total_unpacked: number;
    requested_sort_no: string | null;
    sort_no_found_in_stock: boolean | null;
    available_sort_nos?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [onlyThisSort, setOnlyThisSort] = useState(true);

  const load = useCallback(async () => {
    if (!orderSelected) { setPieces([]); setMeta(null); return; }
    setLoading(true);
    try {
      const res = await getAvailableFabricStock({
        sort_no: onlyThisSort && sortNo ? sortNo : undefined,
        search: search || undefined,
      });
      const body = res?.data ?? res;
      // Backend returns `inward_pieces` / `manual_pieces` separately. Fall
      // back to filtering the legacy combined `pieces` field by source for
      // older backends that haven't been updated yet.
      if (Array.isArray(body)) {
        setPieces(body.filter((p: any) => p.source !== "manual"));
        setMeta(null);
      } else if (body?.inward_pieces) {
        setPieces(body.inward_pieces);
        setMeta({
          total_unpacked: body?.total_inward ?? body?.total_unpacked ?? 0,
          requested_sort_no: body?.requested_sort_no ?? null,
          sort_no_found_in_stock: body?.sort_no_found_in_stock ?? null,
          available_sort_nos: body?.available_sort_nos,
        });
      } else {
        const all = body?.pieces || [];
        setPieces(all.filter((p: any) => p.source !== "manual"));
        setMeta({
          total_unpacked: body?.total_unpacked ?? 0,
          requested_sort_no: body?.requested_sort_no ?? null,
          sort_no_found_in_stock: body?.sort_no_found_in_stock ?? null,
          available_sort_nos: body?.available_sort_nos,
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [orderSelected, sortNo, onlyThisSort, search]);

  useEffect(() => { load(); }, [load]);

  const showSortMismatchHint =
    !loading && pieces.length === 0 && meta &&
    meta.requested_sort_no && meta.sort_no_found_in_stock === false &&
    meta.total_unpacked > 0;

  const showTrulyEmptyHint =
    !loading && pieces.length === 0 && meta && meta.total_unpacked === 0;

  return (
    <div className="fpl-picker">
      <div className="fpl-picker-section-title">
        <PackageSearch size={14} /> Inward Stock <span className="fpl-picker-section-hint">(from Customer Order)</span>
      </div>
      {!orderSelected ? (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>
          Select a Customer Order above to search its Inward fabric stock.
        </div>
      ) : (
        <>
          <div className="fpl-picker-toolbar">
            <div className="fpl-search-wrap" style={{ maxWidth: 260 }}>
              <Search size={13} />
              <input className="fpl-search" placeholder="Search piece / FPI no…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {sortNo && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
                <input type="checkbox" checked={onlyThisSort} onChange={e => setOnlyThisSort(e.target.checked)} />
                Only Sort No {sortNo}
              </label>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{pieces.length} available</span>
          </div>
          <div className="fpl-picker-list">
            {loading ? (
              <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /></div>
            ) : pieces.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                {showSortMismatchHint ? (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      No unpacked Inward stock for Sort No <strong>{meta.requested_sort_no}</strong>.
                    </div>
                    {meta.available_sort_nos && meta.available_sort_nos.length > 0 ? (
                      <div style={{ fontSize: 12 }}>
                        Sort numbers currently in unpacked Inward stock:{" "}
                        <span style={{ fontFamily: "'DM Mono',monospace", color: "#4338ca" }}>
                          {meta.available_sort_nos.join(", ")}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12 }}>
                        Uncheck "Only Sort No" above to see all {meta.total_unpacked} unpacked Inward piece(s).
                      </div>
                    )}
                  </>
                ) : showTrulyEmptyHint ? (
                  "No unpacked Inward fabric stock exists yet — inward some stock via Fabric Stock first."
                ) : (
                  "No unpacked Inward stock pieces found."
                )}
              </div>
            ) : pieces.map(p => (
              <StockRow key={p.id} p={p} already={selectedIds.has(p.id)} source="inward" onAdd={onAdd} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SECTION 2: Manual Stock (independent of the Customer Order) ───────────
function ManualStockSection({ sortNo, selectedIds, onAdd }: {
  sortNo?: string; selectedIds: Set<number>; onAdd: (piece: FabricStockPiece) => void;
}) {
  const [pieces, setPieces]   = useState<FabricStockPiece[]>([]);
  const [totalManual, setTotalManual] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [matchSort, setMatchSort] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAvailableFabricStock({
        sort_no: matchSort && sortNo ? sortNo : undefined,
        search: search || undefined,
      });
      const body = res?.data ?? res;
      if (Array.isArray(body)) {
        setPieces(body.filter((p: any) => p.source === "manual"));
        setTotalManual(body.filter((p: any) => p.source === "manual").length);
      } else if (body?.manual_pieces) {
        setPieces(body.manual_pieces);
        setTotalManual(body?.total_manual ?? body.manual_pieces.length);
      } else {
        const all = body?.pieces || [];
        const manualOnly = all.filter((p: any) => p.source === "manual" || Number(p.id) >= 1000000000);
        setPieces(manualOnly);
        setTotalManual(manualOnly.length);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [sortNo, matchSort, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fpl-picker" style={{ marginTop: 14 }}>
      <div className="fpl-picker-section-title fpl-picker-section-title--manual">
        <PackagePlus size={14} /> Manual Stock <span className="fpl-picker-section-hint">(added via Fabric Stock → + Add In-Stock, any Sort No)</span>
      </div>
      <div className="fpl-picker-toolbar">
        <div className="fpl-search-wrap" style={{ maxWidth: 260 }}>
          <Search size={13} />
          <input className="fpl-search" placeholder="Search piece / ref no…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {sortNo && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={matchSort} onChange={e => setMatchSort(e.target.checked)} />
            Match Sort No {sortNo}
          </label>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{pieces.length} available</span>
      </div>
      <div className="fpl-picker-list">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : pieces.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {totalManual === 0
              ? "No unpacked Manual stock exists yet — add one via Fabric Stock → + Add In-Stock."
              : "No Manual stock pieces match this search/filter."}
          </div>
        ) : pieces.map(p => (
          <StockRow key={p.id} p={p} already={selectedIds.has(p.id)} source="manual" onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function FabricPackingList({
  onNavigateToInvoice,
}: {
  onNavigateToInvoice?: (payload: { pl_no: string; invoice_no: string; order_id?: number | null }) => void;
} = {}) {
  const [lists, setLists]   = useState<PackingListPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const LIMIT = 10;

  const [orderOptions, setOrderOptions] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersFnMissing, setOrdersFnMissing] = useState(false);

  const [companyRows, setCompanyRows] = useState<CompanyRecord[]>([]);

  // Which firm (AE / AEF / …) the currently-selected Customer Order
  // belongs to. Drives the Company (Print Header) dropdown filter below.
  // Deliberately kept OUT of `form` / PackingListPayload — it's a
  // client-side filter convenience only, never sent to the backend (so
  // it can't collide with a column that doesn't exist on
  // fabric_packing_lists). See the revision note at the top of this file.
  const [orderFirm, setOrderFirm] = useState<string>("");

  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit]       = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<PackingListPayload>(emptyForm());
  const [plGenerating, setPlGenerating] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedCode, setSavedCode] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<PackingListPayload | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const [convertTarget, setConvertTarget] = useState<PackingListPayload | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{ invoice_no: string; error?: string } | null>(null);

  const width = useWidth();

  function emptyForm(): PackingListPayload {
    return {
      pl_no: "", pl_date: today(),
      order_id: null, order_code: "", sort_no: "", quality: "",
      customer_id: null, customer_name: "",
      billing_address: "", billing_pincode: "", billing_state: "", billing_country: "", billing_gst: "",
      delivery_name: "",
      delivery_address: "", delivery_pincode: "", delivery_state: "", delivery_country: "", delivery_gst: "",
      transport_name: "", vehicle_no: "", firm: "",
      // company_id: exact Company Details Master row picked via the new
      // Company search-select. Client-side convenience field only — see
      // findCompanyRecord()/getCompanyInfo() for how it's resolved and
      // note under the header preview about persistence.
      company_id: null,
      prepared_by: "", remarks: "",
      items: [],
      status: "finalized",
    };
  }

  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFabricPackingLists();
      setLists((res?.data ?? res) || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch(`${COMPANY_API}?page=1&limit=200`);
      if (!res.ok) return;
      const data = await res.json();
      setCompanyRows((data?.data ?? data) || []);
    } catch (err) {
      console.error("FabricPackingList: failed to load Company Details Master for print header:", err);
    }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  useEffect(() => {
    const onFocus = () => { fetchLists(); fetchCompanies(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { fetchLists(); fetchCompanies(); }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchLists, fetchCompanies]);

  useEffect(() => {
    const hasPending = lists.some(pl => pl.status === "invoiced");
    if (!hasPending) return;
    const id = setInterval(() => { fetchLists(); }, 20000);
    return () => clearInterval(id);
  }, [lists, fetchLists]);

  useEffect(() => {
    (async () => {
      const fn = resolveCustomerOrdersFn();
      if (!fn) {
        console.error(
          "FabricPackingList: no customer-orders loader found in api/services.ts. " +
          "Tried:", CUSTOMER_ORDER_FN_CANDIDATES,
          "— add the real export name to CUSTOMER_ORDER_FN_CANDIDATES in FabricPackingList.tsx."
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

  const totals = useMemo(() => {
    const items = form.items || [];
    return items.reduce((acc, it) => {
      acc.meter += Number(it.meter) || 0;
      acc.gross_wt += Number(it.gross_wt) || 0;
      acc.net_wt += Number(it.net_wt) || 0;
      return acc;
    }, { meter: 0, gross_wt: 0, net_wt: 0 });
  }, [form.items]);

  const selectedStockIds = useMemo(
    () => new Set((form.items || []).map(i => i.fpi_item_id).filter(Boolean) as number[]),
    [form.items]
  );

  // The company currently selected in the form (by exact id), used to
  // seed the CompanySearchSelect's display text.
  const selectedCompany = useMemo(
    () => companyRows.find(c => c.id === (form as any).company_id) || null,
    [companyRows, (form as any).company_id]
  );
  const selectedCompanyName = selectedCompany?.company_name || "";

  // *** CHANGED (THIS REVISION) ***
  // Companies offered in the "Company (Print Header)" dropdown, narrowed
  // to the selected Customer Order's firm (orderFirm) when one is set.
  // With no Customer Order selected yet (orderFirm === ""), every company
  // is shown — same as before this revision — so the field still works
  // standalone if someone wants to pick a header before picking an order.
  const filteredCompanyRows = useMemo(() => {
    if (!orderFirm) return companyRows;
    const want = orderFirm.trim().toUpperCase();
    return companyRows.filter(c => (c.firm || "").trim().toUpperCase() === want);
  }, [companyRows, orderFirm]);

  // Live preview of what will print at the top of this Packing List —
  // resolved exactly the same way doPrintPackingList() resolves it, so
  // the modal always shows the truth. Uses the FULL companyRows (not the
  // filtered list) since a company already picked/inherited should still
  // preview correctly even in the rare case its firm no longer matches
  // (e.g. right after loading an older record before any cleanup runs).
  const headerPreview = useMemo(
    () => getCompanyInfo({ id: (form as any).company_id, firm: form.firm }, companyRows),
    [(form as any).company_id, form.firm, companyRows]
  );

  const handleNew = async () => {
    setForm(emptyForm());
    setOrderFirm("");
    setIsEdit(false); setEditId(null);
    setSaveError(""); setSavedCode("");
    setShowModal(true);
    setPlGenerating(true);
    try {
      const res = await getNextPlNo();
      const no = (res?.data ?? res)?.pl_no || "";
      setForm(f => ({ ...f, pl_no: no }));
    } catch { /* leave blank, server will generate on save */ }
    finally { setPlGenerating(false); }
  };

  const handleOpenEdit = async (pl: PackingListPayload) => {
    setSaveError(""); setSavedCode("");
    setIsEdit(true); setEditId(pl.id!);
    setShowModal(true);
    try {
      const res = await getFabricPackingListById(pl.id!);
      const data = res?.data ?? res;
      setForm({ ...emptyForm(), ...data, pl_date: (data.pl_date || today()).toString().slice(0, 10) });
      // Best-effort: seed the firm filter from whatever firm this record
      // already carries (either its own `firm` field, or — if that's
      // blank — the picked company's own firm). This is just a client-
      // side filter convenience, so it's fine that it isn't a live
      // re-fetch of the linked order's current firm.
      const seededFirm = data.firm || (data.company_id ? companyRows.find(c => c.id === data.company_id)?.firm : "") || "";
      setOrderFirm(seededFirm);
    } catch {
      setForm({ ...emptyForm(), ...pl });
      setOrderFirm(pl.firm || "");
    }
  };

  const handleClose = () => {
    setShowModal(false); setForm(emptyForm());
    setOrderFirm("");
    setSaveError(""); setSavedCode("");
  };

  const handleOrderSelect = async (order: any | null) => {
    if (!order) {
      setOrderFirm("");
      setForm(f => ({
        ...f, order_id: null, order_code: "", sort_no: "", quality: "",
        customer_id: null, customer_name: "",
        billing_address: "", billing_pincode: "", billing_state: "", billing_country: "", billing_gst: "",
        delivery_name: "",
        delivery_address: "", delivery_pincode: "", delivery_state: "", delivery_country: "", delivery_gst: "",
        transport_name: "", vehicle_no: "",
        // NOTE: Company / firm is intentionally left alone here — the
        // Company selector is independent of the Customer Order (same
        // pattern as Manual Stock), so clearing the order shouldn't wipe
        // out a company the user already picked. Clearing the order also
        // clears orderFirm above, which un-filters the dropdown back to
        // showing every company.
      }));
      return;
    }
    setOrderLoading(true);
    try {
      const res = await getOrderSnapshotForPacking(order.id);
      const snap: OrderSnapshot = res?.data ?? res;

      // The dropdown filter always tracks the newly-selected order's firm,
      // regardless of whether a company was already picked.
      const newFirm = (snap.firm || "").trim().toUpperCase();
      setOrderFirm(snap.firm || "");

      setForm(f => {
        const currentCompanyId = (f as any).company_id as number | null;
        const currentCompanyRow = currentCompanyId
          ? companyRows.find(c => c.id === currentCompanyId)
          : null;
        const currentCompanyStillMatches =
          currentCompanyRow && newFirm &&
          (currentCompanyRow.firm || "").trim().toUpperCase() === newFirm;

        // Keep an existing pick only if it still belongs to the new
        // order's firm (or the order has no firm at all, in which case
        // there's nothing to conflict with). Otherwise clear it — the now
        // firm-filtered dropdown will only offer valid options to re-pick
        // from, so we never end up with a company/firm mismatch.
        const keepExistingCompany = !!currentCompanyId && (!newFirm || currentCompanyStillMatches);
        const autoMatchedCompany = keepExistingCompany
          ? null
          : findCompanyRecord({ firm: snap.firm }, companyRows);

        return {
          ...f,
          order_id: snap.order_id,
          order_code: snap.order_code || order.order_code || order.order_no || "",
          sort_no: snap.sort_no || "",
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
          firm: keepExistingCompany ? f.firm : (snap.firm || ""),
          company_id: keepExistingCompany ? currentCompanyId : (autoMatchedCompany?.id ?? null),
        };
      });
    } catch (err: any) {
      console.error(
        "getOrderSnapshotForPacking failed — Sort No/Quality/Firm/Transport/" +
        "Vehicle/Billing/Delivery (incl. Pincode/State/Country/GST) will stay " +
        "blank until this is fixed:",
        err?.response?.status, err?.response?.data || err?.message
      );
      setOrderFirm("");
      setForm(f => ({
        ...f,
        order_id: order.id,
        order_code: order.order_code || order.order_no || "",
        customer_name: order.customer_name || order.customer || "",
      }));
    } finally { setOrderLoading(false); }
  };

  const addPieceToForm = (piece: FabricStockPiece) => {
    setForm(f => {
      if ((f.items || []).some(i => i.fpi_item_id === piece.id)) return f;
      const newItem: PackingListItem = {
        fpi_item_id: piece.id,
        fpi_id: piece.fpi_id,
        fpi_no: piece.fpi_no,
        sort_no: piece.sort_no,
        construction: piece.construction,
        piece_no: piece.piece_no,
        new_piece_no: piece.new_piece_no,
        meter: piece.meter,
        gross_wt: piece.meter,
        net_wt: piece.meter,
      };
      return { ...f, items: [...(f.items || []), newItem] };
    });
  };
  const removeItem = (idx: number) =>
    setForm(f => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, patch: Partial<PackingListItem>) =>
    setForm(f => {
      const items = [...(f.items || [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...f, items };
    });

  const handleSave = async () => {
    setSaveError("");
    if (!form.order_id) { setSaveError("Select a Customer Order first."); return; }
    if (!form.items || form.items.length === 0) { setSaveError("Add at least one fabric stock piece."); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_meter: totals.meter,
        total_gross_wt: totals.gross_wt,
        total_net_wt: totals.net_wt,
        status: isEdit ? form.status : "finalized",
      };
      if (isEdit && editId) {
        await updateFabricPackingList(editId, payload);
        setSavedCode(form.pl_no);
      } else {
        const res: any = await createFabricPackingList(payload);
        setSavedCode(res?.pl_no ?? res?.data?.pl_no ?? form.pl_no);
      }
      fetchLists();
    } catch (e: any) {
      const serverMsg  = e?.response?.data?.message || e?.response?.data?.sqlMessage;
      const serverCode = e?.response?.data?.code;
      console.error("Save Packing List failed — full server response:", e?.response?.data || e);
      setSaveError(
        serverMsg
          ? `${serverMsg}${serverCode ? ` (${serverCode})` : ""}`
          : (e?.message || "Failed to save packing list.")
      );
    } finally { setSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteConfirming(true);
    try {
      await deleteFabricPackingList(deleteTarget.id!);
      setDeleteTarget(null);
      fetchLists();
    } catch (e: any) {
      console.error("Delete Packing List failed:", e?.response?.data || e?.message);
    }
    finally { setDeleteConfirming(false); }
  };

  const openConvert = async (pl: PackingListPayload) => {
    setConvertResult(null);
    setConvertTarget(pl);
    setConvertLoading(true);
    try {
      const res = await getFabricPackingListById(pl.id!);
      const fresh = (res?.data ?? res) as PackingListPayload;
      setConvertTarget(fresh || pl);
    } catch {
      setConvertTarget(pl);
    } finally {
      setConvertLoading(false);
    }
  };

  const handleConvertConfirm = async () => {
    if (!convertTarget) return;

    if (convertTarget.status === "invoiced" || convertTarget.status === "completed") {
      setConvertResult({
        invoice_no: "",
        error: `This packing list was already converted to invoice ${convertTarget.invoice_no || "—"}.`,
      });
      return;
    }

    setConverting(true);
    try {
      const res: any = await convertPackingListToInvoice(convertTarget.id!);
      const data = res?.data ?? res;
      if (!data?.invoice_no) {
        throw new Error("Server did not return an invoice number.");
      }
      setConvertResult({ invoice_no: data.invoice_no });
      fetchLists();
    } catch (e: any) {
      const serverMsg = e?.response?.data?.message || e?.message || "Failed to convert to invoice.";
      console.error("Convert to invoice failed:", e?.response?.data || e?.message);
      setConvertResult({ invoice_no: "", error: serverMsg });
    } finally {
      setConverting(false);
    }
  };

  const handleGoToInvoice = () => {
    if (!convertTarget || !convertResult?.invoice_no) return;
    onNavigateToInvoice?.({
      pl_no: convertTarget.pl_no,
      invoice_no: convertResult.invoice_no,
      order_id: convertTarget.order_id,
    });
    setConvertTarget(null);
    fetchLists();
  };

  const handlePrintRow = async (pl: PackingListPayload) => {
    try {
      const res = await getFabricPackingListById(pl.id!);
      const data = res?.data ?? res;
      doPrintPackingList(data || pl, companyRows);
    } catch {
      doPrintPackingList(pl, companyRows);
    }
  };

  const handleExportCsv = () => {
    const header = ["S.No", "PL No", "Date", "Order No", "Customer", "Sort No", "Pieces", "Total Meter", "Gross Wt", "Net Wt", "Status"];
    const lines = [header.map(csvCell).join(",")];
    filtered.forEach((pl, i) => {
      lines.push([
        i + 1,
        pl.pl_no || "",
        fmtDate(pl.pl_date),
        pl.order_code || "",
        pl.customer_name || "",
        pl.sort_no || "",
        pl.total_pieces ?? (pl.items?.length || 0),
        fmt(pl.total_meter || 0),
        fmt(pl.total_gross_wt || 0),
        fmt(pl.total_net_wt || 0),
        (STATUS_CFG[pl.status || "finalized"] || STATUS_CFG.finalized).label,
      ].map(csvCell).join(","));
    });
    downloadTextFile(`Fabric_Packing_Lists_${today()}.csv`, lines.join("\r\n"));
  };

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
        <td>${pl.sort_no || "—"}</td>
        <td class="right">${pl.total_pieces ?? (pl.items?.length || 0)}</td>
        <td class="right">${fmt(pl.total_meter || 0)}</td>
        <td>${(STATUS_CFG[pl.status || "finalized"] || STATUS_CFG.finalized).label}</td>
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Fabric Packing Lists</title>
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
  <h1>Fabric Packing Lists</h1>
  <table>
    <thead><tr><th>#</th><th>PL No</th><th>Date</th><th>Order No</th><th>Customer</th><th>Sort No</th><th class="right">Pieces</th><th class="right">Meter</th><th>Status</th></tr></thead>
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

        .fpl-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; min-height:100vh; background:#f1f5f9; }
        .fpl-page-header { padding:16px 28px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        .fpl-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#4338ca; }
        .fpl-page-header p  { margin:2px 0 0; font-size:12px; color:#64748b; }
        .fpl-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .fpl-new-btn { display:flex; align-items:center; gap:6px; background:#4338ca; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(67,56,202,.3); font-family:'DM Sans',sans-serif; }
        .fpl-new-btn:hover { background:#3730a3; }
        .fpl-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#4338ca; border:1px solid #c7d2fe; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpl-export-btn:hover { background:#eef2ff; }
        .fpl-export-menu { position:absolute; top:calc(100% + 6px); right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:600; overflow:hidden; }
        .fpl-toolbar { padding:0 28px 16px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .fpl-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .fpl-search-wrap svg { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .fpl-search { width:100%; padding:8px 12px 8px 30px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; outline:none; }
        .fpl-search:focus { border-color:#4338ca; }
        .fpl-rec-count { font-size:13px; color:#64748b; margin-left:auto; }
        .fpl-card { margin:0 28px 28px; background:#fff; border-radius:12px; box-shadow:0 1px 6px rgba(0,0,0,.07); border:1px solid #e2e8f0; overflow:hidden; }
        .fpl-table-wrap { overflow-x:auto; }
        .fpl-table { width:100%; border-collapse:collapse; font-size:13px; min-width:900px; }
        .fpl-table thead tr { background:#4338ca; }
        .fpl-table th { padding:11px 14px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .fpl-table th.th-r { text-align:right; }
        .fpl-table th.th-c { text-align:center; }
        .fpl-table tbody tr:nth-child(odd) td { background:#fff; }
        .fpl-table tbody tr:nth-child(even) td { background:#f5f5ff; }
        .fpl-table td { padding:10px 14px; color:#374151; font-size:12.5px; white-space:nowrap; }
        .fpl-mono { font-family:'DM Mono',monospace; }
        .fpl-pl-no { font-family:'DM Mono',monospace; font-weight:700; color:#4338ca; background:#eef2ff; border:1px solid #c7d2fe; border-radius:6px; padding:2px 7px; }
        .fpl-order-no { font-weight:700; color:#0e7490; }
        .fpl-td-num { text-align:right; font-family:'DM Mono',monospace; font-weight:700; }
        .fpl-td-c { text-align:center; }
        .fpl-empty { text-align:center; padding:48px 16px; color:#94a3b8; font-size:13px; }
        .fpl-dots-btn { background:none; border:none; cursor:pointer; padding:4px; border-radius:6px; display:flex; align-items:center; color:#64748b; }
        .fpl-dots-btn:hover { background:#f1f5f9; }
        .fpl-row-menu { background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:5000; min-width:210px; overflow:hidden; }
        .fpl-row-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; border:none; background:none; cursor:pointer; font-size:12.5px; color:#374151; font-family:'DM Sans',sans-serif; text-align:left; }
        .fpl-row-menu-item:hover:not(:disabled) { background:#f8fafc; }
        .fpl-row-menu-item--danger { color:#dc2626; }
        .fpl-row-menu-sep { height:1px; background:#f1f5f9; margin:2px 0; }
        .fpl-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .fpl-pg-btns { display:flex; gap:4px; align-items:center; }
        .fpl-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif; }
        .fpl-pg-btn.active { background:#4338ca; color:#fff; border-color:#4338ca; font-weight:700; }
        .fpl-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .fpl-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:24px 16px; }
        .fpl-modal { background:#fff; border-radius:16px; width:100%; max-width:1000px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 48px); }
        .fpl-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; border-radius:16px 16px 0 0; background:linear-gradient(135deg,#4338ca,#312e81); flex-shrink:0; }
        .fpl-modal-title { color:#fff; font-weight:700; font-size:18px; margin:0; }
        .fpl-modal-subtitle { font-size:11px; color:rgba(255,255,255,.75); font-family:'DM Mono',monospace; margin-top:2px; }
        .fpl-modal-close-btn { background:none; border:none; cursor:pointer; display:flex; opacity:.85; }
        .fpl-modal-close-btn:hover { opacity:1; }
        .fpl-modal-body { padding:20px 24px; overflow-y:auto; flex:1; }
        .fpl-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .fpl-section-head { font-weight:700; font-size:13px; color:#4338ca; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:10px 14px; margin-top:16px; margin-bottom:10px; }
        .fpl-grid-3 { display:grid; grid-template-columns:1fr; gap:14px; }
        @media(min-width:480px){ .fpl-grid-3 { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:768px){ .fpl-grid-3 { grid-template-columns:repeat(3,1fr); } }
        .fpl-col-full { grid-column:1/-1; }
        .fpl-addr-grid { display:grid; grid-template-columns:1fr; gap:20px; grid-column:1/-1; margin-top:2px; }
        @media(min-width:640px){ .fpl-addr-grid { grid-template-columns:1fr 1fr; } }
        .fpl-addr-col { display:flex; flex-direction:column; gap:10px; }
        .fpl-addr-subrow { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .fpl-label { display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
        .fpl-required { color:#ef4444; }
        .fpl-input { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; }
        .fpl-input:focus { border-color:#4338ca; }
        .fpl-input:disabled, .fpl-input[readonly] { background:#f8fafc; color:#64748b; }
        .fpl-textarea { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-family:'DM Sans',sans-serif; color:#1e293b; outline:none; background:#fff; resize:vertical; min-height:78px; line-height:1.5; }
        .fpl-textarea:focus { border-color:#4338ca; }
        .fpl-display-field { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; font-size:13px; background:#f8fafc; color:#475569; min-height:38px; display:flex; align-items:center; }
        .fpl-display-field--filled { background:#eef2ff; border-color:#a5b4fc; color:#3730a3; font-weight:700; font-family:'DM Mono',monospace; }
        .fpl-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.12); z-index:500; max-height:220px; overflow-y:auto; }
        .fpl-dropdown-item { display:block; width:100%; text-align:left; padding:9px 14px; border:none; background:none; cursor:pointer; font-family:'DM Sans',sans-serif; border-bottom:1px solid #f1f5f9; }
        .fpl-dropdown-item:hover { background:#eef2ff; }
        .fpl-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }
        .fpl-company-preview { display:flex; gap:14px; align-items:flex-start; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; background:#fafbff; }
        .fpl-company-preview-logo { flex:0 0 auto; width:54px; height:54px; display:flex; align-items:center; justify-content:center; }
        .fpl-company-preview-logo img { width:50px; height:50px; object-fit:contain; }
        .fpl-company-preview-logo-fallback { width:54px; height:44px; border-radius:8px; background:#0f7a3d; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px; }
        .fpl-company-preview-text { flex:1; min-width:0; }
        .fpl-company-preview-name { font-weight:800; color:#0f7a3d; font-size:14px; margin-bottom:3px; }
        .fpl-company-preview-addr { font-size:12px; color:#374151; line-height:1.45; white-space:pre-line; }
        .fpl-company-preview-meta { font-size:11.5px; color:#64748b; margin-top:2px; }
        .fpl-firm-filter-hint { font-weight:600; color:#7c3aed; text-transform:none; margin-left:6px; }
        .fpl-picker { border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
        .fpl-picker-section-title { display:flex; align-items:center; gap:7px; padding:9px 14px; background:#eef2ff; color:#4338ca; font-weight:700; font-size:12.5px; border-bottom:1px solid #e2e8f0; }
        .fpl-picker-section-title--manual { background:#faf5ff; color:#7c3aed; }
        .fpl-picker-section-hint { font-weight:500; font-size:11px; color:#94a3b8; margin-left:2px; }
        .fpl-picker-toolbar { display:flex; align-items:center; gap:12px; padding:10px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; }
        .fpl-picker-list { max-height:220px; overflow-y:auto; }
        .fpl-picker-row { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid #f1f5f9; gap:10px; flex-wrap:wrap; }
        .fpl-picker-row:hover { background:#fafafe; }
        .fpl-add-piece-btn { background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:6px; padding:4px 10px; font-size:11.5px; font-weight:700; cursor:pointer; }
        .fpl-add-piece-btn:hover:not(:disabled) { background:#e0e7ff; }
        .fpl-add-piece-btn:disabled { opacity:.5; cursor:not-allowed; }
        .fpl-item-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
        .fpl-item-table th { padding:8px 10px; background:#eef2ff; color:#4338ca; font-weight:700; text-align:left; font-size:11px; border-bottom:1px solid #e2e8f0; }
        .fpl-item-table th.right { text-align:right; }
        .fpl-item-table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
        .fpl-item-table td.right { text-align:right; }
        .fpl-iinput { width:90px; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:12px; text-align:right; font-family:'DM Sans',sans-serif; }
        .fpl-iinput:focus { border-color:#4338ca; outline:none; }
        .fpl-del-row-btn { background:#fff1f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .fpl-total-section { background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:14px 18px; margin-top:12px; display:flex; gap:24px; flex-wrap:wrap; }
        .fpl-total-item { display:flex; flex-direction:column; gap:2px; }
        .fpl-total-label { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
        .fpl-total-val { font-size:16px; font-weight:800; color:#4338ca; font-family:'DM Mono',monospace; }
        .fpl-cancel-btn { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; }
        .fpl-cancel-btn:hover { background:#f1f5f9; }
        .fpl-save-btn { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#4338ca; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
        .fpl-save-btn:hover:not(:disabled) { background:#3730a3; }
        .fpl-save-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fpl-ok-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; gap:12px; }
        .fpl-ok-icon { width:64px; height:64px; border-radius:50%; background:#e0e7ff; display:flex; align-items:center; justify-content:center; font-size:30px; }
        .fpl-ok-title { font-size:18px; font-weight:700; color:#1e293b; margin:0; }
        .fpl-ok-code { font-family:'DM Mono',monospace; font-size:20px; font-weight:700; color:#4338ca; margin:0; }
        .fpl-ok-close { margin-top:12px; padding:9px 24px; border:none; border-radius:8px; background:#4338ca; color:#fff; font-weight:600; font-size:13px; cursor:pointer; }
        .fpl-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .fpl-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
        .fpl-confirm-title { font-size:17px; font-weight:700; color:#1e293b; margin:8px 0; }
        .fpl-confirm-sub { font-size:13px; color:#64748b; margin:0 0 22px; line-height:1.6; }
        .fpl-confirm-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .fpl-confirm-cancel { padding:9px 22px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; }
        .fpl-confirm-del { padding:9px 22px; border:none; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
        .fpl-confirm-ok { padding:9px 22px; border:none; border-radius:8px; background:#166534; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
        .fpl-confirm-ok:disabled { opacity:.6; cursor:not-allowed; }
        .fpl-confirm-goto { display:flex; align-items:center; gap:6px; padding:9px 22px; border:none; border-radius:8px; background:#4338ca; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
      `}</style>

      <div className="fpl-wrap">
        <div className="fpl-page-header">
          <div>
            <h1>Fabric Packing List</h1>
            <p>Pack fabric stock against a customer order and generate a packing list</p>
          </div>
          <div className="fpl-header-actions">
            <ExportMenu onExportCsv={handleExportCsv} onExportPrintAll={handleExportPrintAll} />
            <button className="fpl-new-btn" onClick={handleNew}><Plus size={15} /> New Packing List</button>
          </div>
        </div>

        <div className="fpl-toolbar">
          <div className="fpl-search-wrap">
            <Search size={13} />
            <input className="fpl-search" placeholder="Search PL no, order no, customer…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="fpl-rec-count">{filtered.length} record(s)</span>
        </div>

        <div className="fpl-card">
          <div className="fpl-table-wrap">
            <table className="fpl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PL No</th>
                  <th>Date</th>
                  <th>Order No</th>
                  <th>Customer</th>
                  {width >= 768 && <th>Sort No</th>}
                  <th className="th-r">Pieces</th>
                  <th className="th-r">Meter</th>
                  <th className="th-c">Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="fpl-empty"><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={10} className="fpl-empty">
                    {search ? "No packing lists match your search." : 'No packing lists yet. Click "New Packing List" to create one.'}
                  </td></tr>
                ) : pageRows.map((pl, i) => (
                  <tr key={pl.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                    <td><span className="fpl-pl-no">{pl.pl_no}</span></td>
                    <td style={{ color: "#64748b" }}>{fmtDate(pl.pl_date)}</td>
                    <td><span className="fpl-order-no">{pl.order_code || "—"}</span></td>
                    <td>{pl.customer_name || "—"}</td>
                    {width >= 768 && <td>{pl.sort_no || "—"}</td>}
                    <td className="fpl-td-num">{pl.total_pieces ?? (pl.items?.length || 0)}</td>
                    <td className="fpl-td-num">{fmt(pl.total_meter || 0)} M</td>
                    <td className="fpl-td-c"><StatusBadge status={pl.status || "finalized"} /></td>
                    <td className="fpl-td-c">
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
            <div className="fpl-pg-bar">
              <span>Page {page} of {totalPages} — {filtered.length} record(s)</span>
              <div className="fpl-pg-btns">
                <button className="fpl-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="fpl-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`fpl-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="fpl-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="fpl-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* CREATE / EDIT MODAL */}
        {showModal && (
          <div className="fpl-modal-overlay" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="fpl-modal">
              <div className="fpl-modal-header">
                <div>
                  <h2 className="fpl-modal-title">{isEdit ? "✏️ Edit Packing List" : "📦 New Packing List"}</h2>
                  <p className="fpl-modal-subtitle">{plGenerating ? "Generating PL No…" : (form.pl_no || "—")}</p>
                </div>
                <button className="fpl-modal-close-btn" onClick={handleClose}><X size={20} color="#fff" /></button>
              </div>

              {savedCode ? (
                <div className="fpl-ok-wrap">
                  <div className="fpl-ok-icon"><CheckCircle2 size={30} color="#4338ca" /></div>
                  <p className="fpl-ok-title">Packing List Saved!</p>
                  <p className="fpl-ok-code">{savedCode}</p>
                  <button className="fpl-ok-close" onClick={handleClose}>Close</button>
                </div>
              ) : (
                <>
                  <div className="fpl-modal-body">
                    {saveError && (
                      <div className="fpl-error-banner">
                        <AlertCircle size={15} />
                        <span>{saveError}</span>
                        <button onClick={() => setSaveError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14} /></button>
                      </div>
                    )}

                    <div className="fpl-section-head">Order &amp; Delivery Details</div>
                    <div className="fpl-grid-3">
                      <div>
                        <label className="fpl-label">Customer Order <span className="fpl-required">*</span></label>
                        <OrderSearchSelect value={form.order_code || ""} options={orderOptions} loading={loadingOrders} onSelect={handleOrderSelect} />
                        {ordersFnMissing && (
                          <p className="fpl-hint" style={{ color: "#b45309", marginTop: 4, fontSize: 11 }}>
                            ⚠ No customer-orders loader found in services.ts — see console, or type the Order No / Sort No / Customer fields below manually.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="fpl-label">Customer Name {orderLoading && "(loading…)"}</label>
                        <input className="fpl-input" value={form.customer_name || ""} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Autofills from Customer Order" />
                      </div>
                      <div>
                        <label className="fpl-label">PL No</label>
                        <div className={`fpl-display-field${form.pl_no ? " fpl-display-field--filled" : ""}`}>
                          {plGenerating ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : (form.pl_no || "Auto-generated")}
                        </div>
                      </div>
                      <div>
                        <label className="fpl-label">PL Date</label>
                        <input className="fpl-input" type="date" value={form.pl_date} onChange={e => setForm(f => ({ ...f, pl_date: e.target.value }))} />
                      </div>

                      <div>
                        <label className="fpl-label">Sort No</label>
                        <input className="fpl-input" value={form.sort_no || ""} onChange={e => setForm(f => ({ ...f, sort_no: e.target.value }))} />
                      </div>
                      <div>
                        <label className="fpl-label">Quality</label>
                        <input className="fpl-input" value={form.quality || ""} onChange={e => setForm(f => ({ ...f, quality: e.target.value }))} />
                      </div>
                      <div>
                        <label className="fpl-label">
                          Company (Print Header)
                          {orderFirm ? (
                            <span className="fpl-firm-filter-hint">— showing {orderFirm} firm companies only</span>
                          ) : null}
                        </label>
                        <CompanySearchSelect
                          value={selectedCompanyName}
                          options={filteredCompanyRows}
                          emptyHint={
                            orderFirm
                              ? `No companies found for firm "${orderFirm}" in Company Details Master — add one there, or pick a different Customer Order.`
                              : undefined
                          }
                          onSelect={(c) => {
                            setForm(f => ({
                              ...f,
                              company_id: c ? (c.id ?? null) : null,
                              firm: c ? (c.firm || "") : "",
                            }));
                          }}
                        />
                      </div>

                      <div>
                        <label className="fpl-label">Transport Name</label>
                        <input className="fpl-input" value={form.transport_name || ""} onChange={e => setForm(f => ({ ...f, transport_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="fpl-label">Vehicle No</label>
                        <input className="fpl-input" value={form.vehicle_no || ""} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))} />
                      </div>
                      <div>
                        <label className="fpl-label">Prepared By</label>
                        <input className="fpl-input" value={form.prepared_by || ""} onChange={e => setForm(f => ({ ...f, prepared_by: e.target.value }))} />
                      </div>

                      <div className="fpl-col-full">
                        <label className="fpl-label">
                          Header Address Preview
                          <span style={{ fontWeight: 500, color: "#94a3b8", textTransform: "none", marginLeft: 6 }}>
                            (what prints at the top of this Packing List)
                          </span>
                        </label>
                        <div className="fpl-company-preview">
                          <div className="fpl-company-preview-logo">
                            {headerPreview.logo
                              ? <img src={headerPreview.logo} alt="logo" />
                              : <div className="fpl-company-preview-logo-fallback">{(headerPreview.name || "?").slice(0, 2).toUpperCase()}</div>}
                          </div>
                          <div className="fpl-company-preview-text">
                            <div className="fpl-company-preview-name">{headerPreview.name}</div>
                            <div className="fpl-company-preview-addr">{headerPreview.address}</div>
                            {headerPreview.pin && <div className="fpl-company-preview-addr">{headerPreview.pin}</div>}
                            <div className="fpl-company-preview-meta">GST No: {headerPreview.gst}</div>
                            <div className="fpl-company-preview-meta">Ph: {headerPreview.phone}{headerPreview.email ? `, E-mail: ${headerPreview.email}` : ""}</div>
                          </div>
                        </div>
                      </div>

                      <div className="fpl-addr-grid">
                        <div className="fpl-addr-col">
                          <div>
                            <label className="fpl-label">Billing Address {orderLoading && "(loading…)"}</label>
                            <textarea
                              className="fpl-textarea"
                              rows={3}
                              value={form.billing_address || ""}
                              onChange={e => setForm(f => ({ ...f, billing_address: e.target.value }))}
                              placeholder="Autofills from Customer Order"
                            />
                          </div>
                          <div className="fpl-addr-subrow">
                            <div>
                              <label className="fpl-label">Pincode</label>
                              <input className="fpl-input" value={form.billing_pincode || ""} onChange={e => setForm(f => ({ ...f, billing_pincode: e.target.value }))} />
                            </div>
                            <div>
                              <label className="fpl-label">State</label>
                              <input className="fpl-input" value={form.billing_state || ""} onChange={e => setForm(f => ({ ...f, billing_state: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="fpl-label">Country</label>
                            <input className="fpl-input" value={form.billing_country || ""} onChange={e => setForm(f => ({ ...f, billing_country: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fpl-label">GST No</label>
                            <input className="fpl-input" value={form.billing_gst || ""} onChange={e => setForm(f => ({ ...f, billing_gst: e.target.value }))} />
                          </div>
                        </div>

                        <div className="fpl-addr-col">
                          <div>
                            <label className="fpl-label">Delivery Address {orderLoading && "(loading…)"}</label>
                            <textarea
                              className="fpl-textarea"
                              rows={3}
                              value={form.delivery_address || ""}
                              onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                              placeholder="Autofills from Customer Order"
                            />
                          </div>
                          <div className="fpl-addr-subrow">
                            <div>
                              <label className="fpl-label">Pincode</label>
                              <input className="fpl-input" value={form.delivery_pincode || ""} onChange={e => setForm(f => ({ ...f, delivery_pincode: e.target.value }))} />
                            </div>
                            <div>
                              <label className="fpl-label">State</label>
                              <input className="fpl-input" value={form.delivery_state || ""} onChange={e => setForm(f => ({ ...f, delivery_state: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="fpl-label">Country</label>
                            <input className="fpl-input" value={form.delivery_country || ""} onChange={e => setForm(f => ({ ...f, delivery_country: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fpl-label">GST No</label>
                            <input className="fpl-input" value={form.delivery_gst || ""} onChange={e => setForm(f => ({ ...f, delivery_gst: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="fpl-section-head">Pick Fabric Stock Pieces</div>
                    <InwardStockSection
                      orderSelected={!!form.order_id}
                      sortNo={form.sort_no}
                      selectedIds={selectedStockIds}
                      onAdd={addPieceToForm}
                    />
                    <ManualStockSection
                      sortNo={form.sort_no}
                      selectedIds={selectedStockIds}
                      onAdd={addPieceToForm}
                    />

                    <table className="fpl-item-table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}>#</th>
                          <th>Piece No</th>
                          <th>Quality</th>
                          <th className="right">Meter</th>
                          <th className="right">Gross Wt</th>
                          <th className="right">Net Wt</th>
                          <th style={{ width: 30 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.items || []).length === 0 ? (
                          <tr><td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", padding: 14 }}>No pieces added yet.</td></tr>
                        ) : (form.items || []).map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ color: "#94a3b8" }}>{idx + 1}</td>
                            <td className="fpl-mono">{it.piece_no || it.new_piece_no || "—"}</td>
                            <td className="fpl-mono" style={{ color: "#7c3aed" }}>{it.construction || "—"}</td>
                            <td className="right fpl-mono">{fmt(it.meter)}</td>
                            <td className="right">
                              <input className="fpl-iinput" type="number" step="0.01" value={it.gross_wt}
                                onChange={e => updateItem(idx, { gross_wt: parseFloat(e.target.value) || 0 })} />
                            </td>
                            <td className="right">
                              <input className="fpl-iinput" type="number" step="0.01" value={it.net_wt}
                                onChange={e => updateItem(idx, { net_wt: parseFloat(e.target.value) || 0 })} />
                            </td>
                            <td>
                              <button className="fpl-del-row-btn" onClick={() => removeItem(idx)}><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="fpl-total-section">
                      <div className="fpl-total-item"><span className="fpl-total-label">Pieces</span><span className="fpl-total-val">{(form.items || []).length}</span></div>
                      <div className="fpl-total-item"><span className="fpl-total-label">Total Meter</span><span className="fpl-total-val">{fmt(totals.meter)} M</span></div>
                      <div className="fpl-total-item"><span className="fpl-total-label">Gross Wt</span><span className="fpl-total-val">{fmt(totals.gross_wt)}</span></div>
                      <div className="fpl-total-item"><span className="fpl-total-label">Net Wt</span><span className="fpl-total-val">{fmt(totals.net_wt)}</span></div>
                    </div>
                  </div>

                  <div className="fpl-modal-footer">
                    <button className="fpl-cancel-btn" onClick={handleClose}>Cancel</button>
                    <button className="fpl-save-btn" onClick={handleSave} disabled={saving}>
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
          <div className="fpl-confirm-overlay">
            <div className="fpl-confirm-box">
              <AlertCircle size={36} color="#dc2626" />
              <p className="fpl-confirm-title">Delete Packing List?</p>
              <p className="fpl-confirm-sub">This will permanently delete <strong>{deleteTarget.pl_no}</strong> and release its pieces back to available stock.</p>
              <div className="fpl-confirm-actions">
                <button className="fpl-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="fpl-confirm-del" disabled={deleteConfirming} onClick={handleDeleteConfirm}>
                  {deleteConfirming ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONVERT TO INVOICE CONFIRM */}
        {convertTarget && (
          <div className="fpl-confirm-overlay">
            <div className="fpl-confirm-box">
              {convertLoading ? (
                <>
                  <Loader2 size={30} style={{ animation: "spin 1s linear infinite" }} color="#4338ca" />
                  <p className="fpl-confirm-title">Checking status…</p>
                </>
              ) : convertResult ? (
                convertResult.invoice_no ? (
                  <>
                    <CheckCircle2 size={36} color="#166534" />
                    <p className="fpl-confirm-title">Converted!</p>
                    <p className="fpl-confirm-sub">
                      Fabric Invoice <strong>{convertResult.invoice_no}</strong> created from{" "}
                      <strong>{convertTarget.pl_no}</strong>. Status is now <strong>Converted</strong>.
                    </p>
                    <div className="fpl-confirm-actions">
                      <button className="fpl-confirm-cancel" onClick={() => setConvertTarget(null)}>Stay Here</button>
                      <button className="fpl-confirm-goto" onClick={handleGoToInvoice}>
                        Go to Fabric Invoice <ArrowRight size={14} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle size={36} color="#dc2626" />
                    <p className="fpl-confirm-title">Conversion Failed</p>
                    <p className="fpl-confirm-sub">
                      {convertResult.error || `Could not convert ${convertTarget.pl_no} to an invoice. Please try again.`}
                    </p>
                    <div className="fpl-confirm-actions">
                      <button className="fpl-confirm-cancel" onClick={() => setConvertTarget(null)}>Close</button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <FileOutput size={36} color="#4338ca" />
                  <p className="fpl-confirm-title">Convert to Fabric Invoice?</p>
                  <p className="fpl-confirm-sub">This creates an invoice from <strong>{convertTarget.pl_no}</strong> ({fmt(convertTarget.total_meter || 0)} M, {convertTarget.total_pieces ?? convertTarget.items?.length ?? 0} pieces) and marks it <strong>Converted</strong>. This action can't be undone.</p>
                  <div className="fpl-confirm-actions">
                    <button className="fpl-confirm-cancel" onClick={() => setConvertTarget(null)}>Cancel</button>
                    <button className="fpl-confirm-ok" disabled={converting} onClick={handleConvertConfirm}>
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