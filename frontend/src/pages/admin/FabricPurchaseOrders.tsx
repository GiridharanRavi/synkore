// @ts-nocheck
// frontend/src/pages/admin/FabricPurchaseOrders.tsx
//
// NOTE: This file is UNCHANGED from your last working version except for
// ONE targeted fix inside selectPlan()'s diagnostic toast (see "SHIPPING
// TO DIAGNOSTIC TOAST FIX" below). Everything else — the autofill chain,
// the print layout, the row-actions kebab menu, the Company/Supplier/
// Plan dropdowns — is exactly as before.
//
//   • PendingPlan interface already declares customer_address_line1,
//     customer_district, customer_state, customer_pincode,
//     customer_country, customer_contact_no, customer_gstin.
//   • formatCustomerShipToBlock() already builds the multi-line block from
//     those fields.
//   • selectPlan() already writes that block into `ship_from` ("Shipping
//     To") when a plan is linked, and clears it when unlinked.
//
// SHIPPING TO DIAGNOSTIC TOAST FIX (this revision):
//   The old diagnostic toast (fired only when shipToBlock ends up empty)
//   just confirmed the JOIN worked — "joinMode=..., matched customer=...,
//   has customer row=true" — without ever checking whether the matched
//   customer row actually HAS address data, or whether the debug route
//   itself failed. That was misleading in two ways:
//     1. If GET /pending-purchase/debug/:rec_no 500'd (as it did with the
//        backend's ReferenceError bug), .then(r => r.json()) parsed the
//        error body ({message, sqlMessage}) instead of a real debug
//        payload, and every dbg.* field used in the toast came back
//        undefined — producing a nonsensical "Customer 'this customer'
//        was found (joinMode=undefined)..." message.
//     2. Even with a healthy debug response, the old message never looked
//        at dbg.result (which the debug route already computes) — so it
//        could never tell you "the data WAS resolved but didn't reach the
//        form" (a frontend bug) apart from "the customer has no address
//        on file at all" (a data problem). Those need very different
//        fixes, so the toast now distinguishes them explicitly.
//   The corresponding backend fix (fabric-purchase-orders.js — restoring
//   the plan-level *Expr variables inside the debug route's Step 5, which
//   were being referenced without ever being declared in that route's
//   scope) is what actually stops the 500. This frontend change only
//   makes the toast trustworthy once that 500 is gone; it does not change
//   the autofill logic itself.
//
// Plan-link autofill chain:
//   Selecting an Order Plan No auto-fills:
//     • purchase_qty  (header field)
//     • items[0].sort_no       ← from plan.order_sort_no
//     • items[0].construction  ← from plan.constn_for_production
//     • items[0].qty           ← from plan.purchase_qty
//     • remarks                ← descriptive default (editable)
//     • "Shipping To"          ← from the customer's address on file for
//                                 this plan (see formatCustomerShipToBlock())
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
//
// ROW ACTIONS ADDITION (July 2026):
//   The per-row Edit / Print / Delete buttons were replaced with a single
//   3-dot ("⋮") kebab menu (see RowActionsMenu below) to reduce row width.
//
// KEBAB-MENU PORTAL FIX (July 2026):
//   The row-actions dropdown was silently failing to appear. Root cause:
//   `.fpo-table tbody tr:hover td { filter:brightness(0.97); }` applies a
//   CSS `filter` to the <td> on hover, and `filter` creates a new
//   containing block for any `position:fixed` descendant (same as
//   `transform`/`perspective`/`will-change`). Since the kebab button (and
//   its fixed-position panel) live inside that <td>, while the row was
//   hovered the panel's fixed coordinates were being resolved against the
//   filtered <td> instead of the viewport — so it rendered off-screen /
//   behind other content instead of under the button.
//   Fix: render the panel through a React Portal into document.body, so
//   it's structurally outside the table and immune to any ancestor
//   filter/transform/overflow. The hover rule was also switched from
//   `filter` to a plain `background` change to remove the landmine for
//   any future fixed-position UI added inside table rows.
//
// SUPPLIER ADDRESS AUTOFILL (July 2026):
//   Selecting a Supplier in the "Supplier" lookup now auto-fills
//   "Billing From" with that supplier's registered address, built from
//   the supplier's individual address components (Address Line 1,
//   District, State, Pincode, Country — the same fields shown in the
//   Supplier Master's own address form), the same way selecting an
//   Order Plan No auto-fills the construction items. The field stays
//   editable afterwards, and clearing the supplier clears the
//   auto-filled address too. See formatSupplierAddress() / selectSupplier()
//   below.
//
// PAGE-SIZE SELECTOR ADDITION (July 2026):
//   Added a "Show N entries" dropdown to the toolbar, matching the
//   em-page-size / et-page-size pattern used on the Employee Master and
//   Employee Tracker tables. The previously hardcoded LIMIT constant is
//   now pageSize state; changing it resets to page 1, same as changing
//   the search box.
//
// ROW ACTIONS SIMPLIFIED (prior revision):
//   "Convert to Purchase Invoice" has been removed from the row's 3-dot
//   menu — it now only shows Edit / Print / Delete, as requested. Nothing
//   else changed. The backend route
//   (POST /api/fabric-purchase-orders/:id/convert-to-invoice) was left
//   untouched in case this is wired back in from elsewhere later; this
//   file simply no longer calls it, and all the state/handlers/modal that
//   only existed to support that action (convertTarget, converting,
//   convertError, convertedInvoiceNo, convertInvoiceNo, convertInvoiceDate,
//   openConvert, closeConvert, handleConvertConfirm, the "Convert to
//   Purchase Invoice?" confirm dialog, the convertFpoToPurchaseInvoice
//   import, and the FileOutput icon) have been removed for cleanliness.
//
// COMPANY-BRANDED PRINT LAYOUT (prior revision):
//   handlePrintFpo() was rebuilt to match the official "Purchase Order"
//   print format (logo + company block, Order No/Date/Due Date/Place of
//   Supply grid, Order To / Shipping From boxes, item table with
//   Quality/HSN/Qty/Unit/Price/Taxable Price/GST/Amount, amount-in-words,
//   Sub Total/Total/Advance/Balance box, HSN-wise CGST+SGST tax summary,
//   terms & signatory block). Company identity comes from a Company
//   Details Master via getCompanyDetails(), falling back to
//   FALLBACK_COMPANY if that master isn't wired up yet.
//
// PRINT DATA-FRESHNESS FIX + SUPPLIER GSTIN/CONTACT/AGENT BLOCK
// (prior revision):
//   Two issues fixed together:
//
//   1. BUG: printing straight from a table row used the row object as
//      returned by the LIST endpoint (getFabricPurchaseOrders), which
//      only carries summary columns — no `items[]`, so the printed PO
//      showed "Quantity 0.00 / ₹0.00" everywhere even though the saved
//      FPO has real line items. handlePrintFpo() is now async: it opens
//      the print window immediately (synchronously, so popup blockers
//      don't block it), shows a lightweight "Loading…" placeholder, then
//      re-fetches the full record via getFabricPurchaseOrderById(id)
//      before writing the final HTML. If the refetch fails, it falls back
//      to whatever was passed in rather than leaving a blank window.
//
//   2. Order To box now also prints the supplier's Contact No, GSTIN,
//      State, and Agent's Name — pulled from the Supplier Master (already
//      loaded in `suppliers` state) by matching on supplier name, the
//      same lookup pattern used for Billing From. New optional fields
//      (contact_no, gstin, agent_name) were added to the Supplier
//      interface with the usual column-name-variant fallbacks; `state`
//      already existed. Any field that's blank on the supplier record is
//      simply omitted from the printout.
//
// SUPPLIER ADDRESS → DELIVERY TO AUTOFILL RESTORED (prior revision):
//   The "Billing From" field no longer exists on this form (removed in an
//   earlier revision), so the supplier-address autofill described above
//   had nowhere to write to and was silently doing nothing. It now writes
//   to "Delivery To" instead: selecting a Supplier builds the same
//   address string (Address Line 1, District, State, Pincode, Country —
//   normalized via the usual column-name-variant fallbacks) and drops it
//   into Delivery To. The field stays fully editable afterwards, and
//   clearing the supplier (or picking one with no address on file) clears
//   the auto-filled text back out. See formatSupplierAddress() and
//   selectSupplier() below.
//
// COMPANY (PRINT HEADER) PERSISTENCE FIX (prior revision):
//   Picking a company in "Company (Print Header)" was never actually
//   surviving a save — the backend's create/update endpoints didn't
//   accept `company_id` (or `due_date` / `place_of_supply` / `ship_from`
//   / `advance` / `description`) at all, so every printed PO fell back to
//   FALLBACK_COMPANY ("Your Company Name") regardless of what was picked
//   on screen. This is a backend fix (see fabric-purchase-orders.js) —
//   no frontend change was needed for it beyond what already existed
//   here, since `company_id` was already included in the payload sent to
//   createFabricPurchaseOrder()/updateFabricPurchaseOrder() via the `...form`
//   spread.
//
// PRINT LAYOUT SIMPLIFIED (prior revision):
//   The "Order To" box (supplier name + contact/GSTIN/state/agent) has
//   been removed from the printed Purchase Order entirely, per request.
//   That row of the letterhead now shows only "Delivery To" and
//   "Shipping From" side by side. Nothing else about the print layout
//   changed. The two autofill chains that already existed are unaffected
//   and still work exactly as before:
//     • Company (Print Header) picker → fills the logo/name/address/
//       GSTIN/phone/email block at the top-left of the printed PO
//       (see selectCompany() / CompanyDropdown / CompanyHeaderPreview).
//     • Supplier picker → auto-fills the "Delivery To" field with that
//       supplier's registered address (see selectSupplier() /
//       formatSupplierAddress()). Still fully editable afterwards.
//
// SUPPLIER → DELIVERY TO RICH AUTOFILL + COMPANY-ID TYPE-SAFETY FIX
// (prior revision):
//   1. "Delivery To" now auto-fills a full multi-line block instead of
//      just a one-line address — Address, District/City, State, Pincode,
//      Country, then Contact No, Agent Name, Email and GSTIN, each on
//      their own line, labelled, whenever the Supplier Master has that
//      field populated. The field is now a textarea so the multi-line
//      text is readable, and remains fully editable / clears on unlink,
//      same as before. See formatSupplierDeliveryBlock() / selectSupplier().
//   2. DIAGNOSTIC: getSuppliers() now logs the first raw supplier record
//      returned by the API to the console, and the column-name-variant
//      fallback lists were widened (state_name/stateName/taluk/city_name/
//      pin/zip_code/etc.) — if your Supplier Master API uses column names
//      outside this list, that console line shows you the exact field
//      name to add.
//   3. BUG: printed PO header still showed FALLBACK_COMPANY even after
//      selecting a company, in cases where company_id came back from the
//      API as a string (e.g. "5") while the Company dropdown's `value`
//      is a number — `x.id === fpo.company_id` silently failed. All
//      company-id comparisons (dropdown "selected" lookup, form preview,
//      and the print header lookup) are now Number()-normalized on both
//      sides so this mismatch can't happen regardless of what type the
//      API returns. A console diagnostic also logs fpo.company_id and the
//      loaded companies list at print time so a still-missing company_id
//      (i.e. the backend/DB fix from fabric-purchase-orders.js not yet
//      applied) is immediately visible instead of silently falling back.
//
// COMPANY LOGO/ADDRESS VISIBILITY + SUPPLIER "CONTACT NAME" FIELD
// (prior revision):
//   1. The Company (Print Header) picker previously only showed the
//      company's name in its collapsed/selected state and in the list of
//      options — the registered address only appeared in the separate
//      "Header Address Preview" box underneath. The collapsed trigger and
//      each option row in the dropdown now also show the logo (already
//      present) alongside a one-line address underneath the company name,
//      so the address is visible everywhere the company name appears, not
//      just in the preview box.
//   2. Supplier Master now has a distinct "Contact Name" field (the named
//      person to contact, separate from the "Agent" field). Added
//      `contact_name` to the Supplier interface with the usual
//      column-name-variant fallbacks, and it now prints its own labelled
//      line ("Contact Name: …") in the auto-filled "Delivery To" block,
//      ahead of Agent/Email/GSTIN. Same "editable afterwards, clears on
//      unlink" behavior as every other autofilled field on this form.
//
// COMPANY ADDRESS FIELD-MAPPING FIX + TIMES NEW ROMAN PRINT + TABLE
// ALIGNMENT FIX (prior revision):
//   1. BUG: the Company Details Master (see its own form) stores the
//      registered address as ONE multi-line `address` field plus a
//      separate `pincode` and `cin_no` — not `address_line1/2/3`. The
//      printed PO's company block was reading only address_line1/2/3
//      (always empty for this master), so the address silently vanished
//      from the header while GSTIN/Phone/State kept printing fine.
//      `CompanyDetails` now has `address` / `pincode` / `cin_no` fields
//      (address_line1/2/3 kept as a fallback for other data sources),
//      getCompanyDetails() maps them with the usual column-name-variant
//      fallbacks, formatCompanyAddress() prefers `address` + appends the
//      pincode, and the print header now also shows the CIN when present.
//   2. Printed PO now renders in Times New Roman throughout (was Segoe
//      UI/Arial) for a more formal, letterhead-style look.
//   3. BUG: the meta-grid's "Due Date" row only had one <td> where the
//      table has two columns, leaving a blank half-width gap next to it
//      and throwing off the box's vertical alignment. Due Date now spans
//      both columns (colspan=2), the outer/meta tables use
//      table-layout:fixed so declared column widths are always honored,
//      and meta-grid cells are vertically centered instead of top-aligned
//      so short values like "Due Date" don't look stranded.
//
// COMPANY LOGO NOT PRINTING — RESOLUTION + WIDER DETECTION (prior
// revision):
//   BUG: the company logo displayed fine everywhere inside the app
//   (picker trigger, dropdown options, header preview) but printed as an
//   empty bordered box ("No Logo") on the actual Purchase Order. The
//   first fix widened the raw-field lookup (logo_url/logo/company_logo/…)
//   and added a resolveAssetUrl() helper — but that helper resolved
//   relative paths against `window.location.origin`, which is only
//   correct if the API and the frontend share an origin.
//
// COMPANY LOGO STILL NOT PRINTING — REAL ROOT CAUSE FIXED (prior
// revision):
//   BUG: `window.location.origin` is the ORIGIN THE REACT APP ITSELF IS
//   SERVED FROM (the Vite dev server, e.g. http://localhost:5173) — not
//   the backend API server that actually stores and serves the uploaded
//   logo file (http://localhost:5000). Resolving a relative/bare path
//   against the wrong origin produces a URL that 404s against the
//   frontend dev server, so the <img onerror> handler always fell back
//   to the "No Logo" placeholder — both inside the app and on the
//   printed PO — even though `logo_path` was populated correctly in the
//   database (confirmed via Workbench: a bare filename like
//   "1783923227427-logo.png", no folder, no leading slash).
//   Fix:
//     1. New `ASSET_ORIGIN` constant holds the backend's origin
//        (http://localhost:5000 — derived from the same base URL
//        api/services uses to call the API, with any trailing "/api"
//        stripped). Adjust this if your backend origin differs between
//        dev/staging/prod — ideally pull it from an env var
//        (VITE_API_URL) rather than hardcoding, see the TODO below.
//     2. New `COMPANY_LOGO_DIR` constant ("/uploads/company-logos/")
//        prefixes bare filenames (no leading "/") before resolution,
//        since the DB is storing just the filename, not a path. Adjust
//        this to match whatever folder your backend's multer/static
//        config actually serves company logos from, if different.
//     3. resolveAssetUrl() now resolves against ASSET_ORIGIN instead of
//        window.location.origin, so the same absolute URL works
//        correctly both inside the app and inside the print popup
//        window (which also has no base URL of its own).
//
// "ORDER TO" / "SHIPPING TO" RELABEL + SHIPPING-TO CUSTOMER-ADDRESS
// AUTOFILL (prior revision):
//   1. RELABEL: the two address boxes on the form and on the printed PO
//      were renamed —
//        • "Delivery To"  → "Order To"      (unchanged data source: the
//          selected Supplier's address/contact — see selectSupplier() /
//          formatSupplierDeliveryBlock()). The underlying field/DB column
//          is still called `delivery_to` so no backend/migration change
//          is needed; only the label shown to the user changed.
//        • "Shipping From" → "Shipping To"  (data source CHANGED — see
//          #2 below). The underlying field/DB column is still called
//          `ship_from` for the same reason (no schema change needed);
//          only the label changed.
//   2. NEW AUTOFILL: "Shipping To" was a blank manual text box before.
//      It now auto-fills — the same way the Construction Items do — from
//      the customer's address on file for whichever Order Plan No is
//      linked, built from PendingPlan.customer_* fields (Address, City/
//      District, State, Pincode, Country, Contact No, GSTIN — see
//      formatCustomerShipToBlock() / selectPlan() below) and normalized
//      with the same column-name-variant fallback pattern already used
//      for Suppliers (see loadPendingPlans()). The field is now a
//      textarea (was a single-line input) so the multi-line address is
//      readable, stays fully editable afterwards, and clears when the
//      plan is unlinked — same "autofill, editable, clears on unlink"
//      behavior as every other autofilled field on this form.
//      NOTE: this depends on production_plans (or however your API joins
//      in the customer) actually exposing customer address columns. If
//      your schema uses different column names than the ones guessed in
//      loadPendingPlans()'s fallback list, "Shipping To" will simply stay
//      blank on plan selection — add the real column name to that list.
//
//   THIS REVISION'S FIX WAS ENTIRELY ON THE BACKEND: GET /pending-purchase
//   now LEFT JOINs an auto-detected customer master table so the
//   customer_* fields consumed by formatCustomerShipToBlock() below are
//   actually populated. See fabric-purchase-orders.js for that change —
//   nothing in this file needed to change.

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Plus, Search, X, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, Info,
  AlertTriangle, Trash2, PlusCircle, Check,
  Printer, Download, FileSpreadsheet, FileText,
  MoreVertical, Building2,
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
  // NOTE: getCompanyDetails is expected to live in ../../api/services
  // alongside the other master-data getters (getSuppliers, getHsnCodes,
  // etc.) and hit something like GET /api/company-details (or whatever
  // your Company Master endpoint is). It is expected to return the LIST
  // of companies in the Company Details Master (id, company_name,
  // company_code, firm, gstin, address, logo_url, etc.) — the same
  // dropdown surfaced elsewhere in the app as "Company (Print Header)".
  getCompanyDetails,
  FabricPurchaseOrderPayload,
  FpoItem,
} from "../../api/services";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: number;
  name: string;
  supplier_code?: string;
  city?: string;
  state?: string;
  contact_no?: string;
  gstin?: string;
  agent_name?: string;
  // Named person to contact at this supplier — distinct from agent_name
  // (agent_name is the assigned sales agent; contact_name is the actual
  // contact person on the Supplier Master's own contact form). Used to
  // add a labelled "Contact Name" line to the auto-filled "Order To"
  // block (see formatSupplierDeliveryBlock()).
  contact_name?: string;
  email?: string;
  // Address components — same fields shown on the Supplier Master's own
  // address form. Used to build the auto-filled "Order To" text when a
  // supplier is selected (see formatSupplierAddress() / selectSupplier()).
  address_line1?: string;
  district?: string;
  pincode?: string;
  country?: string;
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
  // ── Customer / "Shipping To" address components ──
  // Sourced from production_plans (or whatever the pending-purchase
  // endpoint joins in for the customer) via the usual column-name-variant
  // fallback pattern — see loadPendingPlans(). Used to build the
  // auto-filled "Shipping To" block when this plan is linked (see
  // formatCustomerShipToBlock() / selectPlan()).
  customer_address_line1?: string;
  customer_district?: string;
  customer_state?: string;
  customer_pincode?: string;
  customer_country?: string;
  customer_contact_no?: string;
  customer_gstin?: string;
}

interface HsnEntry {
  code: string;
  description: string;
}

// Company Details Master — mirrors the fields shown on that master's own
// form (Company Name, Address, Pin Code, GST No, CIN No, Logo, Phone,
// Email, State…). Used to brand the printed Purchase Order header exactly
// like the official letterhead: logo + name + address + phone + email +
// GSTIN + state, top-left, next to the Order No / Date / Due Date grid.
// The Company Details Master holds MULTIPLE companies/entities (the
// business operates across several — see the "Company (Print Header)"
// picker below), so this file loads the full list and lets the user pick
// which one prints on each FPO.
interface CompanyDetails {
  id: number;
  name: string;
  code?: string;
  firm?: string;
  logo_url?: string;
  // Debug only — the exact raw-API key name the logo was found under
  // (e.g. "logo_url", "image", "attachment"…), so a missing logo is
  // instantly diagnosable from the Company dropdown's own toast, without
  // needing to open DevTools. Not sent anywhere, purely informational.
  _logoSourceKey?: string;
  // The Company Master's own form (see its "Address" textarea) stores the
  // registered address as ONE multi-line field, with pincode and CIN as
  // separate fields alongside it — NOT split into address_line1/2/3. That
  // legacy line1/2/3 shape is kept below purely as a fallback for other
  // data sources that might still use it.
  address?: string;
  pincode?: string;
  cin_no?: string;
  address_line1?: string;
  address_line2?: string;
  address_line3?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  state?: string;
}

// Fallback used until the Company Details Master endpoint is available or
// while it's still loading, so Print never renders a blank header. Replace
// with your own defaults, or better — wire up getCompanyDetails() to your
// Company Master and this is never shown in production.
const FALLBACK_COMPANY: CompanyDetails = {
  id: 0,
  name: "Your Company Name",
  address: "",
  pincode: "",
  cin_no: "",
  address_line1: "",
  address_line2: "",
  address_line3: "",
  phone: "",
  email: "",
  gstin: "",
  state: "",
};

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
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 380, pointerEvents: "none" }}>
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
  { key: "delivery_to",   label: "Order To" },
  { key: "ship_from",     label: "Shipping To" },
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

// ─── Row Actions Menu (3-dot / kebab) ─────────────────────────────────────────
// Replaces the old inline Edit / Print / Delete buttons in the table's
// Actions column. The dropdown panel is rendered through a React Portal
// into document.body — NOT inline inside the <td> — so it is completely
// unaffected by ancestor CSS such as overflow:hidden/auto, transform, or
// (critically) the `.fpo-table tbody tr:hover td { filter:... }` hover
// rule, which otherwise silently re-anchors position:fixed descendants to
// the filtered <td> instead of the viewport.
//
// Only Edit / Print / Delete — "Convert to Purchase Invoice" has been
// removed per request.

interface RowActionsMenuProps {
  onEdit: () => void;
  onPrint: () => void;
  onDelete: () => void;
}
function RowActionsMenu({ onEdit, onPrint, onDelete }: RowActionsMenuProps) {
  const [open, setOpen]   = useState(false);
  const triggerRef        = useRef<HTMLButtonElement>(null);
  const panelRef          = useRef<HTMLDivElement>(null);
  const [pos, setPos]     = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r          = triggerRef.current.getBoundingClientRect();
      const menuW       = 230;
      const menuH       = 140; // 3 items instead of 4+dividers — shorter panel
      const spaceBelow  = window.innerHeight - r.bottom;
      const top   = spaceBelow > menuH + 8 ? r.bottom + 4 : Math.max(8, r.top - menuH - 4);
      const left  = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
      setPos({ top, left: Math.max(8, left) });
    }
    setOpen(o => !o);
  };

  const Item = ({
    icon, label, onClick, danger,
  }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      type="button"
      className={`fpo-row-menu-item${danger ? " fpo-row-menu-item--danger" : ""}`}
      onClick={() => { setOpen(false); onClick(); }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  // ── PORTAL: mount the panel on document.body instead of inline ──
  const panel = open ? (
    <div
      ref={panelRef}
      className="fpo-row-menu-panel"
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 230, zIndex: 9999 }}
    >
      <Item icon={<span style={{ fontSize: 14, lineHeight: 1 }}>✏️</span>} label="Edit" onClick={onEdit} />
      <Item icon={<Printer size={14} color="#0284c7" />} label="Print" onClick={onPrint} />
      <div className="fpo-row-menu-divider" />
      <Item icon={<Trash2 size={14} color="#dc2626" />} label="Delete" onClick={onDelete} danger />
    </div>
  ) : null;

  return (
    <>
      <button ref={triggerRef} type="button" className="fpo-row-menu-btn" onClick={toggle} title="Actions">
        <MoreVertical size={16} />
      </button>

      {panel && createPortal(panel, document.body)}
    </>
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

// Formats a company's own registered address (from the Company Details
// Master) into a single display string for both the "Header Address
// Preview" shown under the picker and the printed PO letterhead.
//
// The Company Master's own form stores the address as ONE multi-line
// `address` field plus a separate `pincode` — NOT split into
// address_line1/2/3. `address` is preferred when present; the legacy
// line1/2/3 shape is kept as a fallback for any other data source that
// might still use it. Newlines in `address` are preserved by the caller
// (handlePrintFpo) where they matter for print formatting.
const formatCompanyAddress = (c?: CompanyDetails | null): string => {
  if (!c) return "";
  const base = c.address
    ? c.address.trim()
    : [c.address_line1, c.address_line2, c.address_line3].filter(Boolean).join(", ");
  if (!base) return c.pincode ? `PIN: ${c.pincode}` : "";
  return c.pincode && !base.includes(c.pincode) ? `${base} - ${c.pincode}` : base;
};

// ── LOGO FIX (prior revision) ────────────────────────────────────────────────
// ROOT CAUSE: `window.location.origin` is the origin the REACT APP is
// served from (the Vite dev server, e.g. http://localhost:5173) — not the
// BACKEND API server that actually stores/serves the uploaded logo file.
// Resolving a relative or bare filename against the wrong origin produces
// a URL that 404s, which is why the logo silently fell back to "No Logo"
// both inside the app and on the printed PO, even though `logo_path` is
// populated correctly in the database.
//
// TODO: if your backend origin differs between dev / staging / production
// (it almost certainly will), replace the hardcoded fallback below with
// an env var, e.g.:
//   const ASSET_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "")
//     ?? "http://localhost:5000";
// The value below matches what you're currently running locally
// (http://localhost:5000/api, with the trailing /api stripped).
const ASSET_ORIGIN = "http://localhost:5000";

// The DB stores just the bare filename for company logos (e.g.
// "1783923227427-logo.png" — confirmed via Workbench: no folder, no
// leading slash). This is the folder the backend actually serves those
// files from. CONFIRM this against your backend's multer/static-serve
// config (e.g. `app.use("/uploads/company-logos", express.static(...))`)
// — if the real folder name differs, update it here.
const COMPANY_LOGO_DIR = "/uploads/company-logos/";

// Resolves a possibly-relative asset path (e.g. "/uploads/logos/xyz.png"
// or a bare filename like "xyz.png") into an absolute URL pointing at the
// BACKEND server, and unwraps common nested shapes a logo field might
// come back as (a bare string, or an object like { url } / { path } /
// { src } some upload APIs return instead of a bare string). Needed both
// because the printed PO opens in a brand-new blank popup window with no
// base URL of its own, AND because the frontend app itself is served
// from a different origin than the backend that stores the file.
const resolveAssetUrl = (raw: unknown): string => {
  let url = "";
  if (typeof raw === "string") {
    url = raw;
  } else if (raw && typeof raw === "object") {
    url = (raw as any).url ?? (raw as any).path ?? (raw as any).src ?? "";
  }
  url = (url || "").toString().trim();
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;

  // Bare filename, no folder at all (e.g. "1783923227427-logo.png") —
  // prefix with the backend's upload folder before it's a usable path.
  if (!url.startsWith("/")) {
    url = COMPANY_LOGO_DIR + url;
  }

  // Resolve against the BACKEND's origin — not window.location.origin,
  // which is the frontend dev/prod server and has no /uploads route.
  try {
    return new URL(url, ASSET_ORIGIN).href;
  } catch {
    return url;
  }
};

// Formats a supplier's registered address (Address Line 1, District,
// State, Pincode, Country — the same fields shown on the Supplier
// Master's own address form) into a single display string. Still used
// wherever a compact one-line address is needed (e.g. print).
const formatSupplierAddress = (s?: Supplier | null): string => {
  if (!s) return "";
  const cityOrDistrict = s.district || s.city || "";
  return [s.address_line1, cityOrDistrict, s.state, s.pincode, s.country]
    .filter(Boolean)
    .join(", ");
};

// Builds the full multi-line "Order To" block auto-filled when a
// Supplier is selected: registered address on the first line(s), then a
// labelled line each for Contact Name, Contact No, Agent Name, Email, and
// GSTIN, whenever the Supplier Master has that field populated. Blank
// fields are simply omitted rather than printed as "—", so the block
// stays clean for suppliers with partial data on file. Still fully
// editable afterwards. (Writes into the `delivery_to` field/column — the
// on-screen label was renamed to "Order To", see the top-of-file note.)
const formatSupplierDeliveryBlock = (s?: Supplier | null): string => {
  if (!s) return "";
  const lines: string[] = [];
  const address = formatSupplierAddress(s);
  if (address) lines.push(address);
  if (s.pincode && !address.includes(s.pincode)) lines.push(`PIN: ${s.pincode}`);
  if (s.contact_name) lines.push(`Contact Name: ${s.contact_name}`);
  if (s.contact_no) lines.push(`Contact No: ${s.contact_no}`);
  if (s.agent_name) lines.push(`Agent: ${s.agent_name}`);
  if (s.email) lines.push(`Email: ${s.email}`);
  if (s.gstin) lines.push(`GSTIN: ${s.gstin}`);
  return lines.join("\n");
};

// Builds the full multi-line "Shipping To" block auto-filled when an
// Order Plan No is linked: the customer's address on file for that plan
// (Address Line 1, District/City, State, Pincode, Country — normalized
// via the usual column-name-variant fallbacks in loadPendingPlans()),
// followed by labelled Contact No / GSTIN lines whenever present. Blank
// fields are simply omitted, same as formatSupplierDeliveryBlock() above.
// Still fully editable afterwards, and clears when the plan is unlinked.
// (Writes into the `ship_from` field/column — the on-screen label was
// renamed to "Shipping To", see the top-of-file note.)
const formatCustomerShipToBlock = (p?: PendingPlan | null): string => {
  if (!p) return "";
  const lines: string[] = [];
  const address = [p.customer_address_line1, p.customer_district, p.customer_state, p.customer_pincode, p.customer_country]
    .filter(Boolean)
    .join(", ");
  if (address) lines.push(address);
  if (p.customer_pincode && !address.includes(p.customer_pincode)) lines.push(`PIN: ${p.customer_pincode}`);
  if (p.customer_contact_no) lines.push(`Contact No: ${p.customer_contact_no}`);
  if (p.customer_gstin) lines.push(`GSTIN: ${p.customer_gstin}`);
  return lines.join("\n");
};

// Converts a rupee amount into words using the Indian numbering system
// (Crore / Lakh / Thousand / Hundred), e.g. 3207750 → "Thirty Two Lakh
// Seven Thousand Seven Hundred Fifty Rupees only". Used on the printed
// Purchase Order under "Order Amount in Words".
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigitsToWords = (n: number): string => {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
};
const threeDigitsToWords = (n: number): string => {
  if (n >= 100) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigitsToWords(n % 100) : "");
  return twoDigitsToWords(n);
};
const numberToWordsIndian = (num: number): string => {
  let n = Math.floor(Math.max(0, num));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  const rest  = n;
  let words = "";
  if (crore) words += threeDigitsToWords(crore) + " Crore ";
  if (lakh)  words += threeDigitsToWords(lakh)  + " Lakh ";
  if (thou)  words += threeDigitsToWords(thou)  + " Thousand ";
  if (rest)  words += threeDigitsToWords(rest)  + " ";
  return words.trim();
};
const amountInWords = (amount: number): string =>
  `${numberToWordsIndian(amount)} Rupees only`;

// ─── Factories ────────────────────────────────────────────────────────────────

const emptyItem = (): FpoItem => ({
  sort_no: "", construction: "", hsn_code: "", qty: 0, rate: 0, basic_value: 0,
  unit: "MTR",
});

const defaultForm = (): FabricPurchaseOrderPayload => ({
  fpo_no: "", fpo_date: today(), supplier: "",
  delivery_to: "", pay_terms: "", pinning: "", packing_type: "",
  rate_type: "", freight: "", delivery_dt: today(), remarks: "",
  cgst_pct: 0, sgst_pct: 0, igst_pct: 0,
  sub_total: 0, cgst_amt: 0, sgst_amt: 0, igst_amt: 0, net_value: 0,
  items: [emptyItem()],
  plan_id: null,
  plan_rec_no: "",
  order_no: "",
  purchase_qty: 0,
  // New PO-print-only fields — all optional, all editable, all default to
  // sensible fallbacks if left blank (see handlePrintFpo).
  due_date: today(),
  place_of_supply: "",
  ship_from: "",
  advance: 0,
  description: "",
  // Which entity from the Company Details Master prints on this FPO's
  // letterhead (logo, name, address, GSTIN…). Defaults to none selected —
  // the print falls back to FALLBACK_COMPANY until one is picked.
  company_id: null,
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

// ─── Company (Print Header) Dropdown ──────────────────────────────────────────
// Lets the user pick which entity in the Company Details Master prints on
// this FPO's letterhead — the business operates across multiple entities
// (see AgentMaster / OrderStatusMaster "Firm" field), so this mirrors the
// same "Company (Print Header)" search dropdown used on the Packing List:
// logo thumbnail, company name, code + GSTIN, and a small Firm badge.
//
// Both the collapsed/selected trigger and each option row also show a
// one-line registered address underneath the company name (in addition to
// the logo), so the address is visible everywhere the company name
// appears — not just in the separate "Header Address Preview" box below.
interface CompanyDropdownProps {
  value: number | null;
  onChange: (company: CompanyDetails | null) => void;
  companies: CompanyDetails[];
  loading: boolean;
}
function CompanyDropdown({ value, onChange, companies, loading }: CompanyDropdownProps) {
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
  const filtered = companies.filter(c =>
    (c.name ?? "").toLowerCase().includes(q) ||
    (c.code ?? "").toLowerCase().includes(q) ||
    (c.firm ?? "").toLowerCase().includes(q)
  );

  const selected = value != null ? companies.find(c => Number(c.id) === Number(value)) : null;
  const selectedAddress = selected ? formatCompanyAddress(selected) : "";

  return (
    <div className="fpo-sup-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fpo-sup-trigger fpo-co-trigger${open ? " open" : ""}${value ? " has-value" : ""}`}
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
      >
        <span className="fpo-sup-content">
          {loading ? (
            <span className="fpo-sup-placeholder" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading companies…
            </span>
          ) : selected ? (
            <span className="fpo-co-selected">
              <span className="fpo-co-avatar">
                {selected.logo_url ? <img src={selected.logo_url} alt="" /> : <Building2 size={13} />}
              </span>
              <span className="fpo-co-selected-body">
                <span className="fpo-co-selected-name">{selected.name}</span>
                {selectedAddress && <span className="fpo-co-selected-address">{selectedAddress}</span>}
              </span>
            </span>
          ) : (
            <span className="fpo-sup-placeholder">Search company name, code or firm…</span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {value && !loading && (
            <span className="fpo-sup-clear" onClick={e => { e.stopPropagation(); onChange(null); setQuery(""); }} title="Clear selection">
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
            <input ref={inputRef} className="fpo-sup-search" placeholder="Search company name, code or firm…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && (
              <button type="button" onClick={() => setQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex", alignItems: "center" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <div className="fpo-sup-count">
            {filtered.length === 0
              ? companies.length === 0
                ? <span style={{ color: "#f59e0b" }}>No companies in the Company Details Master</span>
                : <span style={{ color: "#c2410c" }}>No match for "{query}"</span>
              : <span>{filtered.length} compan{filtered.length !== 1 ? "ies" : "y"}</span>}
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
                <span>No companies found</span>
              </div>
            ) : filtered.map(c => {
              const optAddress = formatCompanyAddress(c);
              return (
                <div key={c.id} className={`fpo-sup-option fpo-co-option${Number(c.id) === Number(value) ? " selected" : ""}`}
                  onClick={() => { onChange(c); setOpen(false); setQuery(""); }}>
                  <span className="fpo-co-avatar">
                    {c.logo_url ? <img src={c.logo_url} alt="" /> : <Building2 size={13} />}
                  </span>
                  <div className="fpo-co-opt-body">
                    <div className="fpo-co-opt-name">{c.name}</div>
                    <div className="fpo-co-opt-meta">
                      {c.code && <span>{c.code}</span>}
                      {c.gstin && <span>· GST {c.gstin}</span>}
                    </div>
                    {optAddress && <div className="fpo-co-opt-address">{optAddress}</div>}
                  </div>
                  {c.firm && <span className="fpo-co-firm-badge">{c.firm}</span>}
                  {Number(c.id) === Number(value) && <Check size={14} style={{ color: "#7c3aed", flexShrink: 0, marginLeft: 4 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Live preview of what prints at the top of the letterhead — logo, name,
// full address, PIN, GSTIN, phone/email — shown right under the Company
// picker so there's no surprise at print time.
function CompanyHeaderPreview({ company }: { company: CompanyDetails | null }) {
  if (!company) return null;
  const address = formatCompanyAddress(company);
  return (
    <div className="fpo-co-preview">
      <div className="fpo-co-preview-label">Header Address Preview <span>(what prints at the top of this Purchase Order)</span></div>
      <div className="fpo-co-preview-body">
        <span className="fpo-co-preview-avatar">
          {company.logo_url ? <img src={company.logo_url} alt="" /> : <Building2 size={18} />}
        </span>
        <div className="fpo-co-preview-text">
          <div className="fpo-co-preview-name">{company.name}</div>
          {address && <div className="fpo-co-preview-line">{address}</div>}
          {company.gstin && <div className="fpo-co-preview-line">GST No: {company.gstin}</div>}
          {(company.phone || company.email) && (
            <div className="fpo-co-preview-line">
              {company.phone ? `Ph: ${company.phone}` : ""}{company.phone && company.email ? "  |  " : ""}{company.email ? `E-mail: ${company.email}` : ""}
            </div>
          )}
          {!company.logo_url && (
            <div className="fpo-co-preview-line" style={{ color: "#b45309" }}>
              ⚠ No logo on file for this company — check the Company Details Master.
            </div>
          )}
        </div>
      </div>
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
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [pageSize, setPageSize] = useState(10);

  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  // ── DIAGNOSTIC state — surfaces exactly why pendingPlans might be empty ──
  const [planLoadError, setPlanLoadError] = useState("");

  const [hsnCodes,        setHsnCodes]        = useState<HsnEntry[]>([]);
  const [hsnCodesLoading, setHsnCodesLoading] = useState(false);
  const [hsnCodesError,   setHsnCodesError]   = useState("");

  // ── Company Details Master — feeds the printed PO header (logo, name,
  //    address, phone, email, GSTIN, state). The master holds MULTIPLE
  //    entities; `companies` is the full list for the "Company (Print
  //    Header)" picker, and each FPO stores which one (company_id) prints
  //    on its letterhead.
  const [companies,        setCompanies]        = useState<CompanyDetails[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

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
  // DIAGNOSTIC: logs the first raw supplier record exactly as returned by
  // getSuppliers(), before any column-name normalisation, so if "Order
  // To" ever comes up blank after selecting a supplier you can open
  // DevTools console and see the real field names the Supplier Master API
  // is using — then add any missing variant to the fallback lists below.
  useEffect(() => {
    getSuppliers().then(res => {
      const raw: Record<string, unknown>[] = res.data ?? res;
      if (raw?.[0]) {
      
      }
      setSuppliers(
        raw
          .map(r => ({
            id:            (r.id ?? r.supplier_id ?? 0) as number,
            name:          ((r.name ?? r.supplier_name ?? r.supplierName ?? "") as string).trim(),
            supplier_code: ((r.supplier_code ?? r.code ?? "") as string).trim(),
            city:          ((r.city ?? r.city_name ?? r.cityName ?? "") as string).trim(),
            state: (
              (r.state ?? r.state_name ?? r.stateName ?? r.state_title ?? "") as string
            ).trim(),
            // Printed on the PO's "Order To" box (see sample PO format)
            // — already present on the Supplier Master — normalize the
            // common column-name variants here.
            contact_no: (
              (r.contact_no ?? r.contact_number ?? r.contactNo ?? r.phone ?? r.phone_no ?? r.phoneNo ?? r.mobile ?? r.mobile_no ?? r.mobileNo ?? "") as string
            ).trim(),
            gstin: (
              (r.gstin ?? r.gst_no ?? r.gstNo ?? r.gst_number ?? "") as string
            ).trim(),
            agent_name: (
              (r.agent_name ?? r.agentName ?? r.agent ?? "") as string
            ).trim(),
            // Named contact person on file for this supplier — distinct
            // from the sales agent (agent_name above). Normalises the
            // common column-name variants a Supplier Master might use.
            contact_name: (
              (r.contact_name ?? r.contactName ?? r.contact_person ?? r.contactPerson ?? r.person_name ?? r.personName ?? "") as string
            ).trim(),
            email: (
              (r.email ?? r.email_id ?? r.emailId ?? r.supplier_email ?? r.contact_email ?? "") as string
            ).trim(),
            // Address components — same fields shown on the Supplier
            // Master's own address form. Used to auto-fill "Order To"
            // when this supplier is selected (see selectSupplier()).
            address_line1: (
              (r.address_line1 ?? r.address_line_1 ?? r.addressLine1 ?? r.address ?? r.address1 ?? "") as string
            ).trim(),
            district: (
              (r.district ?? r.district_name ?? r.districtName ?? r.taluk ?? r.taluk_name ?? "") as string
            ).trim(),
            pincode: (
              (r.pincode ?? r.pin_code ?? r.pinCode ?? r.postal_code ?? r.postalCode ?? r.zip ?? r.zip_code ?? r.pin ?? "") as string
            ).trim(),
            country: (
              (r.country ?? r.country_name ?? r.countryName ?? "") as string
            ).trim(),
          }))
          .filter(s => Boolean(s.name))
      );
    }).catch(() => {});
  }, []);

  // ── Load Company Details Master (list of entities) ──
  const loadCompanies = useCallback(async (): Promise<CompanyDetails[]> => {
  if (typeof getCompanyDetails !== "function") return [];
  setCompaniesLoading(true);
  try {
    const res: any = await getCompanyDetails();
    const raw = res?.data ?? res;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

    if (list[0]) {
     
    }

    const mapped: CompanyDetails[] = list.map((d: any, i: number) => {
      const logoCandidates: [string, unknown][] = [
        ["logo_url", d.logo_url],
        ["logo", d.logo],
        ["company_logo", d.company_logo],
        ["logoUrl", d.logoUrl],
        ["logo_path", d.logo_path],
        ["logoPath", d.logoPath],
        ["logo_image", d.logo_image],
        ["logoImage", d.logoImage],
        ["image", d.image],
        ["image_url", d.image_url],
        ["attachment", d.attachment],
        ["file", d.file],
      ];
      const found = logoCandidates.find(([, v]) => v);
      const logo_url = found ? resolveAssetUrl(found[1]) : "";

      return {
        id:             Number(d.id ?? d.company_id ?? i + 1),
        name:           (d.company_name ?? d.name ?? "").toString().trim(),
        code:           (d.company_code ?? d.code ?? "").toString().trim(),
        firm:           (d.firm ?? d.firm_code ?? "").toString().trim(),
        logo_url,
        _logoSourceKey: found ? found[0] : "",
        address:        (d.address ?? d.company_address ?? d.registered_address ?? d.address_line1 ?? d.addressLine1 ?? "").toString().trim(),
        pincode:        (d.pincode ?? d.pin_code ?? d.pinCode ?? d.zip ?? d.zip_code ?? "").toString().trim(),
        cin_no:         (d.cin_no ?? d.cinNo ?? d.cin ?? "").toString().trim(),
        address_line1:  (d.address_line1 ?? d.address_line_1 ?? d.addressLine1 ?? "").toString().trim(),
        address_line2:  (d.address_line2 ?? d.address_line_2 ?? d.addressLine2 ?? "").toString().trim(),
        address_line3:  (d.address_line3 ?? d.address_line_3 ?? d.addressLine3 ?? "").toString().trim(),
        phone:          (d.phone ?? d.phone_no ?? d.phoneNo ?? d.contact_no ?? "").toString().trim(),
        email:          (d.email ?? d.company_email ?? "").toString().trim(),
        gstin:          (d.gstin ?? d.gst_no ?? d.gstNo ?? "").toString().trim(),
        state:          (d.state ?? d.state_name ?? "").toString().trim(),
      };
    }).filter(c => c.name);

    setCompanies(mapped);
    return mapped;
  } catch (err) {
    console.warn("[loadCompanies] failed:", err);
    return companies; // keep whatever we already had rather than wiping it out
  } finally {
    setCompaniesLoading(false);
  }
}, [companies]);

useEffect(() => { loadCompanies(); }, []);

  // ── Load pending plans ──
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
          // ── Customer / "Shipping To" address — normalize the common
          //    column-name variants a production_plans ↔ customer join
          //    might expose. Adjust these if your API uses other names.
          customer_address_line1: (
            r.customer_address_line1 ?? r.customer_address ?? r.customerAddress ??
            r.cust_address_line1 ?? r.cust_address ?? r.ship_address_line1 ??
            r.shipping_address ?? ""
          ) || "",
          customer_district: (
            r.customer_district ?? r.customer_city ?? r.customerCity ??
            r.cust_district ?? r.cust_city ?? r.ship_city ?? ""
          ) || "",
          customer_state: (
            r.customer_state ?? r.customerState ?? r.cust_state ?? r.ship_state ?? ""
          ) || "",
          customer_pincode: (
            r.customer_pincode ?? r.customerPincode ?? r.cust_pincode ??
            r.customer_pin ?? r.ship_pincode ?? r.ship_pin ?? ""
          ) || "",
          customer_country: (
            r.customer_country ?? r.customerCountry ?? r.cust_country ?? r.ship_country ?? ""
          ) || "",
          customer_contact_no: (
            r.customer_contact_no ?? r.customerContactNo ?? r.cust_contact_no ??
            r.customer_phone ?? r.customer_mobile ?? ""
          ) || "",
          customer_gstin: (
            r.customer_gstin ?? r.customerGstin ?? r.cust_gstin ?? ""
          ) || "",
        }))
        .filter(p => p.rec_no);

      setPendingPlans(list);
     

      if (list.length === 0) {
        setPlanLoadError(
          "EMPTY_RESULT::Please Create the Production Plan "
        );
      }
    } catch (err: any) {
      console.error("❌ loadPendingPlans failed:", err);
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
      const start = (page - 1) * pageSize;
      setFpos(filtered.slice(start, start + pageSize));
      setTotal(filtered.length);
    } catch {}
    finally { setLoading(false); }
  }, [page, search, pageSize]);

  useEffect(() => { fetchFpos(); }, [fetchFpos]);
  useEffect(() => { setPage(1); }, [search, pageSize]);

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
  //      Header : purchase_qty, order_no, plan_rec_no, remarks,
  //               ship_from ("Shipping To" — from the plan's customer)
  //      Item[0]: sort_no  ← plan.order_sort_no
  //               construction ← plan.constn_for_production
  //               qty          ← plan.purchase_qty
  // ─────────────────────────────────────────────────────────────────────────────
 const selectPlan = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
  async (plan: PendingPlan | null) => {
    if (!plan) {
      setter(f => ({
        ...f,
        plan_id: null, plan_rec_no: "", order_no: "", purchase_qty: 0,
        ship_from: "",
        items: [emptyItem()],
      }));
      return;
    }

    const qty         = Number(plan.purchase_qty) || 0;
    const sortNo      = plan.order_sort_no        ? String(plan.order_sort_no).trim()        : "";
    const constn      = plan.constn_for_production ? String(plan.constn_for_production).trim() : "";
    let shipToBlock   = formatCustomerShipToBlock(plan);   // may be stale/blank

    const autofillItem = recalcItem({
      sort_no: sortNo, construction: constn, hsn_code: "",
      qty, rate: 0, basic_value: 0, unit: "MTR",
    });

    setter(f => ({
      ...f,
      plan_id: plan.id,
      plan_rec_no: plan.rec_no,
      order_no: plan.order_no,
      purchase_qty: qty,
      remarks: f.remarks ||
        `Purchase for ${plan.rec_no} (Order ${plan.order_no}${plan.customer_name ? " — " + plan.customer_name : ""})`,
      ship_from: shipToBlock || f.ship_from,
      items: [autofillItem],
    }));

    const chips: string[] = [];
    if (sortNo) chips.push(`Sort No: ${sortNo}`);
    if (constn) chips.push(`Construction: ${constn.slice(0, 30)}${constn.length > 30 ? "…" : ""}`);
    chips.push(`Qty: ${fmt(qty)} m`);

    // ── SELF-HEALING FIX ──
    // If the cached plan object had no address, ask the backend live (the
    // same source the debug toast already queries) — and if IT has the
    // data, write it straight into the form instead of only reporting it.
    if (!shipToBlock) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(
          `/api/fabric-purchase-orders/pending-purchase/debug/${plan.rec_no}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          pushToast(
            "error",
            "Shipping To debug route failed",
            `HTTP ${res.status} — ${errBody.message || "Unknown server error"}. This is a backend bug — check server logs.`
          );
        } else {
          const dbg = await res.json();
          const r = dbg.result || {};

          const liveLines: string[] = [];
          const liveAddr = [r.resolved_address, r.resolved_district, r.resolved_state, r.resolved_pincode, r.resolved_country]
            .filter(Boolean).join(", ");
          if (liveAddr) liveLines.push(liveAddr);
          if (r.resolved_contact) liveLines.push(`Contact No: ${r.resolved_contact}`);
          if (r.resolved_gstin)   liveLines.push(`GSTIN: ${r.resolved_gstin}`);
          const liveBlock = liveLines.join("\n");

          if (liveBlock) {
            // ← THE ACTUAL FIX: write the freshly-resolved address into the form.
            setter(f => ({ ...f, ship_from: liveBlock }));
            shipToBlock = liveBlock;

            pushToast(
              "success",
              "Shipping To auto-recovered",
              "The cached plan list was stale — pulled the current address from the server and filled it in."
            );

            // Also refresh the cached plans list so this doesn't happen again
            // for the same plan on the next selection.
            loadPendingPlans();
          } else if (dbg.warning) {
            pushToast("warning", "Shipping To is empty — why", dbg.warning);
          } else {
            const custName = dbg.customerMatch?.[0]?.name ?? "this customer";
            pushToast(
              "warning",
              "Shipping To is empty — why",
              `Customer "${custName}" was found, but has no address saved on file. Add one to the Customer Master and re-select the plan.`
            );
          }
        }
      } catch {
        pushToast("warning", "Shipping To is empty", "Could not reach the debug route to find out why.");
      }
    }

    if (shipToBlock) {
      pushToast(
        "info",
        `Plan ${plan.rec_no} linked`,
        `Autofilled → ${chips.join(" | ")} | Shipping To filled from customer address`
      );
    }
  };

  // ── Link supplier — selecting a supplier auto-fills "Order To" with
  //    a full multi-line block: registered address (Address Line 1,
  //    District/City, State, Pincode, Country) followed by Contact Name,
  //    Contact No, Agent Name, Email and GSTIN — each on its own labelled
  //    line, whenever the Supplier Master has that field populated. Stays
  //    fully editable afterwards; clearing the supplier (or picking one
  //    with no data on file) clears the auto-filled text back out too,
  //    the same "clears on unlink" behavior used by the plan picker. ──
  const selectSupplier = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    (name: string) => {
      if (!name) {
        setter(f => ({ ...f, supplier: "", delivery_to: "" }));
        return;
      }
      const supplierObj = suppliers.find(s => s.name === name) ?? null;
      const block        = formatSupplierDeliveryBlock(supplierObj);

      setter(f => ({ ...f, supplier: name, delivery_to: block }));

      if (block) {
        pushToast("info", `Supplier "${name}" selected`, `Order To auto-filled with address, contact, agent & GST details.`);
      } else {
        pushToast("warning", `Supplier "${name}" selected`, "No address/contact details on file for this supplier — Order To left blank.");
        console.warn(`[selectSupplier] No address fields matched for "${name}" — check the [getSuppliers] raw record logged on page load to find the correct column names.`, supplierObj);
      }
    };

  // ── Link company (print header) ──
  const selectCompany = (setter: React.Dispatch<React.SetStateAction<FabricPurchaseOrderPayload>>) =>
    (co: CompanyDetails | null) => {
      setter(f => ({ ...f, company_id: co ? co.id : null }));
      if (!co) return;

      if (co.logo_url) {
        pushToast(
          "info",
          `Company "${co.name}" selected`,
          `Logo loaded (source field: "${co._logoSourceKey}"). This will print at the top of the Purchase Order.`
        );
      } else {
        pushToast(
          "warning",
          `Company "${co.name}" selected`,
          "No logo found on this company record — check the Company Details Master, or the console log for the raw field names available."
        );
      }
    };

  // ── Open create ──
const handleNewFpo = async () => {
  setForm(defaultForm());
  setSaveError(""); setSavedCode(""); setFpoGenError("");
  setFormSec({ details: true, construction: true, gst: true });
  setShowModal(true);
  await generateFpoNo(setForm, setFpoGenerating, setFpoGenError);
  loadPendingPlans();          // ← ADD THIS: re-fetch live plans (with current addresses)
                                //   every time the form opens, instead of relying on the
                                //   one-time load from page mount.
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
    unit:         item?.unit ?? "MTR",
  });

  const sanitizeFpo = (data: Partial<FabricPurchaseOrderPayload>): FabricPurchaseOrderPayload => ({
    ...defaultForm(),
    ...data,
    fpo_date:    data.fpo_date    ?? today(),
    delivery_dt: data.delivery_dt ?? today(),
    supplier:      data.supplier      ?? "",
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
    due_date:         data.due_date         ?? data.delivery_dt ?? today(),
    place_of_supply:  data.place_of_supply  ?? "",
    ship_from:        data.ship_from        ?? "",
    advance:          Number(data.advance)  || 0,
    description:      data.description      ?? "",
    // Normalise to a number (or null) — the API may return this as a
    // string (e.g. "5") depending on the DB driver, and every comparison
    // against `companies[].id` elsewhere in this file expects a number.
    company_id:        data.company_id != null && data.company_id !== "" ? Number(data.company_id) : null,
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
  } finally {
    setDeleteConfirming(false);
  }
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

  // ── Print single FPO — professional "Purchase Order" letterhead ──
  const handlePrintFpo = async (fpoInput: FabricPurchaseOrderPayload) => {
    const win = window.open("", "_blank", "width=1050,height=800");
    if (!win) {
      pushToast("error", "Popup Blocked", "Please allow popups for this site to print the Purchase Order.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Purchase Order</title></head>
      <body style="font-family:'Times New Roman',Times,serif;padding:60px;text-align:center;color:#64748b;">
        Loading Purchase Order…
      </body></html>`);
    win.document.close();

    let fpo = fpoInput;
    if (fpoInput.id) {
      try {
        const full = await getFabricPurchaseOrderById(fpoInput.id);
        fpo = sanitizeFpo(full?.data ?? full);
      } catch {
        pushToast("warning", "Using Cached Data", "Could not refresh the latest FPO details — printing with the data currently on screen.");
      }
    }

    const items = fpo.items ?? [];
    const totals = calcTotals({ ...fpo, items });
    const gstPct = (Number(fpo.cgst_pct) || 0) + (Number(fpo.sgst_pct) || 0) + (Number(fpo.igst_pct) || 0);
    const cgstPct = Number(fpo.cgst_pct) || 0;
    const sgstPct = Number(fpo.sgst_pct) || 0;

    const itemRows = items.map((it, i) => {
      const taxable = Number(it.basic_value) || 0;
      const gstAmt  = +(taxable * gstPct / 100).toFixed(2);
      const lineTot = +(taxable + gstAmt).toFixed(2);
      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${it.construction || "—"}</td>
          <td>${it.hsn_code || "—"}</td>
          <td class="r">${fmt(Number(it.qty) || 0)}</td>
          <td class="c">${it.unit || "MTR"}</td>
          <td class="r">₹${fmt(Number(it.rate) || 0)}</td>
          <td class="r">₹${fmt(Number(it.rate) || 0)}</td>
          <td class="r">₹${fmt(gstAmt)}${gstPct ? ` (${gstPct}%)` : ""}</td>
          <td class="r"><strong>₹${fmt(lineTot)}</strong></td>
        </tr>`;
    }).join("");

    const hsnGroups: Record<string, number> = {};
    items.forEach(it => {
      const key = it.hsn_code || "—";
      hsnGroups[key] = (hsnGroups[key] || 0) + (Number(it.basic_value) || 0);
    });
    const hsnRows = Object.entries(hsnGroups).map(([hsn, taxable]) => {
      const cgstAmt = +(taxable * cgstPct / 100).toFixed(2);
      const sgstAmt = +(taxable * sgstPct / 100).toFixed(2);
      return `
        <tr>
          <td>${hsn}</td>
          <td class="r">₹${fmt(taxable)}</td>
          <td class="c">${cgstPct}%</td>
          <td class="r">₹${fmt(cgstAmt)}</td>
          <td class="c">${sgstPct}%</td>
          <td class="r">₹${fmt(sgstAmt)}</td>
          <td class="r">₹${fmt(cgstAmt + sgstAmt)}</td>
        </tr>`;
    }).join("");

    const advance = Number((fpo as any).advance) || 0;
    const balance = +(totals.net - advance).toFixed(2);

    const freshCompanies = await loadCompanies();
const c = freshCompanies.find(x => Number(x.id) === Number((fpo as any).company_id)) || FALLBACK_COMPANY;
    if (c === FALLBACK_COMPANY && (fpo as any).company_id) {
      console.warn("[handlePrintFpo] FPO has company_id =", (fpo as any).company_id, "but no matching company was found in the loaded companies list — check that the Company Details Master still has this record.");
    } else if (c === FALLBACK_COMPANY) {
      console.warn("[handlePrintFpo] FPO has no company_id saved — pick a company in \"Company (Print Header)\" and re-save, or check that the backend/DB migration for company_id has been applied.");
    }

    const companyName = c.name || "Your Company Name";
    const rawAddress   = c.address ? c.address.trim() : formatCompanyAddress(c);
    const addressLines = rawAddress.replace(/\n/g, "<br/>");
    const pinSuffix     = c.pincode && !rawAddress.includes(c.pincode) ? ` - ${c.pincode}` : "";

    const logoMarkup = c.logo_url
      ? `<img class="logo-img" src="${c.logo_url}" onerror="this.outerHTML='<div class=&quot;logo-img&quot; style=&quot;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;&quot;>No Logo</div>'" />`
      : `<div class="logo-img" style="display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;">No Logo</div>`;

    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Purchase Order — ${fpo.fpo_no}</title>
      <style>
        * { box-sizing:border-box; }
        body { font-family:'Times New Roman',Times,serif; font-size:12.5px; color:#1e293b; margin:24px; }
        .po-topbar { height:6px; background:linear-gradient(90deg,#5b21b6,#7c3aed 55%,#0f766e); border-radius:4px; margin-bottom:16px; }
        .po-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .po-title { font-family:'Times New Roman',Times,serif; font-size:20px; font-weight:800; letter-spacing:.02em; color:#3b0764; }
        .po-copy-tag { font-size:10.5px; font-weight:700; color:#7c3aed; border:1px solid #c4b5fd; background:#faf5ff; border-radius:20px; padding:3px 12px; text-transform:uppercase; letter-spacing:.05em; }
        table.po-outer { width:100%; table-layout:fixed; border-collapse:collapse; border:1.4px solid #334155; margin-bottom:0; }
        table.po-outer td { border:1px solid #334155; padding:11px 13px; vertical-align:top; word-wrap:break-word; }
        .logo-row { display:flex; gap:14px; align-items:flex-start; }
        .logo-img { width:64px; height:64px; object-fit:contain; flex-shrink:0; border-radius:6px; border:1px solid #e2e8f0; background:#fff; padding:3px; }
        .co-name { font-size:17px; font-weight:800; margin-bottom:3px; color:#1e293b; }
        .co-line { font-size:11.5px; line-height:1.65; color:#334155; white-space:pre-line; }
        table.meta-grid { width:100%; height:100%; table-layout:fixed; border-collapse:collapse; }
        table.meta-grid td { border:1px solid #334155; padding:8px 11px; font-size:11.5px; vertical-align:middle; width:50%; color:#475569; }
        table.meta-grid .val { display:block; font-weight:700; margin-top:2px; font-size:13px; color:#1e293b; }
        .section-title { font-weight:800; font-size:10.5px; margin-bottom:5px; color:#5b21b6; text-transform:uppercase; letter-spacing:.06em; }
        table.items { width:100%; border-collapse:collapse; }
        table.items th, table.items td { border:1px solid #334155; padding:7px 9px; font-size:11.5px; }
        table.items th { background:#5b21b6; color:#fff; text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.03em; font-family:'Times New Roman',Times,serif; }
        table.items td.c, table.items th.c { text-align:center; }
        table.items td.r, table.items th.r { text-align:right; }
        table.items tbody tr:nth-child(even) td { background:#faf5ff; }
        table.totals-box { width:100%; border-collapse:collapse; }
        table.totals-box td { border:none; padding:4px 4px; font-size:12.5px; }
        table.totals-box .lbl { color:#475569; }
        table.totals-box .val { text-align:right; font-weight:700; }
        table.totals-box .grand td { border-top:2px solid #334155; padding-top:8px; font-size:14px; font-weight:800; color:#3b0764; }
        table.hsn-summary { width:100%; border-collapse:collapse; }
        table.hsn-summary th, table.hsn-summary td { border:1px solid #334155; padding:6px 9px; font-size:11.5px; }
        table.hsn-summary th { background:#0f766e; color:#fff; text-align:center; text-transform:uppercase; letter-spacing:.03em; font-size:10px; font-family:'Times New Roman',Times,serif; }
        table.hsn-summary td.r { text-align:right; }
        table.hsn-summary td.c { text-align:center; }
        .sign-block { text-align:center; }
        .sign-space { height:56px; }
        .terms { font-size:11px; line-height:1.75; color:#334155; }
        .po-footer-note { text-align:center; font-size:10px; color:#94a3b8; margin-top:14px; font-style:italic; }
        @media print { body { margin:10px; } .po-topbar { -webkit-print-color-adjust:exact; print-color-adjust:exact; } table.items th, table.hsn-summary th { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      </style>
    </head><body>

      <div class="po-topbar"></div>
      <div class="po-title-row">
        <div class="po-title">Purchase Order</div>
        <div class="po-copy-tag">Original</div>
      </div>

      <table class="po-outer">
        <tr>
          <td style="width:56%;">
            <div class="logo-row">
              ${logoMarkup}
              <div>
                <div class="co-name">${companyName}</div>
                ${addressLines ? `<div class="co-line">${addressLines}${pinSuffix}</div>` : ""}
                ${c.gstin ? `<div class="co-line">GSTIN: ${c.gstin}</div>` : ""}
                ${c.state ? `<div class="co-line">State: ${c.state}</div>` : ""}
                ${c.phone ? `<div class="co-line">Phone no.: ${c.phone}</div>` : ""}
                ${c.email ? `<div class="co-line">Email: ${c.email}</div>` : ""}
                ${c.cin_no ? `<div class="co-line">CIN: ${c.cin_no}</div>` : ""}
              </div>
            </div>
          </td>
          <td style="padding:0;">
            <table class="meta-grid">
              <tr>
                <td>Order No.<span class="val">${fpo.fpo_no || "—"}</span></td>
                <td>Date<span class="val">${fmtDate(fpo.fpo_date) || "—"}</span></td>
              </tr>
              <tr>
                <td colspan="2">Due Date<span class="val">${fmtDate((fpo as any).due_date || fpo.delivery_dt) || "—"}</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="width:50%;">
            <div class="section-title">Order To</div>
            <div class="co-line">${fpo.delivery_to || "—"}</div>
          </td>
          <td style="width:50%;">
            <div class="section-title">Shipping To</div>
            <div class="co-line">${(fpo as any).ship_from || "—"}</div>
          </td>
        </tr>
      </table>

      <table class="items" style="margin-top:14px;">
        <thead>
          <tr>
            <th class="c" style="width:26px;">#</th>
            <th>Quality</th>
            <th style="width:80px;">HSN/ SAC</th>
            <th class="r" style="width:70px;">Quantity</th>
            <th class="c" style="width:50px;">Unit</th>
            <th class="r" style="width:80px;">Price/ Unit</th>
            <th class="r" style="width:90px;">Taxable Price/ unit</th>
            <th class="r" style="width:110px;">GST</th>
            <th class="r" style="width:110px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr>
            <td colspan="3" class="r" style="font-weight:700;">Total</td>
            <td class="r" style="font-weight:700;">${fmt(items.reduce((s, i) => s + (Number(i.qty) || 0), 0))}</td>
            <td></td><td></td>
            <td class="r" style="font-weight:700;">₹${fmt(totals.sub)}</td>
            <td></td>
            <td class="r" style="font-weight:800;">₹${fmt(totals.net)}</td>
          </tr>
        </tbody>
      </table>

      <table class="po-outer" style="margin-top:14px;">
        <tr>
          <td style="width:58%;">
            <div class="section-title">Order Amount in Words</div>
            <div style="font-weight:700; font-size:12.5px; margin-bottom:10px;">${amountInWords(totals.net)}</div>
            ${(fpo as any).description || fpo.remarks ? `
              <div class="section-title">Description</div>
              <div class="co-line" style="margin-bottom:8px;">${(fpo as any).description || fpo.remarks}</div>
            ` : ""}
            ${fpo.pay_terms ? `
              <div class="section-title">Payment mode</div>
              <div class="co-line">${fpo.pay_terms}</div>
            ` : ""}
          </td>
          <td>
            <div class="section-title" style="margin-bottom:6px;">Amounts</div>
            <table class="totals-box">
              <tr><td class="lbl">Sub Total</td><td class="val">₹${fmt(totals.sub)}</td></tr>
              <tr class="grand"><td class="lbl">Total</td><td class="val">₹${fmt(totals.net)}</td></tr>
              <tr><td class="lbl">Advance</td><td class="val">₹${fmt(advance)}</td></tr>
              <tr><td class="lbl">Balance</td><td class="val">₹${fmt(balance)}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <table class="hsn-summary" style="margin-top:14px;">
        <thead>
          <tr>
            <th rowspan="2">HSN/ SAC</th>
            <th rowspan="2">Taxable amount</th>
            <th colspan="2">CGST</th>
            <th colspan="2">SGST</th>
            <th rowspan="2">Total Tax Amount</th>
          </tr>
          <tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>
        </thead>
        <tbody>
          ${hsnRows}
          <tr>
            <td style="font-weight:700;">Total</td>
            <td class="r" style="font-weight:700;">₹${fmt(totals.sub)}</td>
            <td></td>
            <td class="r" style="font-weight:700;">₹${fmt(totals.cgst)}</td>
            <td></td>
            <td class="r" style="font-weight:700;">₹${fmt(totals.sgst)}</td>
            <td class="r" style="font-weight:700;">₹${fmt(totals.cgst + totals.sgst)}</td>
          </tr>
        </tbody>
      </table>

      <table class="po-outer" style="margin-top:14px; border-top:1px solid #334155;">
        <tr>
          <td style="width:58%;">
            <div class="section-title">Terms and conditions</div>
            <div class="terms">
              1. Payment through Cheque/ Neft/Rtgs Only.<br/>
              2. Goods Once Sold We can not take back.<br/>
              3. We are not responsible for Any damages or Any loss in Transist.<br/>
              4. All Dispute subject to ${c.state ? c.state.replace(/^\\d+-/, "") + " " : ""}Jurisdiction.<br/>
              5. Our Guarantee is Upto Greige standard only.
            </div>
          </td>
          <td class="sign-block">
            <div style="font-weight:700; font-size:12.5px;">For : ${companyName}</div>
            <div class="sign-space"></div>
            <div style="font-weight:700; font-size:12px;">Authorized Signatory</div>
          </td>
        </tr>
      </table>

      <div class="po-footer-note">This is a system-generated Purchase Order and does not require a physical signature to be valid.</div>

      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`);
    win.document.close(); win.focus();
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
    const selectedCompany = f.company_id != null ? companies.find(c => Number(c.id) === Number(f.company_id)) ?? null : null;
    const selectedSupplierObj = f.supplier ? suppliers.find(s => s.name === f.supplier) ?? null : null;
    const supplierHasAddress = Boolean(formatSupplierAddress(selectedSupplierObj));
    const shipToIsAutofilled = Boolean(f.plan_id) && Boolean((f as any).ship_from);

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

            <div className="fpo-col-full">
              <FField label="Company (Print Header)"  hint="Which entity's logo, address & GSTIN prints at the top of this Purchase Order">
                <CompanyDropdown
                  value={f.company_id ?? null}
                  onChange={selectCompany(setF)}
                  companies={companies}
                  loading={companiesLoading}
                />
                <CompanyHeaderPreview company={selectedCompany} />
              </FField>
            </div>

            <FField label="FPO No" >
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

            <FField label="FPO Date" >
              <input className="fpo-input" type="date"
                value={f.fpo_date} onChange={e => setF({ ...f, fpo_date: e.target.value })} />
            </FField>

            <FField label="Due Date"  hint="Printed on the PO as the order's Due Date">
              <input className="fpo-input" type="date"
                value={(f as any).due_date || ""} onChange={e => setF({ ...f, due_date: e.target.value } as any)} />
            </FField>

            <FField label="Supplier" required >
              <SupplierDropdown
                value={f.supplier}
                onChange={selectSupplier(setF)}
                suppliers={suppliers}
              />
            </FField>

            {!isEdit ? (
              <FField label="Order Plan No" required 
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
                <FField label="Order Plan No" >
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
                <FField label="Purchase Qty" >
                  <input className="fpo-input fpo-input--disabled" type="text" readOnly
                    value={fmt(Number(f.purchase_qty) || 0)} />
                </FField>
              )
            )}

            <div className="fpo-col-full">
              <FField label="Order To" type={supplierHasAddress ? "autofill" : "text"} hint={supplierHasAddress ? "✓ Auto-filled from selected supplier's address, contact, agent & GST — editable" : "Address, PIN, State, Contact Name, Contact No, Agent Name, Email & GSTIN, one per line"}>
                <textarea
                  className={`fpo-input fpo-textarea${supplierHasAddress ? " fpo-input--autofill" : ""}`}
                  placeholder="Supplier details for this order"
                  rows={5}
                  value={f.delivery_to} onChange={e => setF({ ...f, delivery_to: e.target.value })} />
              </FField>
            </div>

            <div className="fpo-col-full">
              <FField label="Shipping To" type={shipToIsAutofilled ? "autofill" : "text"} hint={f.plan_id ? "✓ Auto-filled from the linked Order Plan's customer address — editable" : "Customer's shipping address — auto-fills once an Order Plan No is linked"}>
                <textarea
                  className={`fpo-input fpo-textarea${shipToIsAutofilled ? " fpo-input--autofill" : ""}`}
                  placeholder="Customer shipping address"
                  rows={5}
                  value={(f as any).ship_from || ""} onChange={e => setF({ ...f, ship_from: e.target.value } as any)} />
              </FField>
            </div>


            <FField label="Pay Terms" type="select">
              <select className="fpo-input" value={f.pay_terms}
                onChange={e => setF({ ...f, pay_terms: e.target.value })}>
                <option value="">Select</option>
                {["Cash", "Credit", "30 Days", "45 Days", "60 Days", "90 Days", "LC", "Advance"].map(t => (
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

            <FField label="Advance" type="number" hint="Amount already paid — printed PO shows Balance = Total − Advance">
              <input className="fpo-input" type="number" min={0} step="0.01" placeholder="0.00"
                value={(f as any).advance || ""} onChange={e => setF({ ...f, advance: parseFloat(e.target.value) || 0 } as any)} />
            </FField>

            <div className="fpo-col-full">
              <FField label="Description" type="text" hint="Printed under 'Order Amount in Words' — e.g. delivery timeline">
                <input className="fpo-input" type="text" placeholder="e.g. DELIVERY 30-35 DAYS"
                  value={(f as any).description || ""} onChange={e => setF({ ...f, description: e.target.value } as any)} />
              </FField>
            </div>

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
                    <th className="fpo-ith" style={{ width: 80 }}>Unit</th>
                    <th className="fpo-ith fpo-ith--r" style={{ width: 90 }}>Rate</th>
                    <th className="fpo-ith fpo-ith--r" style={{ width: 110 }}>
                      Basic Value <FTypeBadge type="computed" />
                    </th>
                    <th className="fpo-ith fpo-ith--c" style={{ width: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {f.items.map((item, idx) => {
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
                          <select className="fpo-iinput" value={(item as any).unit || "MTR"}
                            onChange={e => updItem(idx, { unit: e.target.value } as any)}>
                            {["MTR", "KG", "PCS", "YDS", "ROLL"].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
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
        .fpo-rec-count { font-size:13px; color:#64748b; white-space:nowrap; }
        .fpo-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; }
        .fpo-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .fpo-page-size select:focus { border-color:#7c3aed; }

        .fpo-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .fpo-table-wrap { overflow-x:auto; }
        .fpo-table { width:100%; border-collapse:collapse; font-size:13px; min-width:600px; }
        .fpo-table thead tr { background:#7c3aed; }
        .fpo-table th { padding:11px 12px; color:#fff; font-weight:700; text-align:left; font-size:12px; white-space:nowrap; }
        .fpo-table th.th-r { text-align:right; }
        .fpo-table th.th-c { text-align:center; }
        .fpo-table tbody tr:nth-child(odd)  td { background:#fff; }
        .fpo-table tbody tr:nth-child(even) td { background:#faf5ff; }
        .fpo-table tbody tr:hover td { background:#f3f0ff; }
        .fpo-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        .fpo-fpo-no { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#7c3aed; background:#faf5ff; border:1px solid #c4b5fd; border-radius:6px; padding:2px 7px; }
        .fpo-plan-rec { font-weight:600; color:#0f766e; }
        .fpo-td-num { text-align:right; font-family:'DM Mono',monospace; }
        .fpo-td-c { text-align:center; }
        .fpo-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .fpo-row-menu-btn { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:1px solid #e2e8f0; background:#fff; border-radius:7px; cursor:pointer; color:#64748b; transition:border-color .15s, background .15s, color .15s; }
        .fpo-row-menu-btn:hover { background:#faf5ff; border-color:#c4b5fd; color:#7c3aed; }
        .fpo-row-menu-panel { background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.16); overflow:hidden; animation:ddSlide .12s ease; padding:4px; }
        .fpo-row-menu-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 11px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:12.5px; font-weight:600; color:#374151; font-family:'DM Sans',sans-serif; text-align:left; }
        .fpo-row-menu-item:hover { background:#f8fafc; }
        .fpo-row-menu-item--danger { color:#dc2626; }
        .fpo-row-menu-item--danger:hover { background:#fef2f2; }
        .fpo-row-menu-divider { height:1px; background:#f1f5f9; margin:3px 4px; }

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
        .fpo-textarea { resize:vertical; line-height:1.6; font-family:'DM Sans',sans-serif; white-space:pre-line; }
        .fpo-error-banner { display:flex; align-items:center; gap:8px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#ef4444; padding:10px 16px; margin-bottom:14px; font-size:13px; }

        .fpo-autofill-banner { display:flex; align-items:flex-start; gap:8px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; color:#0f766e; padding:9px 13px; margin-bottom:10px; font-size:12.5px; line-height:1.5; }

        .fpo-plan-diag { display:flex; align-items:flex-start; gap:7px; border-radius:8px; padding:9px 11px; margin-top:6px; font-size:11.5px; line-height:1.5; }
        .fpo-plan-diag--error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; }
        .fpo-plan-diag--warn  { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
        .fpo-plan-diag-retry { margin-left:auto; flex-shrink:0; background:#fff; border:1px solid currentColor; color:inherit; border-radius:6px; padding:2px 9px; font-size:11px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .fpo-plan-diag-retry:hover { opacity:.8; }

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
        .fpo-iinput--autofill { border-color:#99f6e4 !important; background:#f0fdfa !important; color:#0f766e !important; font-weight:700 !important; }
        .fpo-del-row-btn { background:#fff1f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .fpo-del-row-btn:hover { background:#fee2e2; }

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

        .fpo-co-trigger.has-value { border-color:#99f6e4; background:#f0fdfa; }
        .fpo-co-selected { display:flex; align-items:center; gap:8px; overflow:hidden; }
        .fpo-co-selected-body { display:flex; flex-direction:column; overflow:hidden; min-width:0; }
        .fpo-co-selected-name { font-weight:700; color:#0f766e; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3; }
        .fpo-co-selected-address { font-size:10.5px; color:#0d9488; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3; }
        .fpo-co-avatar { flex-shrink:0; width:26px; height:26px; border-radius:7px; background:#f5f3ff; border:1px solid #ddd6fe; display:flex; align-items:center; justify-content:center; overflow:hidden; color:#7c3aed; }
        .fpo-co-avatar img { width:100%; height:100%; object-fit:contain; }
        .fpo-co-option { align-items:center; }
        .fpo-co-opt-body { flex:1; min-width:0; }
        .fpo-co-opt-name { font-size:13px; font-weight:700; color:#1e293b; }
        .fpo-co-opt-meta { display:flex; gap:5px; font-size:11px; color:#94a3b8; font-family:'DM Mono',monospace; }
        .fpo-co-opt-address { font-size:10.5px; color:#7c3aed; opacity:.8; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fpo-co-firm-badge { background:#fef9c3; color:#92400e; border-radius:5px; padding:2px 8px; font-size:10px; font-weight:800; letter-spacing:.03em; flex-shrink:0; }
        .fpo-co-preview { margin-top:8px; border:1px solid #99f6e4; background:#f0fdfa; border-radius:10px; padding:10px 12px; }
        .fpo-co-preview-label { font-size:10px; font-weight:800; color:#0f766e; text-transform:uppercase; letter-spacing:.05em; margin-bottom:7px; }
        .fpo-co-preview-label span { font-weight:600; text-transform:none; letter-spacing:0; color:#0d9488; opacity:.8; }
        .fpo-co-preview-body { display:flex; gap:10px; align-items:flex-start; }
        .fpo-co-preview-avatar { flex-shrink:0; width:34px; height:34px; border-radius:8px; background:#fff; border:1px solid #99f6e4; display:flex; align-items:center; justify-content:center; overflow:hidden; color:#0f766e; }
        .fpo-co-preview-avatar img { width:100%; height:100%; object-fit:contain; }
        .fpo-co-preview-text { flex:1; min-width:0; }
        .fpo-co-preview-name { font-size:13.5px; font-weight:800; color:#134e4a; margin-bottom:2px; }
        .fpo-co-preview-line { font-size:11.5px; color:#0f766e; line-height:1.6; }

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
        .fpo-co-trigger.has-value { height:44px; }
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
          <div className="fpo-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
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
                    <td style={{ color: "#94a3b8" }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="fpo-fpo-no">{o.fpo_no}</span></td>
                    <td style={{ color: "#64748b" }}>{o.fpo_date ? fmtDate(o.fpo_date) : "—"}</td>
                    <td style={{ fontWeight: 600 }}>{o.supplier}</td>
                    {width >= 640  && <td><span className="fpo-plan-rec">{o.plan_rec_no || "—"}</span></td>}
                    {width >= 768  && <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{o.order_no || "—"}</td>}
                    {width >= 768  && <td className="fpo-td-num">{o.purchase_qty ? fmt(Number(o.purchase_qty)) : "—"}</td>}
              
                    {width >= 960  && <td>{o.pay_terms}</td>}
                    {width >= 1024 && <td>{o.rate_type}</td>}
                    <td className="fpo-td-num" style={{ fontWeight: 700, color: "#7c3aed" }}>
                      ₹{fmt(Number(o.net_value) || 0)}
                    </td>
                    <td className="fpo-td-c">
                      <RowActionsMenu
                        onEdit={() => handleOpenEdit(o)}
                        onPrint={() => handlePrintFpo(o)}
                        onDelete={() => { setDeleteTarget(o); setDeleteError(""); }}
                      />
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