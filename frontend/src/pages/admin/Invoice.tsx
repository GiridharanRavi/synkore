// @ts-nocheck
// frontend/src/pages/admin/FabricInvoice.tsx
//
// Fabric Invoice page — lists invoices generated from Fabric Packing Lists
// (via "Convert to Invoice" in FabricPackingList.tsx), lets you edit the
// commercial fields (rate, GST, bank, PO, etc.), and prints a tax-invoice
// layout matching the VP TEX sample.
//
// STATUS FLOW:
//   Invoice created (from PL conversion) → status = "active"    → badge "Active"
//   "Mark Completed" action (this page)  → status = "completed" → badge "Completed"
//   "Cancel Invoice" action               → status = "cancelled" → badge "Cancelled"
//   "Delete" action (only enabled once Cancelled) → hard delete
//
// ─────────────────────────────────────────────────────────────────────────
// CHANGED (THIS REVISION):
//
//   The invoice's "Company (Print Header)" now stays LIVE-SYNCED to its
//   source Packing List's company_id (handled on the backend — see
//   fabricInvoiceRoutes.js GET /:id), so if you go back and change the
//   Packing List's print-header company AFTER converting it, the invoice
//   picks that up automatically next time it's opened or printed. No
//   manual re-pick required.
//
//   NEW: if you explicitly pick a *different* company directly on the
//   invoice (via the "Company (Print Header)" search box below), that
//   pick now STICKS — it is marked as an explicit override
//   (`company_id_overridden: true`) and will no longer be silently
//   replaced by the Packing List's live value. This prevents a
//   deliberate override from quietly disappearing the next time the
//   invoice is opened. Clicking "Clear" removes the override and goes
//   back to live-syncing with the Packing List (or firm-based
//   auto-lookup if the Packing List has no company set either).
//
//   DB migration (fabric_invoices table) — one more nullable-safe column,
//   in addition to the company_id column from the previous revision:
//     ALTER TABLE fabric_invoices
//       ADD COLUMN company_id_overridden TINYINT(1) NOT NULL DEFAULT 0;
//   PUT /api/fabric-invoices/:id already spreads the whole body onto
//   `SET ?`, so once the column exists this field saves automatically —
//   no backend route changes needed there either.
//
//   ── Previously shipped in this file (unchanged) ──────────────────────
//   "Company (Print Header)" picker, same pattern as
//   FabricPackingList.tsx's company selector:
//     • A search box ("Search company name, code or firm...") that calls
//       fabricServices.searchCompanies(query) and shows a dropdown of
//       matches.
//     • Picking a result stores `company_id` on the invoice (persisted
//       column — see DB migration note below) and shows a live
//       "HEADER ADDRESS PREVIEW" box (logo, name, address, GST/PAN,
//       phone/email) — exactly what will print at the top of the
//       invoice.
//     • A "Clear" link resets company_id to null, which makes the
//       invoice fall back to the old firm-based auto-lookup.
//     • If no company is ever picked, behaviour is 100% unchanged: the
//       firm-based lookup (getCompanyByFirm) still runs, both for the
//       Bank & Signatures section and for print.
//
//   resolveCompanyInfoForInvoice(inv) is the single entry point every
//   print/preview call uses. It tries, in order:
//     1) inv.company_id  → fetchCompanyInfoById (Company Details Master
//        row by primary key — exact pick)
//     2) inv.firm        → fetchCompanyInfoForFirm (existing behaviour)
//     3) static COMPANY_INFO / FALLBACK_COMPANY_INFO (unchanged fallback)
//
//   services.ts needs (add if missing, same defensive pattern as
//   getCompanyByFirm below):
//     export const searchCompanies = (q) =>
//       api.get(`/company-details/search`, { params: { q } });
//     export const getCompanyById = (id) =>
//       api.get(`/company-details/${id}`);
//
//   Backend (company-details router — wherever /by-firm/:firm already
//   lives) needs two more read-only routes:
//     GET /api/company-details/search?q=...   → array of
//       { id, company_name, firm, gst_no } matches (by name / firm code)
//     GET /api/company-details/:id            → single full row, same
//       shape as the /by-firm/:firm route already returns.
//
//   DB migration (fabric_invoices table) — one nullable column:
//     ALTER TABLE fabric_invoices ADD COLUMN company_id INT NULL;
//   Nothing else changes shape-wise; PUT /api/fabric-invoices/:id already
//   spreads the whole body onto `SET ?`, so once the column exists this
//   field saves automatically — no backend route changes needed there.
//
//   (All previous CHANGED notes — auto-fetch Customer Order data, RowMenu
//   portal positioning, Export dropdown, normalizeInvoice() defensive
//   field matching, Packing List print fetch, permanent delete, Bank &
//   Signatures auto-fetch from Company Details Master — are preserved
//   as-is below.)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, Loader2, AlertCircle, CheckCircle2, MoreVertical,
  Printer, PenLine, Ban, Trash2, Download, FileSpreadsheet, FileText,
  ChevronDown, ChevronUp, Link2, Bug, Building2, XCircle,
} from "lucide-react";

import {
  getFabricInvoices,
  getFabricInvoiceById,
  updateFabricInvoice,
  cancelFabricInvoice,
  completeFabricInvoice,
  FabricInvoicePayload,
} from "../../api/services";
// Imported as a namespace so that if services.ts doesn't yet export the
// newer functions this revision needs (deleteFabricInvoicePermanent,
// getOrderCommercialDefaults, getOrderDebug, getSchemaDebug,
// getCompanyByFirm, searchCompanies, getCompanyById), this module still
// loads fine — the calls simply become `undefined` at runtime instead of
// throwing "does not provide an export named ...". Add the exports shown
// in the CHANGED notes above and they'll be picked up automatically.
import * as fabricServices from "../../api/services";

// ─── COMPANY_INFO — static fallback only. The live source of truth is now
// the Company Details Master (company_details table), fetched either by
// explicit company_id (when the user has picked one via the new "Company
// (Print Header)" section) or by firm (fetchCompanyInfoForFirm), via
// resolveCompanyInfoForInvoice() below. This object (and
// FALLBACK_COMPANY_INFO) is only ever used if neither lookup finds a row
// — e.g. right after this feature is first deployed, before anyone has
// filled in Company Details Master. Once every firm has a row there, this
// block is effectively dead code and can be deleted. ────────────────────
const COMPANY_INFO: Record<string, {
  name: string; logo?: string;
  worksAddress?: string;
  address: string; pin?: string;
  regdOffice?: string;
  gst: string; pan?: string; cin?: string; policyNo?: string;
  phone: string; email: string; website?: string;
  certifications?: string[];
  bank_name?: string; bank_branch?: string; bank_account_no?: string; ifsc_code?: string;
}> = {
  // ... keep exactly as in your current FabricPackingList.tsx COMPANY_INFO block ...
};

// Company logo, embedded as a base64 data URI so it always renders in the
// print window (window.open('', '_blank')) without depending on a
// public/ file path or external host resolving inside that popup's
// document. Only used as the last-resort fallback now — a company row's
// own logo_path (served from /api/company-details/logo/:filename) is
// preferred whenever one exists.
const COMPANY_LOGO_DATA_URI = "REPLACE_WITH_YOUR_BASE64_LOGO_STRING";

const FALLBACK_COMPANY_INFO = {
  name: "SYNKORE TECH",
  logo: COMPANY_LOGO_DATA_URI,
  worksAddress: "364/43, Kolathu Kadu, 4th Street Agraharam Post Pallipalayam",
  address: "364/43, Kolathu Kadu, 4th Street Agraharam Post Pallipalayam",
  pin: "Namakkal-638008",
  regdOffice: "364/43, Kolathu Kadu, 4th Street Agraharam Post Pallipalayam, Namakkal-638008",
  gst: "TODO GSTIN",
  pan: "TODO PAN",
  cin: "TODO CIN",
  policyNo: "",
  phone: "+91 81108 14250 | +91 90957 23186",
  email: "abhayanexport2019@gmail.com",
  website: "",
  certifications: ["FSC", "GOTS", "ORGANIC BLENDED", "OEKO-TEX STANDARD 100", "BCI"],
  bank_name: "", bank_branch: "", bank_account_no: "", ifsc_code: "",
};

// ── Company Details Master lookup (live) ─────────────────────────────────
// Maps a company_details row (real columns: company_name, logo_path,
// works_address, address, pin_code, regd_office, gst_no, pan_no, cin_no,
// policy_no, contact_no, email, website, certifications (comma string),
// bank_name, branch_name, ac_no, ifsc_code) onto the shape the print
// builders and the Bank & Signatures / Company preview both expect.
// Cached per lookup key for the lifetime of the page so repeated
// prints/edits don't re-fetch the same row.
const companyInfoCache: Record<string, any> = {};   // keyed by firm
const companyInfoByIdCache: Record<string, any> = {}; // keyed by company_id

function mapCompanyRow(row: any) {
  return {
    id: row.id,
    name: row.company_name,
    logo: row.logo_path ? `/api/company-details/logo/${row.logo_path}` : COMPANY_LOGO_DATA_URI,
    worksAddress: row.works_address || row.address,
    address: row.address,
    pin: row.pin_code,
    regdOffice: row.regd_office || row.address,
    gst: row.gst_no,
    pan: row.pan_no,
    cin: row.cin_no,
    policyNo: row.policy_no,
    phone: row.contact_no,
    email: row.email,
    website: row.website,
    firm: row.firm,
    certifications: row.certifications
      ? String(row.certifications).split(",").map((c: string) => c.trim()).filter(Boolean)
      : [],
    bank_name: row.bank_name || "",
    bank_branch: row.branch_name || "",
    bank_account_no: row.ac_no || "",
    ifsc_code: row.ifsc_code || "",
  };
}

// Resolves the print-header company info for a firm — Company Details
// Master first, falling back to the static block above if no active
// profile exists yet for that firm. Never throws.
async function fetchCompanyInfoForFirm(firm?: string) {
  const key = (firm || "").trim().toUpperCase() || "DEFAULT";
  if (companyInfoCache[key]) return companyInfoCache[key];

  if (firm && typeof fabricServices.getCompanyByFirm === "function") {
    try {
      const res = await fabricServices.getCompanyByFirm(firm);
      const row = res?.data ?? res;
      if (row && row.company_name) {
        const mapped = mapCompanyRow(row);
        companyInfoCache[key] = mapped;
        return mapped;
      }
    } catch (e) {
      console.warn(`[FabricInvoice] Could not fetch Company Details Master for firm "${firm}" — using fallback.`, e);
    }
  }

  const fallback = COMPANY_INFO[key] || COMPANY_INFO.DEFAULT || FALLBACK_COMPANY_INFO;
  companyInfoCache[key] = fallback;
  return fallback;
}

// Resolves a specific Company Details Master row by its own id. This is
// what powers the explicit "Company (Print Header)" picker: once the
// user picks a search result, everything downstream (edit-modal preview,
// print) uses this exact row instead of guessing from firm. Also what
// resolves an invoice's *inherited* company_id (see the revision note at
// the top of this file). Never throws; returns null if the id can't be
// resolved.
async function fetchCompanyInfoById(companyId?: string | number) {
  if (!companyId) return null;
  const key = String(companyId);
  if (companyInfoByIdCache[key]) return companyInfoByIdCache[key];

  if (typeof fabricServices.getCompanyById !== "function") {
    console.warn(
      "[FabricInvoice] getCompanyById is missing from services.ts — add: " +
      "export const getCompanyById = (id) => api.get(`/company-details/${id}`);"
    );
    return null;
  }
  try {
    const res = await fabricServices.getCompanyById(companyId);
    const row = res?.data ?? res;
    if (row && row.company_name) {
      const mapped = mapCompanyRow(row);
      companyInfoByIdCache[key] = mapped;
      return mapped;
    }
  } catch (e) {
    console.warn(`[FabricInvoice] Could not fetch Company Details Master row #${companyId}.`, e);
  }
  return null;
}

// Single entry point every print/preview call should use. Prefers an
// explicitly-picked (or Packing-List-inherited) company (inv.company_id)
// over the old firm-based guess, and only falls back to the static
// defaults if neither resolves.
async function resolveCompanyInfoForInvoice(inv: any) {
  if (inv?.company_id) {
    const byId = await fetchCompanyInfoById(inv.company_id);
    if (byId) return byId;
  }
  return fetchCompanyInfoForFirm(inv?.firm);
}

// ─── Utilities ───────────────────────────────────────────────────────────
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
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Defensive field normalization ─────────────────────────────────────
function pick(obj: any, keys: string[], fallback: any = undefined) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
}
function pickNum(obj: any, keys: string[]): number {
  const v = pick(obj, keys, 0);
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function normalizeInvoice(raw: any): FabricInvoicePayload {
  if (!raw) return raw;
  const items = Array.isArray(raw.items) ? raw.items.map((it: any) => ({
    ...it,
    description: pick(it, ["description", "desc", "goods_description", "item_description"], it.description),
    hsn_code: pick(it, ["hsn_code", "hsnCode", "hsn"], it.hsn_code),
    no_of_rolls: pick(it, ["no_of_rolls", "noOfRolls", "rolls", "no_of_pieces"], it.no_of_rolls),
    qty: pickNum(it, ["qty", "quantity", "meter", "total_qty"]),
    rate: pickNum(it, ["rate", "unit_rate", "rate_per_meter", "ratePerMeter"]),
    basic_value: pickNum(it, ["basic_value", "basicValue", "amount", "value"]),
  })) : raw.items;

  return {
    ...raw,
    pl_id: pick(raw, ["pl_id", "plId", "packing_list_id"], raw.pl_id),
    pl_no: pick(raw, ["pl_no", "plNo", "pkg_list_no"], raw.pl_no),
    pl_date: pick(raw, ["pl_date", "plDate"], raw.pl_date),
    order_id: pick(raw, ["order_id", "orderId"], raw.order_id),
    order_code: pick(raw, ["order_code", "orderCode"], raw.order_code),
    firm: pick(raw, ["firm"], raw.firm),
    // Explicitly-picked (or Packing-List-inherited / live-synced)
    // print-header company, if any — see the "Company (Print Header)"
    // section in the Edit modal below, and the revision note at the top
    // of this file.
    company_id: pick(raw, ["company_id", "companyId"], raw.company_id ?? null),
    // Whether the current company_id was explicitly chosen on the
    // invoice itself (true) rather than live-synced from the Packing
    // List / firm auto-lookup (false/undefined). See revision note.
    company_id_overridden: pick(raw, ["company_id_overridden", "companyIdOverridden"], !!raw.company_id_overridden),
    company_id_source: pick(raw, ["company_id_source", "companyIdSource"], raw.company_id_source),
    po_no: pick(raw, ["po_no", "poNo", "po_number", "poNumber"], raw.po_no),
    confirm_by: pick(raw, ["confirm_by", "confirmBy"], raw.confirm_by),
    rate_type: pick(raw, ["rate_type", "rateType"], raw.rate_type),
    freight_terms: pick(raw, ["freight_terms", "freight", "freightTerms"], raw.freight_terms),
    e_way_no: pick(raw, ["e_way_no", "eway_no", "ewayNo", "e_way_number"], raw.e_way_no),
    lr_no: pick(raw, ["lr_no", "lrNo"], raw.lr_no),
    lr_date: pick(raw, ["lr_date", "lrDate"], raw.lr_date),
    trans_mode: pick(raw, ["trans_mode", "transMode", "transport_mode"], raw.trans_mode),
    transport_name: pick(raw, ["transport_name", "transportName", "transport"], raw.transport_name),
    vehicle_no: pick(raw, ["vehicle_no", "vehicleNo"], raw.vehicle_no),
    gross_wt: pickNum(raw, ["gross_wt", "grossWt", "gross_weight"]),
    net_wt: pickNum(raw, ["net_wt", "netWt", "net_weight"]),
    rate: pickNum(raw, ["rate", "unit_rate", "rate_per_meter", "ratePerMeter"]),
    total_qty: pickNum(raw, ["total_qty", "totalQty", "qty", "total_meter"]),
    discount_percent: pickNum(raw, ["discount_percent", "discountPercent"]),
    discount_amount: pickNum(raw, ["discount_amount", "discountAmount"]),
    basic_value: pickNum(raw, ["basic_value", "basicValue"]),
    sub_total: pickNum(raw, ["sub_total", "subTotal"]),
    cgst_percent: pickNum(raw, ["cgst_percent", "cgstPercent"]),
    sgst_percent: pickNum(raw, ["sgst_percent", "sgstPercent"]),
    igst_percent: pickNum(raw, ["igst_percent", "igstPercent"]),
    cgst_amount: pickNum(raw, ["cgst_amount", "cgstAmount"]),
    sgst_amount: pickNum(raw, ["sgst_amount", "sgstAmount"]),
    igst_amount: pickNum(raw, ["igst_amount", "igstAmount"]),
    tcs_percent: pickNum(raw, ["tcs_percent", "tcsPercent"]),
    tcs_amount: pickNum(raw, ["tcs_amount", "tcsAmount"]),
    round_off: pickNum(raw, ["round_off", "roundOff"]),
    grand_total: pickNum(raw, ["grand_total", "grandTotal"]),
    payment_terms: pick(raw, ["payment_terms", "paymentTerms"], raw.payment_terms),
    bank_name: pick(raw, ["bank_name", "bankName"], raw.bank_name),
    bank_agent: pick(raw, ["bank_agent", "bankAgent"], raw.bank_agent),
    bank_branch: pick(raw, ["bank_branch", "bankBranch"], raw.bank_branch),
    bank_account_no: pick(raw, ["bank_account_no", "bankAccountNo", "account_no"], raw.bank_account_no),
    ifsc_code: pick(raw, ["ifsc_code", "ifscCode"], raw.ifsc_code),
    prepared_by: pick(raw, ["prepared_by", "preparedBy"], raw.prepared_by),
    checked_by: pick(raw, ["checked_by", "checkedBy"], raw.checked_by),
    authorised_by: pick(raw, ["authorised_by", "authorisedBy", "authorized_by"], raw.authorised_by),
    authorised_signed_at: pick(raw, ["authorised_signed_at", "authorisedSignedAt"], raw.authorised_signed_at),
    consignee_name: pick(raw, ["consignee_name", "consigneeName"], raw.consignee_name),
    consignee_address: pick(raw, ["consignee_address", "consigneeAddress"], raw.consignee_address),
    consignee_gst: pick(raw, ["consignee_gst", "consigneeGst"], raw.consignee_gst),
    consignee_state_code: pick(raw, ["consignee_state_code", "consigneeStateCode"], raw.consignee_state_code),
    billing_gst: pick(raw, ["billing_gst", "billingGst"], raw.billing_gst),
    customer_name: pick(raw, ["customer_name", "customerName"], raw.customer_name),
    items,
  };
}

// ── Number → Indian words (for "Amount in Words") ──────────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigits(n % 100) : "");
}
function numberToIndianWords(num: number): string {
  num = Math.round(num);
  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const hundred = num;
  let parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}
function amountInWords(n: number): string {
  return `Rupees ${numberToIndianWords(n)} Only`;
}

// ─── Status badge ────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  active:    { label: "Active",    bg: "#dcfce7", color: "#166534" },
  completed: { label: "Completed", bg: "#dbeafe", color: "#1e40af" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", color: "#991b1b" },
};
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.active;
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, background: c.bg, color: c.color, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

const PRINT_DOC_STYLES = `
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Times New Roman', Times, serif; font-size:12px; color:#1e293b; }
  .sheet { padding:16px 20px; }
  .sheet + .sheet { page-break-before:always; }
  .box { border:1.5px solid #1e293b; }
  td.center, th.center { text-align:center; }
  td.right, th.right { text-align:right; }
  .small { font-size:10.5px; color:#475569; }
  @media print { .sheet { padding:6px 8px; } }
`;

// buildTaxInvoiceHtml / buildPackingListHtml take the resolved company
// info (`co`) as a parameter instead of resolving it internally — `co` is
// now produced by resolveCompanyInfoForInvoice() (explicit company_id
// first, firm second), which is async, so it has to happen *before*
// these synchronous HTML builders run (see handlePrintRow below).
function buildTaxInvoiceHtml(inv: FabricInvoicePayload, co: any, pageInfo?: { page: number; total: number }): string {
  const items = inv.items || [];
  const rows = items.map((it, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${it.description || "—"}</td>
      <td class="center">${it.hsn_code || "—"}</td>
      <td class="right">${it.no_of_rolls ?? "—"}</td>
      <td class="right">${fmt(it.qty)}</td>
      <td class="right">${fmt(it.rate)}</td>
      <td class="right">${fmt(it.basic_value)}</td>
    </tr>`).join("");

  const billBlock = fullAddressBlock(inv.billing_address, inv.billing_pincode, inv.billing_state, inv.billing_country);
  const consigneeBlock = fullAddressBlock(inv.consignee_address, inv.consignee_pincode, inv.consignee_state, inv.consignee_country);
  const deliveryBlock = fullAddressBlock(
    inv.delivery_address || inv.consignee_address,
    inv.delivery_pincode || inv.consignee_pincode,
    inv.delivery_state || inv.consignee_state,
    inv.delivery_country || inv.consignee_country
  );
  const qrData = encodeURIComponent(`INV:${inv.invoice_no} | PL:${inv.pl_no || ""} | Order:${inv.order_code || ""}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${qrData}`;
  const logoBlock = co.logo
    ? `<img src="${co.logo}" alt="logo" style="width:100%" onerror="this.outerHTML='<div class=&quot;logo-fallback&quot;><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>'" />`
    : `<div class="logo-fallback"><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>`;

  const netTotal = (Number(inv.sub_total) || 0) + (Number(inv.cgst_amount) || 0) + (Number(inv.sgst_amount) || 0) + (Number(inv.igst_amount) || 0);
  const certBadges = (co.certifications || [])
    .map(c => `<span class="cert-badge">${c}</span>`).join("");

  // Bank block: invoice's own saved bank_* values win (these are set by
  // the Bank & Signatures section on the Edit modal, which is itself
  // pre-filled from Company Details Master — see handleFetchCompanyBank).
  // If the invoice never got them for some reason, fall back to the
  // resolved company profile's live bank details as a last resort.
  const bankName    = inv.bank_name        || co.bank_name        || "—";
  const bankBranch  = inv.bank_branch      || co.bank_branch      || "—";
  const bankAccount = inv.bank_account_no  || co.bank_account_no  || "—";
  const bankIfsc     = inv.ifsc_code        || co.ifsc_code         || "—";

  return `
  <div class="sheet">
    <div class="box inv-box">
      <div class="top-row">
        <div class="top-left">
          <div class="top-left-inner">
            <div class="logo">${logoBlock}</div>
            <div>
              <h1>${co.name}</h1>
              <p>${co.worksAddress || co.address}${co.pin ? `, ${co.pin}` : ""}</p>
            </div>
          </div>
        </div>
        <div class="top-right">
          <div class="original-tag">Original</div>
          <div class="tag">TAX INVOICE</div>
          <div class="inv-meta">
            <div><b>Inv No</b> : ${inv.invoice_no}</div>
            <div><b>Inv Date</b> : ${fmtDate(inv.invoice_date)}</div>
            <div><b>E-Way No</b> : ${inv.e_way_no || "—"}</div>
          </div>
        </div>
      </div>

      <div class="regd-row">
        <b>Registd. Office:</b> ${co.regdOffice || co.address}${co.pin ? `, Pincode: ${co.pin}` : ""}, Tamilnadu, INDIA<br/>
        ${co.phone ? `Ph: ${co.phone}` : ""}${co.email ? ` &nbsp; E-Mail: ${co.email}` : ""}${co.website ? ` &nbsp; Website: ${co.website}` : ""}
      </div>

      <div class="gst-strip">
        <span><b>GST No:</b> ${co.gst || "—"}</span>
        <span><b>PAN No:</b> ${co.pan || "—"}</span>
        <span><b>CIN No:</b> ${co.cin || "—"}</span>
        <span><b>Policy No:</b> ${co.policyNo || "—"}</span>
      </div>

      <div class="two-col-row">
        <div class="col-left">
          <h4>Consignee :</h4>
          ${inv.consignee_name || "—"}<br/>${consigneeBlock.replace(/\n/g, "<br/>")}
          ${inv.consignee_gst ? `<br/>GST No: ${inv.consignee_gst}, State Code: ${inv.consignee_state_code || "—"}` : ""}
        </div>
        <div class="col-right stacked">
          <div class="stack-cell">
            <b>PO No</b> : ${inv.po_no || "—"}<br/>
            <b>Confirm By</b> : ${inv.confirm_by || "—"}<br/>
            <b>Rate Type</b> : ${inv.rate_type || "—"}<br/>
            <b>Freight</b> : ${inv.freight_terms || "—"}
          </div>
          <div class="stack-cell">
            <b>PKG List No</b> : ${inv.pl_no || "—"}<br/>
            <b>PKG Date</b> : ${fmtDate(inv.pl_date)}
          </div>
        </div>
      </div>

      <div class="two-col-row">
        <div class="col-left">
          <h4>Delivery Address :</h4>
          ${inv.customer_name || inv.consignee_name || "—"}<br/>${deliveryBlock.replace(/\n/g, "<br/>")}
          ${inv.billing_gst ? `<br/>GST No: ${inv.billing_gst}` : ""}
        </div>
        <div class="col-right stacked">
          <div class="stack-cell">
            <b>LR No</b> : ${inv.lr_no || "—"}<br/>
            <b>LR Date</b> : ${fmtDate(inv.lr_date)}<br/>
            <b>Trans Mode</b> : ${inv.trans_mode || "Road"}
          </div>
          <div class="stack-cell">
            <b>Gross Wt</b> : ${fmt(inv.gross_wt || 0)}<br/>
            <b>Nett Wt</b> : ${fmt(inv.net_wt || 0)}
          </div>
        </div>
      </div>

      <div class="transport-row">
        <div class="transport-cell"><b>Transport</b> : ${inv.transport_name || "—"}</div>
        <div class="transport-cell"><b>Vehicle No</b> : ${inv.vehicle_no || "—"}</div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th style="width:36px">S.No</th>
            <th>Description of Goods</th>
            <th style="width:80px">HSN Code</th>
            <th class="right" style="width:70px">No of Rolls</th>
            <th class="right" style="width:80px">Qty</th>
            <th class="right" style="width:70px">Rate</th>
            <th class="right" style="width:110px">Basic Value</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="amount-words-row">
        <div class="amount-words">
          <b>Amount in Words:</b><br/>${amountInWords(inv.grand_total || 0)}
        </div>
        <div class="gst-box">
          <div class="g-row"><span>Discount ${fmt(inv.discount_percent || 0)}%</span><span>${fmt(inv.discount_amount || 0)}</span></div>
          <div class="g-row"><span>Sub Total</span><span>${fmt(inv.sub_total || 0)}</span></div>
          <div class="g-row"><span>CGST @ ${fmt(inv.cgst_percent || 0)}%</span><span>${fmt(inv.cgst_amount || 0)}</span></div>
          <div class="g-row"><span>SGST @ ${fmt(inv.sgst_percent || 0)}%</span><span>${fmt(inv.sgst_amount || 0)}</span></div>
          <div class="g-row"><span>IGST @ ${fmt(inv.igst_percent || 0)}%</span><span>${fmt(inv.igst_amount || 0)}</span></div>
          <div class="g-row"><span>Net Total</span><span>${fmt(netTotal)}</span></div>
          <div class="g-row"><span>TCS @ ${fmt(inv.tcs_percent || 0)}%</span><span>${fmt(inv.tcs_amount || 0)}</span></div>
          <div class="g-row"><span>Round off</span><span>${fmt(inv.round_off || 0)}</span></div>
          <div class="g-row total"><span>Grand Total</span><span>${fmt(inv.grand_total || 0)}</span></div>
        </div>
      </div>

      <div class="terms-bank-row">
        <div class="terms-cell">
          <b>Payment Terms:</b> ${inv.payment_terms || "—"}<br/><br/>
          <b>Terms &amp; Conditions:</b><br/>
          1. Interest will be charged @18% on bill, if payment not received within due date.<br/>
          2. We are not responsible for any loss or damage in transit.<br/>
          3. No Refund Policy.<br/>
          4. All disputes subject to Namakkal jurisdiction.
        </div>
        <div class="bank-cell">
          <b>Bank Name</b> : ${bankName} &nbsp; <b>Agent</b> : ${inv.bank_agent || "DIRECT"}<br/>
          <b>Branch</b> : ${bankBranch}<br/>
          <b>A/C No</b> : ${bankAccount}<br/>
          <b>IFSC Code</b> : ${bankIfsc}
        </div>
      </div>

      ${(inv.irn || inv.ack_no) ? `
      <div class="irn-row">
        <span>IRN: ${inv.irn || "—"}</span>
        <span>ACK No: ${inv.ack_no || "—"}</span>
        <span>ACK Dt: ${fmtDate(inv.ack_date)}</span>
      </div>` : ""}

      <div class="cert-row">
        <div class="cert-badges">${certBadges}</div>
        <div class="cert-qr"><img src="${qrSrc}" width="80" height="80" alt="QR" /></div>
      </div>

      <div class="sign-row">
        <div class="sign-cell">${inv.prepared_by || ""}<br/><br/>PREPARED BY</div>
        <div class="sign-cell">${inv.checked_by || ""}<br/><br/>CHECKED BY</div>
        <div class="sign-cell">
          For ${co.name}<br/><br/>
          ${inv.authorised_signed_at ? `<span class="small">Digitally Signed By ${inv.authorised_by || "—"}<br/>${fmtDate(inv.authorised_signed_at)}</span><br/>` : `${inv.authorised_by || ""}<br/>`}
          AUTHORISED BY
        </div>
      </div>

      <div class="footer">Printed on ${new Date().toLocaleString("en-IN")}${pageInfo ? ` &nbsp;|&nbsp; Page ${pageInfo.page} of ${pageInfo.total}` : ""}</div>
    </div>
  </div>`;
}

function buildPackingListHtml(inv: FabricInvoicePayload, pl: any, co: any, pageInfo?: { page: number; total: number }): string {
  const pieces: any[] = pl?.items || pl?.pieces || [];
  const rows = pieces.map((p, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${p.piece_no || p.new_piece_no || p.pieceNo || "—"}</td>
      <td class="right">${fmt(p.meter ?? p.qty ?? 0)}</td>
      <td class="right">${fmt(p.gross_wt ?? p.grossWt ?? 0)}</td>
      <td class="right">${fmt(p.net_wt ?? p.netWt ?? 0)}</td>
    </tr>`).join("");

  const totalMeter = pieces.reduce((s, p) => s + (Number(p.meter ?? p.qty) || 0), 0);
  const totalGross = pieces.reduce((s, p) => s + (Number(p.gross_wt ?? p.grossWt) || 0), 0);
  const totalNet = pieces.reduce((s, p) => s + (Number(p.net_wt ?? p.netWt) || 0), 0);

  const billBlock = fullAddressBlock(inv.billing_address, inv.billing_pincode, inv.billing_state, inv.billing_country);
  const deliveryBlock = fullAddressBlock(
    inv.delivery_address || inv.consignee_address,
    inv.delivery_pincode || inv.consignee_pincode,
    inv.delivery_state || inv.consignee_state,
    inv.delivery_country || inv.consignee_country
  );

  const qrData = encodeURIComponent(`PL:${pl?.pl_no || inv.pl_no || ""} | Order:${pl?.order_code || inv.order_code || ""}`);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${qrData}`;
  const logoBlock = co.logo
    ? `<img src="${co.logo}" alt="logo" style="width:100%" onerror="this.outerHTML='<div class=&quot;logo-fallback&quot;><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>'" />`
    : `<div class="logo-fallback"><span>${(co.name || "?").slice(0, 2).toUpperCase()}</span></div>`;

  return `
  <div class="sheet">
    <div class="box pl-box">
      <div class="pl-hdr">
        <div class="pl-hdr-logo">${logoBlock}</div>
        <div class="pl-hdr-center">
          <h1>${co.name}</h1>
          <p>${co.regdOffice || co.address}${co.pin ? `, ${co.pin}` : ""}</p>
          <p>${co.gst ? `GST No: ${co.gst}` : ""}${co.phone ? ` &nbsp; Ph: ${co.phone}` : ""}${co.email ? ` &nbsp; E-Mail: ${co.email}` : ""}</p>
        </div>
        <div class="pl-hdr-qr"><img src="${qrSrc}" width="70" height="70" alt="QR" /></div>
      </div>

      <div class="pl-title">PACKING LIST</div>

      <div class="meta-row">
        <div class="meta-cell">
          <b>Order No</b> : ${pl?.order_code || inv.order_code || "—"}<br/>
          <b>Sort No</b> : ${pl?.sort_no ?? "—"}
        </div>
        <div class="meta-cell">
          <b>PL No</b> : ${pl?.pl_no || inv.pl_no || "—"}<br/>
          <b>Date</b> : ${fmtDate(pl?.pl_date || inv.pl_date)}
        </div>
      </div>

      <div class="two-col-row">
        <div class="col-left">
          <h4>Billing To:</h4>
          ${inv.customer_name || "—"}<br/>${billBlock.replace(/\n/g, "<br/>")}
          ${inv.billing_gst ? `<br/>GST No: ${inv.billing_gst}` : ""}
        </div>
        <div class="col-left">
          <h4>Delivery At:</h4>
          ${inv.consignee_name || inv.customer_name || "—"}<br/>${deliveryBlock.replace(/\n/g, "<br/>")}
          ${inv.consignee_gst ? `<br/>GST No: ${inv.consignee_gst}` : ""}
        </div>
      </div>

      <div class="transport-row">
        <div class="transport-cell"><b>Quality</b> : ${pl?.quality || inv.items?.[0]?.description || "—"}</div>
      </div>
      <div class="transport-row">
        <div class="transport-cell"><b>Transport Name</b> : ${pl?.transport_name || inv.transport_name || "—"}</div>
        <div class="transport-cell"><b>Vehicle No</b> : ${pl?.vehicle_no || inv.vehicle_no || "—"}</div>
      </div>

      <table class="items pl-items">
        <thead>
          <tr>
            <th style="width:44px">S.No</th>
            <th>Piece No</th>
            <th class="right">Meter</th>
            <th class="right">Gross Wt</th>
            <th class="right">Net Wt</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="center small" style="padding:14px">No piece-level rows were returned for this Packing List.</td></tr>`}
        </tbody>
        <tfoot>
          <tr class="pl-total-row">
            <td colspan="2" class="right"><b>Total</b></td>
            <td class="right"><b>${fmt(totalMeter)}</b></td>
            <td class="right"><b>${fmt(totalGross)}</b></td>
            <td class="right"><b>${fmt(totalNet)}</b></td>
          </tr>
        </tfoot>
      </table>

      <div class="sign-row">
        <div class="sign-cell">${pl?.prepared_by || inv.prepared_by || ""}<br/><br/>PREPARED BY</div>
        <div class="sign-cell">${pl?.checked_by || inv.checked_by || ""}<br/><br/>CHECKED BY</div>
        <div class="sign-cell">${pl?.approved_by || inv.authorised_by || ""}<br/><br/>APPROVED BY</div>
      </div>

      <div class="footer">Printed on ${new Date().toLocaleString("en-IN")}${pageInfo ? ` &nbsp;|&nbsp; Page ${pageInfo.page} of ${pageInfo.total}` : ""}</div>
    </div>
  </div>`;
}

const PRINT_INVOICE_STYLES = `
  .inv-box, .pl-box { border:1.5px solid #1e293b; }
  .logo, .pl-hdr-logo { width:56px; flex-shrink:0; }
  .logo-fallback { width:56px; height:56px; border-radius:50%; background:#1e40af; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px; }
  .top-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .top-left { flex:1; padding:12px 16px; border-right:1.5px solid #1e293b; }
  .top-left-inner { display:flex; align-items:center; gap:12px; }
  .top-left h1 { color:#1d4ed8; font-size:20px; margin-bottom:6px; }
  .top-left p { font-size:11.5px; line-height:1.5; }
  .top-right { width:230px; display:flex; flex-direction:column; }
  .original-tag { text-align:right; font-size:10.5px; font-weight:700; color:#1d4ed8; padding:3px 10px 0; }
  .top-right .tag { background:#1e40af; color:#fff; text-align:center; font-weight:800; font-size:14px; padding:8px; letter-spacing:.05em; }
  .top-right .inv-meta { padding:8px 14px; font-size:11.5px; line-height:1.8; }
  .top-right .inv-meta b { display:inline-block; min-width:70px; }
  .regd-row { border-bottom:1.5px solid #1e293b; padding:8px 16px; font-size:11px; line-height:1.6; }
  .gst-strip { display:flex; flex-wrap:wrap; gap:4px 22px; border-bottom:1.5px solid #1e293b; padding:7px 16px; font-size:11px; }
  .two-col-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .col-left { flex:1.4; padding:10px 16px; font-size:11.5px; line-height:1.55; border-right:1.5px solid #1e293b; }
  .col-left h4 { font-size:12px; margin-bottom:4px; }
  .col-right.stacked { flex:1; display:flex; flex-direction:column; }
  .stack-cell { padding:9px 16px; font-size:11.5px; line-height:1.7; }
  .stack-cell + .stack-cell { border-top:1.5px solid #1e293b; }
  .col-right.stacked b, .col-left b { display:inline-block; min-width:78px; }
  .transport-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .transport-cell { flex:1; padding:9px 16px; font-size:11.5px; }
  .transport-cell:first-child { border-right:1.5px solid #1e293b; }
  table.items { width:100%; border-collapse:collapse; }
  table.items th { background:#111827; color:#fff; padding:8px 8px; font-size:11px; text-align:center; border-right:1px solid #475569; }
  table.items th:last-child { border-right:none; }
  table.items td { padding:7px 8px; font-size:11.5px; border-bottom:1px solid #cbd5e1; border-right:1px solid #e2e8f0; }
  table.items td:last-child { border-right:none; }
  .pl-total-row td { background:#f1f5f9; border-top:1.5px solid #1e293b; font-size:12px; }
  .amount-words-row { display:flex; border-top:1.5px solid #1e293b; }
  .amount-words { flex:1.6; padding:10px 16px; font-size:11.5px; border-right:1.5px solid #1e293b; }
  .gst-box { flex:1; }
  .gst-box .g-row { display:flex; justify-content:space-between; padding:5px 16px; font-size:11.5px; border-bottom:1px solid #e2e8f0; }
  .gst-box .g-row.total { font-weight:800; background:#f1f5f9; border-top:1.5px solid #1e293b; }
  .terms-bank-row { display:flex; border-top:1.5px solid #1e293b; }
  .terms-cell { flex:1; padding:10px 16px; font-size:11px; line-height:1.6; border-right:1.5px solid #1e293b; }
  .bank-cell { flex:1; padding:10px 16px; font-size:11.5px; line-height:1.7; }
  .irn-row { display:flex; border-top:1.5px solid #1e293b; font-size:10.5px; padding:6px 16px; justify-content:space-between; word-break:break-all; }
  .cert-row { display:flex; align-items:center; justify-content:space-between; gap:10px; border-top:1.5px solid #1e293b; padding:8px 16px; }
  .cert-badges { display:flex; flex-wrap:wrap; gap:6px; }
  .cert-badge { border:1px solid #1e40af; color:#1e40af; border-radius:20px; padding:2px 9px; font-size:9.5px; font-weight:700; white-space:nowrap; }
  .sign-row { display:flex; border-top:1.5px solid #1e293b; }
  .sign-cell { flex:1; padding:30px 16px 12px; font-size:11.5px; text-align:center; border-right:1.5px solid #1e293b; }
  .sign-cell:last-child { border-right:none; text-align:right; }
  .footer { text-align:right; font-size:9.5px; color:#94a3b8; padding:5px 16px; }
  .pl-hdr { display:flex; align-items:center; gap:14px; border-bottom:1.5px solid #1e293b; padding:12px 16px; }
  .pl-hdr-center { flex:1; text-align:center; }
  .pl-hdr-center h1 { color:#1d4ed8; font-size:18px; margin-bottom:4px; }
  .pl-hdr-center p { font-size:11px; line-height:1.5; }
  .pl-title { text-align:center; font-weight:800; font-size:14px; letter-spacing:.08em; padding:8px; border-bottom:1.5px solid #1e293b; background:#f1f5f9; }
  .meta-row { display:flex; border-bottom:1.5px solid #1e293b; }
  .meta-cell { flex:1; padding:9px 16px; font-size:11.5px; line-height:1.7; }
  .meta-cell:first-child { border-right:1.5px solid #1e293b; }
`;

function doPrintInvoice(inv: FabricInvoicePayload, co: any, pl?: any) {
  if (!inv) {
    alert("Could not load this invoice for printing. Please try again.");
    return;
  }
  const totalPages = pl ? 2 : 1;
  const invoiceHtml = buildTaxInvoiceHtml(inv, co, { page: 1, total: totalPages });
  const plHtml = pl ? buildPackingListHtml(inv, pl, co, { page: 2, total: totalPages }) : "";

  const win = window.open("", "_blank", "width=980,height=1200");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>${inv.invoice_no}${pl ? ` + ${pl.pl_no || inv.pl_no || "PL"}` : ""} — Print</title>
<style>${PRINT_DOC_STYLES}${PRINT_INVOICE_STYLES}</style></head>
<body>
  ${invoiceHtml}
  ${plHtml}
  <script>window.onload=()=>{window.print()}<\/script>
</body></html>`);
  win.document.close();
}

// ─── Row menu ────────────────────────────────────────────────────────────
const ROW_MENU_WIDTH = 200;
const ROW_MENU_HEIGHT_ESTIMATE = 216;

function RowMenu({ onPrint, onEdit, onComplete, onCancel, onDelete, status }: {
  onPrint: () => void; onEdit: () => void; onComplete: () => void; onCancel: () => void;
  onDelete: () => void; status: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const cancelled = status === "cancelled";
  const completed = status === "completed";
  const locked = cancelled || completed;
  const canDelete = cancelled;

  const computeCoords = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < ROW_MENU_HEIGHT_ESTIMATE && rect.top > ROW_MENU_HEIGHT_ESTIMATE;
    const top = openUpward ? rect.top - ROW_MENU_HEIGHT_ESTIMATE - 4 : rect.bottom + 4;
    let left = rect.right - ROW_MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - ROW_MENU_WIDTH - 8));
    setCoords({ top, left });
  }, []);

  const toggleOpen = () => {
    if (!open) computeCoords();
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && btnRef.current && !btnRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleReposition = () => computeCoords();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, computeCoords]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button ref={btnRef} className="fiv-dots-btn" onClick={toggleOpen}><MoreVertical size={16} /></button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          className="fiv-row-menu fiv-row-menu--portal"
          style={{ top: coords.top, left: coords.left, width: ROW_MENU_WIDTH }}
        >
          <button className="fiv-row-menu-item" onClick={() => { onPrint(); setOpen(false); }}>
            <Printer size={14} color="#2563eb" /> Print Invoice
          </button>
          <button className="fiv-row-menu-item" disabled={locked} onClick={() => { onEdit(); setOpen(false); }}>
            <PenLine size={14} color="#4338ca" /> Edit
          </button>
          <button className="fiv-row-menu-item" disabled={locked} onClick={() => { onComplete(); setOpen(false); }}>
            <CheckCircle2 size={14} color="#1e40af" /> Mark Completed
          </button>
          <div className="fiv-row-menu-sep" />
          <button className="fiv-row-menu-item fiv-row-menu-item--danger" disabled={locked}
            onClick={() => { onCancel(); setOpen(false); }}>
            <Ban size={14} color="#dc2626" /> Cancel Invoice
          </button>
          <button
            className="fiv-row-menu-item fiv-row-menu-item--danger"
            disabled={!canDelete}
            title={!canDelete ? "Cancel this invoice first before deleting it permanently" : undefined}
            onClick={() => { onDelete(); setOpen(false); }}
          >
            <Trash2 size={14} color="#dc2626" /> Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Export menu ─────────────────────────────────────────────────────────
function ExportMenu({ onCsv, onExcel, onPrint }: { onCsv: () => void; onExcel: () => void; onPrint: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button className="fiv-export-btn" onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="fiv-export-menu">
          <button className="fiv-export-menu-item" onClick={() => { onCsv(); setOpen(false); }}>
            <FileText size={14} color="#1e40af" /> Export CSV
          </button>
          <button className="fiv-export-menu-item" onClick={() => { onExcel(); setOpen(false); }}>
            <FileSpreadsheet size={14} color="#1e40af" /> Export Excel
          </button>
          <button className="fiv-export-menu-item" onClick={() => { onPrint(); setOpen(false); }}>
            <Printer size={14} color="#1e40af" /> Print List
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function FabricInvoice({ initialFilter }: { initialFilter?: string } = {}) {
  const [invoices, setInvoices] = useState<FabricInvoicePayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(initialFilter || "");
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const [editTarget, setEditTarget] = useState<FabricInvoicePayload | null>(null);
  const [editForm, setEditForm] = useState<FabricInvoicePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Auto-fetch Customer Order commercial data (Edit modal) — no dropdown,
  // just pulls from the order already linked to this invoice
  // (editForm.order_id), which was set when the invoice was created from
  // its Packing List.
  const [loadingOrderDefaults, setLoadingOrderDefaults] = useState(false);
  const [orderDefaultsError, setOrderDefaultsError] = useState("");
  const [orderDefaultsFetched, setOrderDefaultsFetched] = useState(false);

  // Auto-fetch Bank & Signatures details (Edit modal) — pulls Bank Name,
  // Branch, A/C No, IFSC Code from the Company Details Master row for
  // this invoice's own `firm` (AE / AEF). Same silent-on-open,
  // explicit-refresh-button pattern as the Customer Order section above.
  const [loadingCompanyBank, setLoadingCompanyBank] = useState(false);
  const [companyBankError, setCompanyBankError] = useState("");
  const [companyBankFetched, setCompanyBankFetched] = useState(false);

  // "Company (Print Header)" picker state (Edit modal). Mirrors
  // FabricPackingList.tsx's company selector: search box + dropdown +
  // live "Header Address Preview" box. companyPreview always reflects
  // whatever resolveCompanyInfoForInvoice(editForm) would resolve to
  // right now (explicit pick / Packing-List-inherited value if any, else
  // firm-based), so the preview is always "what will actually print".
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOptions, setCompanyOptions] = useState<any[]>([]);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [loadingCompanyOptions, setLoadingCompanyOptions] = useState(false);
  const [companySearchError, setCompanySearchError] = useState("");
  const [companyPreview, setCompanyPreview] = useState<any | null>(null);
  const [loadingCompanyPreview, setLoadingCompanyPreview] = useState(false);
  const companySearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyFieldWrapRef = useRef<HTMLDivElement | null>(null);

  const [cancelTarget, setCancelTarget] = useState<FabricInvoicePayload | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<FabricInvoicePayload | null>(null);
  const [completing, setCompleting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FabricInvoicePayload | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await getFabricInvoices();
      const body = res?.data ?? res;
      const rows = Array.isArray(body) ? body : (body?.data ?? body?.rows ?? []);
     
      setInvoices((rows || []).map(normalizeInvoice));
    } catch (err: any) {
      console.error("Fetch fabric invoices failed:", err?.response?.status, err?.response?.data || err?.message);
      setLoadError(
        err?.response?.status === 404
          ? "Invoice API route not found (404) — check that fabricInvoiceRoutes is mounted in server.js at /api/fabric-invoices."
          : err?.response?.data?.message || err?.message || "Failed to load invoices."
      );
      setInvoices([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => { if (initialFilter) setSearch(initialFilter); }, [initialFilter]);

  // Close the company search dropdown on outside click.
  useEffect(() => {
    if (!companyDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (companyFieldWrapRef.current && !companyFieldWrapRef.current.contains(e.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyDropdownOpen]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return invoices;
    return invoices.filter(inv =>
      (inv.invoice_no || "").toLowerCase().includes(q) ||
      (inv.pl_no || "").toLowerCase().includes(q) ||
      (inv.order_code || "").toLowerCase().includes(q) ||
      (inv.customer_name || "").toLowerCase().includes(q)
    );
  }, [invoices, search]);

  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const pageRows = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const handlePrintRow = async (inv: FabricInvoicePayload) => {
    let invData: FabricInvoicePayload = inv;
    try {
      const res = await getFabricInvoiceById(inv.id!);
      invData = normalizeInvoice(res?.data ?? res ?? inv);
    } catch {
      invData = inv;
    }

    let plData: any = null;
    if (Array.isArray((invData as any).pl_items) && (invData as any).pl_items.length) {
      plData = { pl_no: invData.pl_no, pl_date: invData.pl_date, items: (invData as any).pl_items };
    } else if (invData.pl_id && typeof fabricServices.getFabricPackingListById === "function") {
      try {
        const plRes = await fabricServices.getFabricPackingListById(invData.pl_id);
        plData = plRes?.data ?? plRes ?? null;
      } catch (e) {
        console.warn("Could not fetch linked Packing List for print (pl_id=" + invData.pl_id + "):", e);
        plData = null;
      }
    } else if (invData.pl_no) {
      console.info(
        "[FabricInvoice] No pl_id on this invoice (or getFabricPackingListById is missing from services.ts) " +
        "— printing invoice only."
      );
    }

    // Resolve the live company header/bank info before building the print
    // HTML — explicit/inherited/live-synced company_id first (this value
    // comes straight from GET /:id above, which the backend already
    // live-checks against the linked Packing List unless this invoice has
    // an explicit override — see the revision note at the top of this
    // file), firm second, static fallback last. This call is async, the
    // HTML builders themselves are not.
    const co = await resolveCompanyInfoForInvoice(invData);

    doPrintInvoice(invData, co, plData);
  };

  // Auto-fetch (and manual "Refresh") for this invoice's own linked
  // Customer Order — no dropdown, no picking: it always targets
  // editForm.order_id, the order this invoice was created from. Merges in
  // PO No, Confirm By, Freight, Rate Type, Rate (per M), Total Qty (M),
  // Discount %, plus GST % and bank details when the backend has them.
  // Never throws to the UI — a failed/empty fetch just surfaces a message
  // and leaves the existing form values untouched.
  const handleFetchOrderData = useCallback(async (orderId: string | number, opts: { silent?: boolean } = {}) => {
    if (!orderId) {
      if (!opts.silent) {
        setOrderDefaultsError("This invoice has no linked Customer Order (order_id is empty) — fill the fields in manually.");
      }
      return;
    }
    if (typeof fabricServices.getOrderCommercialDefaults !== "function") {
      setOrderDefaultsError(
        "getOrderCommercialDefaults is missing from services.ts — add: " +
        "export const getOrderCommercialDefaults = (orderId) => api.get(`/fabric-invoices/order-defaults/${orderId}`);"
      );
      return;
    }
    setLoadingOrderDefaults(true);
    setOrderDefaultsError("");
    try {
      const res = await fabricServices.getOrderCommercialDefaults(orderId);
      const defaults = res?.data ?? res ?? {};
      setOrderDefaultsFetched(true);
      if (!defaults || Object.keys(defaults).length === 0) {
        setOrderDefaultsError(
          "This order returned no matching commercial fields. The backend's ORDER_FIELD_CANDIDATES " +
          "column-name guesses don't match your order_bookings table — check GET /order-debug/:orderId " +
          "or GET /schema-debug directly (e.g. in Postman) to confirm the real column names."
        );
        return;
      }
      setEditForm(f => {
        if (!f) return f;
        const merged: any = { ...f };
        for (const key of [
          "po_no", "confirm_by", "freight_terms", "rate_type", "rate", "total_qty", "discount_percent",
          "cgst_percent", "sgst_percent", "igst_percent", "tcs_percent", "payment_terms", "firm",
        ]) {
          if (defaults[key] !== undefined && defaults[key] !== null && defaults[key] !== "") {
            merged[key] = defaults[key];
          }
        }
        return merged;
      });
      // The order's `firm` may have just changed the invoice's firm — if
      // so, the Bank & Signatures section (and the company print-header
      // preview, when no explicit/inherited company_id is set) should
      // re-resolve against the (possibly different) Company Details
      // Master row. Re-fetch silently so this doesn't surprise the user
      // with an error banner.
      if (defaults.firm) {
        handleFetchCompanyBank(defaults.firm, { silent: true });
        setEditForm(f => {
          if (!f || f.company_id) return f; // an explicit/inherited pick always wins
          refreshCompanyPreview({ ...f, firm: defaults.firm });
          return f;
        });
      }
    } catch (e: any) {
      setOrderDefaultsError(e?.response?.data?.message || e?.message || "Failed to load Customer Order defaults.");
    } finally {
      setLoadingOrderDefaults(false);
    }
  }, []);

  // Auto-fetch (and manual "Refresh") for this invoice's Bank &
  // Signatures section, sourced from the Company Details Master row
  // matching editForm.firm. Only non-empty company fields are merged in;
  // existing manual entries are preserved unless the user explicitly
  // clicks Refresh (which re-pulls and overwrites, same as the Customer
  // Order refresh button above).
  const handleFetchCompanyBank = useCallback(async (firm?: string, opts: { silent?: boolean } = {}) => {
    if (!firm) {
      if (!opts.silent) {
        setCompanyBankError("This invoice has no Firm set (usually comes from its Customer Order) — fill bank details in manually.");
      }
      return;
    }
    if (typeof fabricServices.getCompanyByFirm !== "function") {
      setCompanyBankError(
        "getCompanyByFirm is missing from services.ts — add: " +
        "export const getCompanyByFirm = (firm) => api.get(`/company-details/by-firm/${firm}`);"
      );
      return;
    }
    setLoadingCompanyBank(true);
    setCompanyBankError("");
    try {
      const res = await fabricServices.getCompanyByFirm(firm);
      const row = res?.data ?? res ?? {};
      setCompanyBankFetched(true);
      if (!row || !row.company_name) {
        setCompanyBankError(
          `No active Company Details Master profile found for firm "${firm}". ` +
          `Add one in Company Details Master, or fill Bank Name / Branch / A/C No / IFSC Code in manually below.`
        );
        return;
      }
      setEditForm(f => {
        if (!f) return f;
        const merged: any = { ...f };
        if (row.bank_name)  merged.bank_name = row.bank_name;
        if (row.branch_name) merged.bank_branch = row.branch_name;
        if (row.ac_no)      merged.bank_account_no = row.ac_no;
        if (row.ifsc_code)  merged.ifsc_code = row.ifsc_code;
        return merged;
      });
    } catch (e: any) {
      setCompanyBankError(e?.response?.data?.message || e?.message || "Failed to load bank details from Company Details Master.");
    } finally {
      setLoadingCompanyBank(false);
    }
  }, []);

  // ── Company (Print Header) picker ─────────────────────────────────────

  // Debounced search-as-you-type, same UX as the Packing List's company
  // dropdown. Fires on every keystroke in the search box, waits 300ms of
  // idle time, then calls the backend.
  const handleCompanyQueryChange = useCallback((q: string) => {
    setCompanyQuery(q);
    setCompanyDropdownOpen(true);
    setCompanySearchError("");
    if (companySearchDebounceRef.current) clearTimeout(companySearchDebounceRef.current);

    if (!q.trim()) {
      setCompanyOptions([]);
      return;
    }
    if (typeof fabricServices.searchCompanies !== "function") {
      setCompanySearchError(
        "searchCompanies is missing from services.ts — add: export const searchCompanies = (q) => " +
        "api.get(`/company-details/search`, { params: { q } });"
      );
      return;
    }
    companySearchDebounceRef.current = setTimeout(async () => {
      setLoadingCompanyOptions(true);
      try {
        const res = await fabricServices.searchCompanies(q);
        const body = res?.data ?? res;
        const rows = Array.isArray(body) ? body : (body?.data ?? body?.rows ?? []);
        setCompanyOptions(rows || []);
      } catch (e: any) {
        setCompanySearchError(e?.response?.data?.message || e?.message || "Company search failed.");
        setCompanyOptions([]);
      } finally {
        setLoadingCompanyOptions(false);
      }
    }, 300);
  }, []);

  // Re-computes the "what will actually print" preview box for whatever
  // invoice-shaped object is passed in — used on modal open, after
  // picking a company, after clearing a company, and after an order-data
  // refresh changes `firm`.
  const refreshCompanyPreview = useCallback(async (invLike: any) => {
    setLoadingCompanyPreview(true);
    try {
      const co = await resolveCompanyInfoForInvoice(invLike);
      setCompanyPreview(co);
    } finally {
      setLoadingCompanyPreview(false);
    }
  }, []);

  // Picking a company from search now marks it as an explicit override
  // (company_id_overridden: true) — see revision note at top of file.
  // This value persists on save (PUT spreads the whole form) and tells
  // GET /:id on the backend to stop live-syncing this invoice's header
  // company against its Packing List.
  const handlePickCompany = useCallback((row: any) => {
    setEditForm(f => (f ? { ...f, company_id: row.id, company_id_overridden: true } : f));
    setCompanyQuery("");
    setCompanyOptions([]);
    setCompanyDropdownOpen(false);
    refreshCompanyPreview({ company_id: row.id, firm: row.firm });
  }, [refreshCompanyPreview]);

  // Clearing removes the override too, so the invoice goes back to
  // live-syncing with its Packing List's company (or firm auto-lookup if
  // the Packing List has none) the next time it's opened or printed.
  const handleClearCompany = useCallback(() => {
    setEditForm(f => {
      if (!f) return f;
      const next = { ...f, company_id: null, company_id_overridden: false };
      refreshCompanyPreview(next);
      return next;
    });
    setCompanyQuery("");
    setCompanyOptions([]);
    setCompanyDropdownOpen(false);
  }, [refreshCompanyPreview]);

  const handleOpenEdit = async (inv: FabricInvoicePayload) => {
    setSaveError("");
    setOrderDefaultsError("");
    setOrderDefaultsFetched(false);
    setCompanyBankError("");
    setCompanyBankFetched(false);
    setCompanyQuery("");
    setCompanyOptions([]);
    setCompanyDropdownOpen(false);
    setCompanySearchError("");
    setCompanyPreview(null);
    setEditTarget(inv);

    let loaded: FabricInvoicePayload = inv;
    try {
      const res = await getFabricInvoiceById(inv.id!);
      loaded = normalizeInvoice(res?.data ?? res);
    } catch {
      loaded = inv;
    }
    setEditForm(loaded);

    // Auto-fetch this invoice's linked order's commercial data as soon as
    // the modal opens — no user action required. Silent: if there's no
    // order_id, we don't nag with an error banner on open.
    if (loaded.order_id) {
      handleFetchOrderData(loaded.order_id, { silent: true });
    }
    // Auto-fetch Bank & Signatures from Company Details Master, keyed by
    // this invoice's own firm. Also silent on open.
    if (loaded.firm) {
      handleFetchCompanyBank(loaded.firm, { silent: true });
    }
    // Always compute the "what will print" company preview on open —
    // whether the invoice's company_id currently reflects a live PL sync,
    // an explicit override, or is still relying on firm-based
    // auto-lookup (see the revision note at the top of this file).
    refreshCompanyPreview(loaded);
  };

  const closeEdit = () => {
    setEditTarget(null); setEditForm(null); setSaveError(""); setOrderDefaultsError("");
    setOrderDefaultsFetched(false);
    setCompanyBankError(""); setCompanyBankFetched(false);
    setCompanyQuery(""); setCompanyOptions([]); setCompanyDropdownOpen(false);
    setCompanySearchError(""); setCompanyPreview(null);
  };

  const recalcTotals = (f: FabricInvoicePayload): FabricInvoicePayload => {
    const basic = Number(f.rate || 0) * Number(f.total_qty || 0);
    const discAmt = +(basic * (Number(f.discount_percent) || 0) / 100).toFixed(2);
    const sub = +(basic - discAmt).toFixed(2);
    const cgst = +(sub * (Number(f.cgst_percent) || 0) / 100).toFixed(2);
    const sgst = +(sub * (Number(f.sgst_percent) || 0) / 100).toFixed(2);
    const igst = +(sub * (Number(f.igst_percent) || 0) / 100).toFixed(2);
    const tcs = +(sub * (Number(f.tcs_percent) || 0) / 100).toFixed(2);
    const raw = sub + cgst + sgst + igst + tcs;
    const rounded = Math.round(raw);
    return {
      ...f,
      basic_value: basic,
      discount_amount: discAmt,
      sub_total: sub,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tcs_amount: tcs,
      round_off: +(rounded - raw).toFixed(2),
      grand_total: rounded,
    };
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editTarget?.id) return;
    setSaving(true); setSaveError("");
    try {
      const payload = recalcTotals(editForm);
      await updateFabricInvoice(editTarget.id, payload);
      closeEdit();
      fetchInvoices();
    } catch (e: any) {
      setSaveError(e?.response?.data?.message || e?.message || "Failed to save invoice.");
    } finally { setSaving(false); }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget?.id) return;
    setCancelling(true);
    try {
      await cancelFabricInvoice(cancelTarget.id);
      setCancelTarget(null);
      fetchInvoices();
    } catch (e) { console.error("Cancel invoice failed:", e); }
    finally { setCancelling(false); }
  };

  const handleCompleteConfirm = async () => {
    if (!completeTarget?.id) return;
    setCompleting(true);
    try {
      await completeFabricInvoice(completeTarget.id);
      setCompleteTarget(null);
      fetchInvoices();
    } catch (e: any) {
      console.error("Mark invoice completed failed:", e?.response?.data || e?.message);
      alert(e?.response?.data?.message || "Failed to mark invoice completed.");
    } finally { setCompleting(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return;
    if (typeof fabricServices.deleteFabricInvoicePermanent !== "function") {
      setDeleteError(
        "deleteFabricInvoicePermanent is missing from services.ts — add: " +
        "export const deleteFabricInvoicePermanent = (id) => api.delete(`/fabric-invoices/${id}/permanent`);"
      );
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await fabricServices.deleteFabricInvoicePermanent(deleteTarget.id);
      setDeleteTarget(null);
      fetchInvoices();
    } catch (e: any) {
      console.error("Permanent delete invoice failed:", e?.response?.data || e?.message);
      setDeleteError(e?.response?.data?.message || e?.message || "Failed to delete invoice.");
    } finally {
      setDeleting(false);
    }
  };

  const exportRows = () => filtered.map((inv, i) => ({
    sNo: i + 1,
    invoice_no: inv.invoice_no || "",
    date: fmtDate(inv.invoice_date),
    pl_no: inv.pl_no || "",
    order_code: inv.order_code || "",
    customer_name: inv.customer_name || "",
    qty: Number(inv.total_qty || 0),
    grand_total: Number(inv.grand_total || 0),
    status: (STATUS_CFG[inv.status || "active"] || STATUS_CFG.active).label,
  }));

  const handleExportCsv = () => {
    const header = ["S.No", "Invoice No", "Date", "PL No", "Order No", "Customer", "Qty", "Grand Total", "Status"];
    const lines = [header.map(csvCell).join(",")];
    exportRows().forEach(r => {
      lines.push([
        r.sNo, r.invoice_no, r.date, r.pl_no, r.order_code, r.customer_name,
        fmt(r.qty), fmt(r.grand_total), r.status,
      ].map(csvCell).join(","));
    });
    downloadTextFile(`Fabric_Invoices_${today()}.csv`, lines.join("\r\n"));
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const header = ["S.No", "Invoice No", "Date", "PL No", "Order No", "Customer", "Qty", "Grand Total", "Status"];
      const rows = exportRows().map(r => [
        r.sNo, r.invoice_no, r.date, r.pl_no, r.order_code, r.customer_name,
        r.qty, r.grand_total, r.status,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [
        { wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
        { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fabric Invoices");
      XLSX.writeFile(wb, `Fabric_Invoices_${today()}.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
      alert("Excel export failed. Make sure the 'xlsx' package is installed.");
    }
  };

  const handlePrintList = () => {
    const rows = exportRows().map(r => `
      <tr>
        <td>${r.sNo}</td>
        <td>${r.invoice_no || "—"}</td>
        <td>${r.date}</td>
        <td>${r.pl_no || "—"}</td>
        <td>${r.order_code || "—"}</td>
        <td>${r.customer_name || "—"}</td>
        <td style="text-align:right">${fmt(r.qty)}</td>
        <td style="text-align:right">${fmt(r.grand_total)}</td>
        <td>${r.status}</td>
      </tr>`).join("");

    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Fabric Invoices — Print</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#1e293b; padding:20px 24px; }
  h2 { color:#1e40af; margin-bottom:2px; }
  p.meta { color:#64748b; margin-bottom:14px; font-size:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #cbd5e1; padding:6px 8px; font-size:11.5px; }
  th { background:#1e40af; color:#fff; text-align:left; }
  @media print { body { padding:8px; } }
</style></head>
<body>
  <h2>Fabric Invoices</h2>
  <p class="meta">Printed on ${new Date().toLocaleString("en-IN")} — ${filtered.length} record(s)</p>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Invoice No</th><th>Date</th><th>PL No</th><th>Order No</th>
        <th>Customer</th><th>Qty (M)</th><th>Grand Total</th><th>Status</th>
      </tr>
    </thead>
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
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fiv-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; min-height:100vh; background:#f1f5f9; }
        .fiv-page-header { padding:16px 28px; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:10px; }
        .fiv-page-header h1 { margin:0; font-size:20px; font-weight:800; color:#1e40af; }
        .fiv-page-header p  { margin:2px 0 0; font-size:12px; color:#64748b; }
        .fiv-export-btn { display:flex; align-items:center; gap:6px; background:#fff; color:#1e40af; border:1px solid #bfdbfe; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:700; cursor:pointer; }
        .fiv-export-menu { position:absolute; right:0; top:calc(100% + 6px); background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:500; min-width:190px; overflow:hidden; }
        .fiv-export-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; border:none; background:none; cursor:pointer; font-size:12.5px; color:#374151; text-align:left; }
        .fiv-export-menu-item:hover { background:#eff6ff; }
        .fiv-toolbar { padding:0 28px 16px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .fiv-search-wrap { position:relative; flex:1; min-width:180px; max-width:320px; }
        .fiv-search-wrap svg { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .fiv-search { width:100%; padding:8px 12px 8px 30px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff; outline:none; }
        .fiv-search:focus { border-color:#1e40af; }
        .fiv-rec-count { font-size:13px; color:#64748b; margin-left:auto; }
        .fiv-card { margin:0 28px 28px; background:#fff; border-radius:12px; box-shadow:0 1px 6px rgba(0,0,0,.07); border:1px solid #e2e8f0; overflow:hidden; }
        .fiv-table-wrap { overflow-x:auto; }
        .fiv-table { width:100%; border-collapse:collapse; font-size:13px; min-width:900px; }
        .fiv-table thead tr { background:#1e40af; }
        .fiv-table th { padding:11px 14px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .fiv-table th.th-r { text-align:right; }
        .fiv-table th.th-c { text-align:center; }
        .fiv-table tbody tr:nth-child(odd) td { background:#fff; }
        .fiv-table tbody tr:nth-child(even) td { background:#eff6ff; }
        .fiv-table td { padding:10px 14px; color:#374151; font-size:12.5px; white-space:nowrap; }
        .fiv-inv-no { font-family:'DM Mono',monospace; font-weight:700; color:#1e40af; background:#dbeafe; border:1px solid #93c5fd; border-radius:6px; padding:2px 7px; }
        .fiv-pl-no { font-weight:700; color:#4338ca; }
        .fiv-td-num { text-align:right; font-family:'DM Mono',monospace; font-weight:700; }
        .fiv-td-c { text-align:center; }
        .fiv-empty { text-align:center; padding:48px 16px; color:#94a3b8; font-size:13px; }
        .fiv-dots-btn { background:none; border:none; cursor:pointer; padding:4px; border-radius:6px; display:flex; align-items:center; color:#64748b; }
        .fiv-dots-btn:hover { background:#f1f5f9; }
        .fiv-row-menu { position:absolute; right:0; top:calc(100% + 4px); background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); z-index:500; min-width:200px; overflow:hidden; }
        .fiv-row-menu--portal { position:fixed; z-index:4000; }
        .fiv-row-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 14px; border:none; background:none; cursor:pointer; font-size:12.5px; color:#374151; text-align:left; }
        .fiv-row-menu-item:hover:not(:disabled) { background:#f8fafc; }
        .fiv-row-menu-item:disabled { opacity:.45; cursor:not-allowed; }
        .fiv-row-menu-item--danger { color:#dc2626; }
        .fiv-row-menu-sep { height:1px; background:#f1f5f9; margin:2px 0; }
        .fiv-pg-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; }
        .fiv-pg-btns { display:flex; gap:4px; align-items:center; }
        .fiv-pg-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
        .fiv-pg-btn.active { background:#1e40af; color:#fff; border-color:#1e40af; font-weight:700; }
        .fiv-pg-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .fiv-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:24px 16px; }
        .fiv-modal { background:#fff; border-radius:16px; width:100%; max-width:900px; box-shadow:0 8px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; max-height:calc(100vh - 48px); }
        .fiv-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; border-radius:16px 16px 0 0; background:linear-gradient(135deg,#1e40af,#1e3a8a); flex-shrink:0; }
        .fiv-modal-title { color:#fff; font-weight:700; font-size:18px; margin:0; }
        .fiv-modal-subtitle { font-size:11px; color:rgba(255,255,255,.75); font-family:'DM Mono',monospace; margin-top:2px; }
        .fiv-modal-close-btn { background:none; border:none; cursor:pointer; display:flex; opacity:.85; }
        .fiv-modal-body { padding:20px 24px; overflow-y:auto; flex:1; }
        .fiv-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 24px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 16px 16px; }
        .fiv-section-head { font-weight:700; font-size:13px; color:#1e40af; background:#dbeafe; border:1px solid #93c5fd; border-radius:10px; padding:10px 14px; margin-top:16px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .fiv-grid-3 { display:grid; grid-template-columns:1fr; gap:14px; }
        @media(min-width:480px){ .fiv-grid-3 { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:768px){ .fiv-grid-3 { grid-template-columns:repeat(3,1fr); } }
        .fiv-label { display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
        .fiv-input { width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; color:#1e293b; outline:none; background:#fff; }
        .fiv-input:focus { border-color:#1e40af; }
        .fiv-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }
        .fiv-cancel-btn { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; }
        .fiv-save-btn { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#1e40af; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
        .fiv-save-btn:disabled { opacity:.7; cursor:not-allowed; }
        .fiv-order-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; width:100%; }
        .fiv-debug-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #93c5fd; background:#fff; color:#1e40af; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
        .fiv-debug-btn:disabled { opacity:.5; cursor:not-allowed; }
        .fiv-total-preview { background:#dbeafe; border:1px solid #93c5fd; border-radius:12px; padding:14px 18px; margin-top:12px; display:flex; gap:24px; flex-wrap:wrap; }
        .fiv-total-item { display:flex; flex-direction:column; gap:2px; }
        .fiv-total-label { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
        .fiv-total-val { font-size:16px; font-weight:800; color:#1e40af; font-family:'DM Mono',monospace; }
        .fiv-confirm-overlay { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
        .fiv-confirm-box { background:#fff; border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.22); padding:28px 24px; max-width:400px; width:100%; text-align:center; }
        .fiv-confirm-title { font-size:17px; font-weight:700; color:#1e293b; margin:8px 0; }
        .fiv-confirm-sub { font-size:13px; color:#64748b; margin:0 0 22px; line-height:1.6; }
        .fiv-confirm-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .fiv-confirm-cancel { padding:9px 22px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#475569; font-weight:600; font-size:13px; cursor:pointer; }
        .fiv-confirm-del { padding:9px 22px; border:none; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
        .fiv-confirm-del:disabled { opacity:.6; cursor:not-allowed; }
        .fiv-confirm-ok { padding:9px 22px; border:none; border-radius:8px; background:#1e40af; color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
        .fiv-confirm-ok:disabled { opacity:.6; cursor:not-allowed; }
        /* Company (Print Header) picker */
        .fiv-company-wrap { position:relative; }
        .fiv-company-search { position:relative; }
        .fiv-company-search svg.fiv-company-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none; }
        .fiv-company-search input { padding-left:32px; }
        .fiv-company-dropdown { position:absolute; z-index:600; top:calc(100% + 4px); left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.16); max-height:240px; overflow-y:auto; }
        .fiv-company-opt { width:100%; text-align:left; padding:9px 14px; border:none; background:none; cursor:pointer; display:flex; flex-direction:column; gap:1px; }
        .fiv-company-opt:hover { background:#eff6ff; }
        .fiv-company-opt-name { font-size:13px; font-weight:700; color:#1e293b; }
        .fiv-company-opt-meta { font-size:11px; color:#64748b; }
        .fiv-company-empty { padding:10px 14px; font-size:12.5px; color:#94a3b8; }
        .fiv-company-preview { display:flex; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; margin-top:10px; }
        .fiv-company-preview-logo { width:44px; height:44px; border-radius:8px; object-fit:contain; background:#fff; border:1px solid #e2e8f0; flex-shrink:0; }
        .fiv-company-preview-logo-fallback { width:44px; height:44px; border-radius:8px; background:#1e40af; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0; }
        .fiv-company-preview-body { font-size:12px; color:#475569; line-height:1.6; }
        .fiv-company-preview-name { font-size:13.5px; font-weight:700; color:#166534; }
        .fiv-company-clear-btn { display:flex; align-items:center; gap:4px; background:none; border:none; color:#dc2626; font-size:12px; font-weight:700; cursor:pointer; padding:2px 4px; }
        .fiv-company-badge { display:inline-block; font-size:9.5px; font-weight:700; padding:2px 8px; border-radius:20px; margin-left:8px; vertical-align:middle; }
        .fiv-company-badge--override { background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
        .fiv-company-badge--live { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
      `}</style>

      <div className="fiv-wrap">
        <div className="fiv-page-header">
          <div>
            <h1>Invoice</h1>
            <p>Tax invoices generated from converted packing lists</p>
          </div>
          <ExportMenu onCsv={handleExportCsv} onExcel={handleExportExcel} onPrint={handlePrintList} />
        </div>

        <div className="fiv-toolbar">
          <div className="fiv-search-wrap">
            <Search size={13} />
            <input className="fiv-search" placeholder="Search invoice no, PL no, order, customer…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="fiv-rec-count">{filtered.length} record(s)</span>
        </div>

        {loadError && (
          <div style={{
            margin: "0 28px 16px", display: "flex", alignItems: "center", gap: 8,
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
            color: "#dc2626", padding: "10px 16px", fontSize: 13,
          }}>
            <AlertCircle size={15} />
            <span>{loadError}</span>
            <button onClick={fetchInvoices} style={{ marginLeft: "auto", background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 10px", cursor: "pointer", color: "#dc2626", fontSize: 12 }}>
              Retry
            </button>
          </div>
        )}

        <div className="fiv-card">
          <div className="fiv-table-wrap">
            <table className="fiv-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>PL No</th>
                  <th>Order No</th>
                  <th>Customer</th>
                  <th className="th-r">Qty (M)</th>
                  <th className="th-r">Grand Total</th>
                  <th className="th-c">Status</th>
                  <th className="th-c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="fiv-empty"><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={10} className="fiv-empty">
                    {search ? "No invoices match your search." : "No invoices yet. Convert a Packing List to create one."}
                  </td></tr>
                ) : pageRows.map((inv, i) => (
                  <tr key={inv.id}>
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * LIMIT + i + 1}</td>
                    <td><span className="fiv-inv-no">{inv.invoice_no}</span></td>
                    <td style={{ color: "#64748b" }}>{fmtDate(inv.invoice_date)}</td>
                    <td><span className="fiv-pl-no">{inv.pl_no || "—"}</span></td>
                    <td>{inv.order_code || "—"}</td>
                    <td>{inv.customer_name || "—"}</td>
                    <td className="fiv-td-num">{fmt(inv.total_qty || 0)}</td>
                    <td className="fiv-td-num">₹{fmt(inv.grand_total || 0)}</td>
                    <td className="fiv-td-c"><StatusBadge status={inv.status || "active"} /></td>
                    <td className="fiv-td-c">
                      <RowMenu
                        status={inv.status || "active"}
                        onPrint={() => handlePrintRow(inv)}
                        onEdit={() => handleOpenEdit(inv)}
                        onComplete={() => setCompleteTarget(inv)}
                        onCancel={() => setCancelTarget(inv)}
                        onDelete={() => { setDeleteError(""); setDeleteTarget(inv); }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="fiv-pg-bar">
              <span>Page {page} of {totalPages} — {filtered.length} record(s)</span>
              <div className="fiv-pg-btns">
                <button className="fiv-pg-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="fiv-pg-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`fiv-pg-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="fiv-pg-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="fiv-pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* EDIT MODAL */}
        {editTarget && editForm && (
          <div className="fiv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
            <div className="fiv-modal">
              <div className="fiv-modal-header">
                <div>
                  <h2 className="fiv-modal-title">✏️ Edit Invoice</h2>
                  <p className="fiv-modal-subtitle">{editForm.invoice_no}</p>
                </div>
                <button className="fiv-modal-close-btn" onClick={closeEdit}><X size={20} color="#fff" /></button>
              </div>

              <div className="fiv-modal-body">
                {saveError && (
                  <div className="fiv-error-banner">
                    <AlertCircle size={15} /><span>{saveError}</span>
                  </div>
                )}

                {/* Company (Print Header). Live-syncs with whatever
                    company the source Packing List has picked — go change
                    it there and this invoice's header updates
                    automatically next time it's opened or printed (see
                    the revision note at the top of this file). Explicitly
                    picking a different company here overrides that sync
                    (badge below shows which mode is active); Clear
                    removes the override and returns to live-sync /
                    firm-based auto-lookup. */}
                <div className="fiv-section-head">
                  <span>
                    Company (Print Header)
                    {editForm.company_id ? (
                      <span className={`fiv-company-badge ${editForm.company_id_overridden ? "fiv-company-badge--override" : "fiv-company-badge--live"}`}>
                        {editForm.company_id_overridden ? "Manual Override" : "Live from Packing List"}
                      </span>
                    ) : null}
                  </span>
                  {editForm.company_id ? (
                    <button type="button" className="fiv-company-clear-btn" onClick={handleClearCompany}>
                      <XCircle size={13} /> Clear (use Firm auto-match)
                    </button>
                  ) : null}
                </div>

                {companySearchError && (
                  <div className="fiv-error-banner">
                    <AlertCircle size={15} /><span>{companySearchError}</span>
                  </div>
                )}

                <div className="fiv-company-wrap" ref={companyFieldWrapRef}>
                  <div className="fiv-company-search">
                    <Building2 size={14} className="fiv-company-search-icon" />
                    <input
                      className="fiv-input"
                      placeholder="Search company name, code or firm…"
                      value={companyQuery}
                      onFocus={() => setCompanyDropdownOpen(true)}
                      onChange={e => handleCompanyQueryChange(e.target.value)}
                    />
                  </div>
                  {companyDropdownOpen && companyQuery.trim() && (
                    <div className="fiv-company-dropdown">
                      {loadingCompanyOptions ? (
                        <div className="fiv-company-empty">
                          <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 6 }} />
                          Searching…
                        </div>
                      ) : companyOptions.length === 0 ? (
                        <div className="fiv-company-empty">No matching companies found.</div>
                      ) : companyOptions.map((row: any) => (
                        <button key={row.id} type="button" className="fiv-company-opt" onClick={() => handlePickCompany(row)}>
                          <span className="fiv-company-opt-name">{row.company_name}</span>
                          <span className="fiv-company-opt-meta">
                            {row.firm ? `Firm: ${row.firm}` : ""}{row.gst_no ? `  •  GST: ${row.gst_no}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="fiv-company-preview">
                  {loadingCompanyPreview ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#64748b" }}>
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading header preview…
                    </span>
                  ) : companyPreview ? (
                    <>
                      {companyPreview.logo ? (
                        <img className="fiv-company-preview-logo" src={companyPreview.logo} alt="logo" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="fiv-company-preview-logo-fallback">{(companyPreview.name || "?").slice(0, 2).toUpperCase()}</div>
                      )}
                      <div className="fiv-company-preview-body">
                        <div className="fiv-company-preview-name">{companyPreview.name}</div>
                        <div>{companyPreview.worksAddress || companyPreview.address}{companyPreview.pin ? `, ${companyPreview.pin}` : ""}</div>
                        <div>
                          {companyPreview.gst ? `GST No: ${companyPreview.gst}` : ""}
                          {companyPreview.phone ? `  •  Ph: ${companyPreview.phone}` : ""}
                          {companyPreview.email ? `  •  ${companyPreview.email}` : ""}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>
                          {editForm.company_id
                            ? (editForm.company_id_overridden
                                ? "Explicitly overridden on this invoice — will NOT change even if the Packing List's company changes later."
                                : "Live-synced from this invoice's Packing List — automatically updates if the Packing List's company changes.")
                            : `Auto-matched from Firm "${editForm.firm || "—"}" — pick a company above to override.`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: 12.5, color: "#94a3b8" }}>
                      No company resolved yet — search and pick one above, or make sure this invoice's Firm is set.
                    </span>
                  )}
                </div>

                {orderDefaultsError && (
                  <div className="fiv-error-banner">
                    <AlertCircle size={15} /><span>{orderDefaultsError}</span>
                  </div>
                )}

                {/* Customer Order — auto-fetched from the order already
                    linked to this invoice (editForm.order_id). There is no
                    manual picker: it always targets the order this invoice
                    was created from. "Refresh order data" re-pulls PO No,
                    Confirm By, Freight, Rate Type, Rate, Total Qty, and
                    Discount % (plus GST % and Firm when available)
                    from that order. */}
                <div className="fiv-section-head">
                  <span>
                    Customer Order
                    {editForm.order_code ? (
                      <span style={{ fontWeight: 400, color: "#1e40af", marginLeft: 8 }}>— {editForm.order_code}</span>
                    ) : null}
                  </span>
                  <div className="fiv-order-row" style={{ width: "auto", flex: 1, justifyContent: "flex-end" }}>
                    {loadingOrderDefaults && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Fetching order data…
                      </span>
                    )}
                    {!loadingOrderDefaults && orderDefaultsFetched && !orderDefaultsError && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#166534" }}>
                        <CheckCircle2 size={14} /> Order data loaded
                      </span>
                    )}
                    <button
                      type="button"
                      className="fiv-debug-btn"
                      disabled={!editForm.order_id || loadingOrderDefaults}
                      onClick={() => handleFetchOrderData(editForm.order_id!)}
                      title="Re-fetch PO No, Confirm By, Freight, Rate Type, Rate, Total Qty and Discount % from this invoice's Customer Order"
                    >
                      <Link2 size={13} /> {orderDefaultsFetched ? "Refresh" : "Fetch"} order data
                    </button>
                  </div>
                </div>

                {!editForm.order_id && (
                  <div className="fiv-error-banner" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                    <AlertCircle size={15} />
                    <span>
                      This invoice has no linked Customer Order (order_id is empty), so PO No, Confirm By,
                      Freight, Rate Type, Rate, Total Qty and Discount % can't be auto-fetched — fill them in manually below.
                    </span>
                  </div>
                )}

                <div className="fiv-grid-3">
                  <div><label className="fiv-label">PO No</label>
                    <input className="fiv-input" value={editForm.po_no || ""} onChange={e => setEditForm(f => ({ ...f!, po_no: e.target.value }))} /></div>
                  <div><label className="fiv-label">Confirm By</label>
                    <input className="fiv-input" value={editForm.confirm_by || ""} onChange={e => setEditForm(f => ({ ...f!, confirm_by: e.target.value }))} /></div>
                  <div><label className="fiv-label">Rate Type</label>
                    <input className="fiv-input" value={editForm.rate_type || ""} onChange={e => setEditForm(f => ({ ...f!, rate_type: e.target.value }))} /></div>
                  <div><label className="fiv-label">Freight</label>
                    <input className="fiv-input" value={editForm.freight_terms || ""} onChange={e => setEditForm(f => ({ ...f!, freight_terms: e.target.value }))} /></div>
                  <div><label className="fiv-label">E-Way No</label>
                    <input className="fiv-input" value={editForm.e_way_no || ""} onChange={e => setEditForm(f => ({ ...f!, e_way_no: e.target.value }))} /></div>
                  <div><label className="fiv-label">Invoice Date</label>
                    <input className="fiv-input" type="date" value={(editForm.invoice_date || "").slice(0, 10)} onChange={e => setEditForm(f => ({ ...f!, invoice_date: e.target.value }))} /></div>
                </div>

                <div className="fiv-section-head"><span>Pricing &amp; GST</span></div>
                <div className="fiv-grid-3">
                  <div><label className="fiv-label">Rate (per M)</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.rate ?? 0} onChange={e => setEditForm(f => ({ ...f!, rate: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><label className="fiv-label">Total Qty (M)</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.total_qty ?? 0} onChange={e => setEditForm(f => ({ ...f!, total_qty: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><label className="fiv-label">Discount %</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.discount_percent ?? 0} onChange={e => setEditForm(f => ({ ...f!, discount_percent: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><label className="fiv-label">CGST %</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.cgst_percent ?? 0} onChange={e => setEditForm(f => ({ ...f!, cgst_percent: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><label className="fiv-label">SGST %</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.sgst_percent ?? 0} onChange={e => setEditForm(f => ({ ...f!, sgst_percent: parseFloat(e.target.value) || 0 }))} /></div>
                  <div><label className="fiv-label">IGST %</label>
                    <input className="fiv-input" type="number" step="0.01" value={editForm.igst_percent ?? 0} onChange={e => setEditForm(f => ({ ...f!, igst_percent: parseFloat(e.target.value) || 0 }))} /></div>
                </div>

                <div className="fiv-total-preview">
                  {(() => {
                    const preview = recalcTotals(editForm);
                    return (
                      <>
                        <div className="fiv-total-item"><span className="fiv-total-label">Basic Value</span><span className="fiv-total-val">{fmt(preview.basic_value)}</span></div>
                        <div className="fiv-total-item"><span className="fiv-total-label">Sub Total</span><span className="fiv-total-val">{fmt(preview.sub_total)}</span></div>
                        <div className="fiv-total-item"><span className="fiv-total-label">Grand Total</span><span className="fiv-total-val">₹{fmt(preview.grand_total)}</span></div>
                      </>
                    );
                  })()}
                </div>

                {/* Bank & Signatures — auto-fetched from Company Details
                    Master (company_details table) keyed by this invoice's
                    own Firm (AE / AEF). "Refresh bank details" re-pulls
                    Bank Name, Branch, A/C No and IFSC Code from that
                    company profile. Prepared By / Authorised By stay
                    manual — those are per-invoice signatures, not company
                    data. */}
                <div className="fiv-section-head">
                  <span>
                    Bank &amp; Signatures
                    {editForm.firm ? (
                      <span style={{ fontWeight: 400, color: "#1e40af", marginLeft: 8 }}>— Firm: {editForm.firm}</span>
                    ) : null}
                  </span>
                  <div className="fiv-order-row" style={{ width: "auto", flex: 1, justifyContent: "flex-end" }}>
                    {loadingCompanyBank && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Fetching bank details…
                      </span>
                    )}
                    {!loadingCompanyBank && companyBankFetched && !companyBankError && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#166534" }}>
                        <CheckCircle2 size={14} /> Bank details loaded
                      </span>
                    )}
                    <button
                      type="button"
                      className="fiv-debug-btn"
                      disabled={!editForm.firm || loadingCompanyBank}
                      onClick={() => handleFetchCompanyBank(editForm.firm)}
                      title="Re-fetch Bank Name, Branch, A/C No and IFSC Code from Company Details Master for this invoice's Firm"
                    >
                      <Link2 size={13} /> {companyBankFetched ? "Refresh" : "Fetch"} bank details
                    </button>
                  </div>
                </div>

                {companyBankError && (
                  <div className="fiv-error-banner">
                    <AlertCircle size={15} /><span>{companyBankError}</span>
                  </div>
                )}
                {!editForm.firm && (
                  <div className="fiv-error-banner" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                    <AlertCircle size={15} />
                    <span>
                      This invoice has no Firm set (normally pulled from its Customer Order), so bank details
                      can't be auto-fetched from Company Details Master — fill them in manually below.
                    </span>
                  </div>
                )}

                <div className="fiv-grid-3">
                  <div><label className="fiv-label">Bank Name</label>
                    <input className="fiv-input" value={editForm.bank_name || ""} onChange={e => setEditForm(f => ({ ...f!, bank_name: e.target.value }))} /></div>
                  <div><label className="fiv-label">Branch</label>
                    <input className="fiv-input" value={editForm.bank_branch || ""} onChange={e => setEditForm(f => ({ ...f!, bank_branch: e.target.value }))} /></div>
                  <div><label className="fiv-label">A/C No</label>
                    <input className="fiv-input" value={editForm.bank_account_no || ""} onChange={e => setEditForm(f => ({ ...f!, bank_account_no: e.target.value }))} /></div>
                  <div><label className="fiv-label">IFSC Code</label>
                    <input className="fiv-input" value={editForm.ifsc_code || ""} onChange={e => setEditForm(f => ({ ...f!, ifsc_code: e.target.value }))} /></div>
                  <div><label className="fiv-label">Prepared By</label>
                    <input className="fiv-input" value={editForm.prepared_by || ""} onChange={e => setEditForm(f => ({ ...f!, prepared_by: e.target.value }))} /></div>
                  <div><label className="fiv-label">Authorised By</label>
                    <input className="fiv-input" value={editForm.authorised_by || ""} onChange={e => setEditForm(f => ({ ...f!, authorised_by: e.target.value }))} /></div>
                </div>
              </div>

              <div className="fiv-modal-footer">
                <button className="fiv-cancel-btn" onClick={closeEdit}>Cancel</button>
                <button className="fiv-save-btn" disabled={saving} onClick={handleSaveEdit}>
                  {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "💾 Save Invoice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CANCEL CONFIRM */}
        {cancelTarget && (
          <div className="fiv-confirm-overlay">
            <div className="fiv-confirm-box">
              <AlertCircle size={36} color="#dc2626" />
              <p className="fiv-confirm-title">Cancel Invoice?</p>
              <p className="fiv-confirm-sub">
                This marks <strong>{cancelTarget.invoice_no}</strong> as cancelled and reopens
                its packing list <strong>{cancelTarget.pl_no}</strong> so it can be converted again.
              </p>
              <div className="fiv-confirm-actions">
                <button className="fiv-confirm-cancel" onClick={() => setCancelTarget(null)}>Keep Invoice</button>
                <button className="fiv-confirm-del" disabled={cancelling} onClick={handleCancelConfirm}>
                  {cancelling ? "Cancelling…" : "Yes, Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MARK COMPLETED CONFIRM */}
        {completeTarget && (
          <div className="fiv-confirm-overlay">
            <div className="fiv-confirm-box">
              <CheckCircle2 size={36} color="#1e40af" />
              <p className="fiv-confirm-title">Mark Invoice Completed?</p>
              <p className="fiv-confirm-sub">
                This marks <strong>{completeTarget.invoice_no}</strong> and its packing list{" "}
                <strong>{completeTarget.pl_no}</strong> as <strong>Completed</strong>. Use this
                once the invoice is fully settled (e.g. payment received / dispatch confirmed).
              </p>
              <div className="fiv-confirm-actions">
                <button className="fiv-confirm-cancel" onClick={() => setCompleteTarget(null)}>Not Yet</button>
                <button className="fiv-confirm-ok" disabled={completing} onClick={handleCompleteConfirm}>
                  {completing ? "Marking…" : "Yes, Mark Completed"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERMANENT DELETE CONFIRM */}
        {deleteTarget && (
          <div className="fiv-confirm-overlay">
            <div className="fiv-confirm-box">
              <Trash2 size={36} color="#dc2626" />
              <p className="fiv-confirm-title">Delete Invoice Permanently?</p>
              <p className="fiv-confirm-sub">
                This <strong>permanently removes</strong> invoice <strong>{deleteTarget.invoice_no}</strong>{" "}
                and its line items from the database. This action cannot be undone.
              </p>
              {deleteError && (
                <div className="fiv-error-banner" style={{ textAlign: "left" }}>
                  <AlertCircle size={15} /><span>{deleteError}</span>
                </div>
              )}
              <div className="fiv-confirm-actions">
                <button className="fiv-confirm-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>Keep Invoice</button>
                <button className="fiv-confirm-del" disabled={deleting} onClick={handleDeleteConfirm}>
                  {deleting ? "Deleting…" : "Yes, Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}