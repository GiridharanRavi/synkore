// @ts-nocheck
/**
 * pages/YarnStock.tsx
 *
 * "Yarn Stock" — combined view over two sources, same pattern as Fabric
 * Stock:
 *   • Yarn Purchase Inward (automatic, read-only)
 *   • Manual Stock Entry ("+ Add In-Stock" button — opening balances,
 *     physical-count corrections, transfers, etc.) — can be Edited/Deleted.
 *
 * Backed by the combined v_yarn_stock_items_all / v_yarn_stock_summary_all
 * views (see yarn_manual_stock_schema.sql) via the updated
 * routes/yarnStockRoutes.js, so:
 *
 *     Total Stock KGS = Inward KGS + Manual KGS
 *
 * is computed server-side and just displayed here — no client-side
 * summing needed. Each row on the Piece Detail tab carries `source:
 * "inward" | "manual"` so the UI can badge it and only allow
 * editing/deleting the manual ones from here.
 *
 * UPDATE (this revision):
 *   • Added the "+ Add In-Stock" button + modal (mirrors Fabric Stock's
 *     Add/Edit In-Stock modal).
 *   • Piece Detail tab now shows a Source badge column and an Action
 *     column (Edit/Delete, manual rows only).
 *   • Total Stock KGS stat card now shows an "Inward X + Manual Y"
 *     sub-line, same as the Fabric Stock page.
 *
 * UPDATE (this revision, 2):
 *   • Added a "Count / Sort" filter dropdown (mirrors Fabric Stock's
 *     Construction filter) that also shows the total KGS + piece count
 *     for whichever Count/Sort is selected, right next to the select.
 *     The filter is sent to the backend as `count` alongside the
 *     existing `search` / `location` / `supplier` filters, so
 *     `stats.total_kgs` / `stats.total_pieces` already reflect the
 *     filtered totals — no extra client-side summing needed.
 *   • Dropdown options are accumulated client-side from whatever
 *     Count/Sort values have been seen in the Summary tab so far (there's
 *     no dedicated "distinct counts" endpoint yet). Options grow as the
 *     user searches/paginates. If/when a `meta.counts` list is added to
 *     `yarnStockService.getMeta()`, swap this out for that instead.
 *   • Added a "Clear filters" link next to the record count, matching
 *     the Fabric Stock toolbar.
 *
 * FIX (carried over): load() stores the thrown error in state and renders
 * it as a banner instead of only console.error-ing it, so a proxy/API
 * misconfig is visible in the UI instead of silently leaving the table
 * empty.
 *
 * Full numbered pagination bar (First / Prev / page numbers with
 * ellipsis / Next / Last + rows-per-page selector) — unchanged.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw, Download, Search, Layers, Package, MapPin, Boxes, ChevronDown,
  AlertTriangle, X, FileText, FileSpreadsheet, Printer, ChevronsLeft,
  ChevronsRight, ChevronLeft, ChevronRight, PlusCircle, Pencil, Trash2,
  PackagePlus, CheckCircle2, Loader2,
} from 'lucide-react';
import { yarnStockService, YarnStockSummaryRow, YarnStockDetailRow, YarnStockStats, YarnStockMeta } from '../../api/services';

const ORANGE = '#c2410c';

const s = {
  wrap:   { fontFamily: "'DM Sans',sans-serif", color: '#1e293b', fontSize: 14 },
  card:   { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 180 },
  iconBox:(bg) => ({ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
  statLbl: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statVal: { fontSize: 20, fontWeight: 800, color: '#1e293b', marginTop: 2 },
  statSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  btn:    { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", border: '1px solid #cbd5e1', background: '#fff', color: '#374151' },
  input:  { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#fff' },
};

function StatCard({ icon, bg, label, value, sub }) {
  return (
    <div style={s.card}>
      <div style={s.iconBox(bg)}>{icon}</div>
      <div>
        <div style={s.statLbl}>{label}</div>
        <div style={s.statVal}>{value}</div>
        {sub && <div style={s.statSub}>{sub}</div>}
      </div>
    </div>
  );
}

function StockChip({ level }) {
  const cfg = {
    'Healthy':      { bg: '#dcfce7', color: '#166534' },
    'Low':          { bg: '#fef9c3', color: '#92400e' },
    'Out of Stock': { bg: '#fef2f2', color: '#991b1b' },
  }[level] ?? { bg: '#f3f4f6', color: '#374151' };
  return <span style={{ display: 'inline-block', padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: cfg.bg, color: cfg.color }}>{level}</span>;
}

// Rows are included in stock as soon as they're inwarded (DRAFT or
// APPROVED) — this just flags the ones still awaiting inspection/approval
// rather than hiding them, matching v_yarn_stock_items.inspection_pending.
function PendingBadge() {
  return (
    <span style={{ display: 'inline-block', marginLeft: 6, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#fef9c3', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      Pending Inspection
    </span>
  );
}

const SOURCE_CFG = {
  inward: { label: 'Inward', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  manual: { label: 'Manual', bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff' },
};
function SourceBadge({ source }) {
  const c = SOURCE_CFG[source] || SOURCE_CFG.inward;
  return (
    <span style={{
      display: 'inline-block', fontSize: 10.5, fontWeight: 700, padding: '3px 9px',
      borderRadius: 20, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <strong>Couldn't load Yarn Stock.</strong>
        <div style={{ marginTop: 2, opacity: 0.9, wordBreak: 'break-word' }}>{message}</div>
      </div>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}><X size={14} /></button>
    </div>
  );
}

function exportCSV(rows, columns, filename) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(r => columns.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Builds a simple HTML table that Excel opens natively — same trick used
// on the Yarn Purchase Inward list page's Export menu.
function exportExcel(rows, columns, filename) {
  const headerRow = columns.map(c => `<th style="background:#c2410c;color:#fff;padding:8px 10px;font-weight:bold;">${c.label}</th>`).join('');
  const bodyRows = rows.map((r, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#fff7ed'}">` +
    columns.map(c => `<td style="padding:7px 10px;border:1px solid #e2e8f0;">${r[c.key] ?? ''}</td>`).join('') +
    '</tr>'
  ).join('');

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
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Opens a print-formatted window (use the browser's "Save as PDF" print
// destination for a PDF — no extra library needed).
function printTable(rows, columns, title, subtitle) {
  const headerRow = columns.map(c => `<th>${c.label}</th>`).join('');
  const bodyRows = rows.map((r, i) =>
    `<tr class="${i % 2 === 0 ? '' : 'alt'}">` +
    columns.map(c => `<td>${r[c.key] ?? '—'}</td>`).join('') +
    '</tr>'
  ).join('');

  const win = window.open('', '_blank', 'width=1100,height=700');
  if (!win) return; // popup blocked
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} — Print</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px; }
        h2 { font-size: 16px; color: #9a3412; margin-bottom: 4px; }
        p  { font-size: 11px; color: #64748b; margin: 0 0 14px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #c2410c; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr.alt td { background: #fff7ed; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <h2>${title}</h2>
      <p>${subtitle} — Printed on ${new Date().toLocaleString()} — ${rows.length} record(s)</p>
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

function ExportMenu({ onCSV, onExcel, onPrint }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={{ ...s.btn, background: '#1e293b', color: '#fff', border: 'none' }} onClick={() => setOpen(v => !v)}>
        <Download size={14} /> Export <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 190, overflow: 'hidden', zIndex: 50 }}>
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            Export / Print
          </div>
          {[
            { icon: <FileText size={14} color="#0369a1" />, label: 'Export as CSV', action: onCSV, color: '#0369a1' },
            { icon: <FileSpreadsheet size={14} color="#166534" />, label: 'Export as Excel', action: onExcel, color: '#166534' },
            { icon: <Printer size={14} color="#9a3412" />, label: 'Print / Save as PDF', action: onPrint, color: '#9a3412' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#374151', fontFamily: "'DM Sans',sans-serif", textAlign: 'left', fontWeight: 500 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = item.color; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151'; }}
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

/**
 * Builds a compact list of page numbers with ellipsis markers, e.g.
 * [1, '…', 4, 5, 6, '…', 12]. Always keeps first, last, current, and
 * one neighbour on each side visible.
 */
function buildPageList(current, total) {
  const pages: (number | string)[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  pages.push(1);
  if (left > 2) pages.push('…');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function PaginationBar({ page, totalPages, total, limit, onPage, onLimit }) {
  if (total === 0) return null;

  const pages = buildPageList(page, totalPages);
  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, total);

  const navBtn = (disabled) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0',
    background: disabled ? '#f8fafc' : '#fff', color: disabled ? '#cbd5e1' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif",
  });

  const pageBtn = (active) => ({
    minWidth: 30, height: 30, padding: '0 8px', borderRadius: 7, fontSize: 13, fontWeight: 700,
    border: active ? `1px solid ${ORANGE}` : '1px solid #e2e8f0',
    background: active ? ORANGE : '#fff', color: active ? '#fff' : '#374151',
    cursor: active ? 'default' : 'pointer', fontFamily: "'DM Sans',sans-serif",
  });

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#fff7ed',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748b' }}>
        <span>
          Showing <strong style={{ color: '#1e293b' }}>{startRow}–{endRow}</strong> of{' '}
          <strong style={{ color: '#1e293b' }}>{total}</strong> record{total !== 1 ? 's' : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#94a3b8' }}>Rows per page</span>
          <select
            value={limit}
            onChange={e => onLimit(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', color: '#374151', fontFamily: "'DM Sans',sans-serif" }}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button title="First page" disabled={page === 1} onClick={() => onPage(1)} style={navBtn(page === 1)}>
          <ChevronsLeft size={15} />
        </button>
        <button title="Previous page" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))} style={navBtn(page === 1)}>
          <ChevronLeft size={15} />
        </button>

        {pages.map((p, idx) =>
          p === '…' ? (
            <span key={`ellipsis-${idx}`} style={{ width: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>…</span>
          ) : (
            <button key={p} onClick={() => onPage(p as number)} disabled={p === page} style={pageBtn(p === page)}>
              {p}
            </button>
          )
        )}

        <button title="Next page" disabled={page === totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} style={navBtn(page === totalPages)}>
          <ChevronRight size={15} />
        </button>
        <button title="Last page" disabled={page === totalPages} onClick={() => onPage(totalPages)} style={navBtn(page === totalPages)}>
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}

const SUMMARY_COLUMNS = [
  { key: 'count_desc',       label: 'Count / Sort' },
  { key: 'hsn_code',         label: 'HSN Code' },
  { key: 'pieces',           label: 'Pieces' },
  { key: 'total_kgs',        label: 'Total KGS' },
  { key: 'suppliers',        label: 'Suppliers' },
  { key: 'locations',        label: 'Locations' },
  { key: 'last_inward_date', label: 'Last Inward' },
  { key: 'stock_level',      label: 'Stock Level' },
];

const DETAIL_COLUMNS = [
  { key: 'source',       label: 'Source' },
  { key: 'lot_no',       label: 'Lot No' },
  { key: 'count_desc',   label: 'Count / Yarn' },
  { key: 'hsn_code',     label: 'HSN Code' },
  { key: 'received_kgs', label: 'Received KGS' },
  { key: 'rate',         label: 'Rate' },
  { key: 'supplier_name',label: 'Supplier' },
  { key: 'location_name',label: 'Location' },
  { key: 'inward_no',    label: 'Inward No' },
  { key: 'inward_date',  label: 'Inward Date' },
];

// ── Manual "Add / Edit In-Stock" form ───────────────────────────────────
interface ManualYarnForm {
  entry_date: string;
  count_desc: string;
  yarn_code: string;
  hsn_code: string;
  supplier_name: string;
  location_name: string;
  lot_no: string;
  received_kgs: string;
  rate: string;
  remarks: string;
}

const emptyManualForm = (): ManualYarnForm => ({
  entry_date: new Date().toISOString().slice(0, 10),
  count_desc: '',
  yarn_code: '',
  hsn_code: '',
  supplier_name: '',
  location_name: '',
  lot_no: '',
  received_kgs: '',
  rate: '',
  remarks: '',
});

const formFromRow = (row: YarnStockDetailRow): ManualYarnForm => ({
  entry_date: row.inward_date ? String(row.inward_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
  count_desc: row.count_desc || '',
  yarn_code: row.yarn_code || '',
  hsn_code: row.hsn_code || '',
  supplier_name: row.supplier_name || '',
  location_name: row.location_name || '',
  lot_no: row.lot_no || '',
  received_kgs: String(row.received_kgs ?? ''),
  rate: row.rate != null ? String(row.rate) : '',
  remarks: '',
});

function AddInStockModal({
  open, mode, form, saving, error, onChange, onClose, onSubmit,
}: {
  open: boolean;
  mode: 'add' | 'edit';
  form: ManualYarnForm;
  saving: boolean;
  error: string;
  onChange: (field: keyof ManualYarnForm, value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  if (!open) return null;

  const field = (
    label: string, key: keyof ManualYarnForm,
    opts: { type?: string; required?: boolean; placeholder?: string } = {}
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
        {label}{opts.required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      <input
        style={s.input}
        type={opts.type || 'text'}
        value={form[key]}
        placeholder={opts.placeholder}
        step={opts.type === 'number' ? '0.01' : undefined}
        min={opts.type === 'number' ? '0' : undefined}
        autoComplete="off"
        onChange={e => onChange(key, e.target.value)}
      />
    </div>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', zIndex: 1000, overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <PackagePlus size={18} color={ORANGE} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: ORANGE }}>
              {mode === 'edit' ? 'Edit In-Stock Entry' : 'Add In-Stock (Manual Entry)'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ padding: '18px 20px', maxHeight: '62vh', overflowY: 'auto' }}>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              Use this for yarn stock that didn't arrive through a Yarn Purchase Inward —
              opening balances, physical-count corrections, transfers from another unit, etc.
            </p>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '9px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {field('Entry Date', 'entry_date', { type: 'date', required: true })}
              {field('Count / Yarn Description', 'count_desc', { required: true, placeholder: 'e.g. 30s Combed Cotton' })}
              {field('Yarn Code', 'yarn_code', { placeholder: 'Optional' })}
              {field('HSN Code', 'hsn_code', { placeholder: 'e.g. 5205' })}
              {field('Supplier', 'supplier_name', { placeholder: 'Optional' })}
              {field('Location', 'location_name', { placeholder: 'e.g. Unit 1 Godown' })}
              {field('Lot No', 'lot_no')}
              {field('Rate', 'rate', { type: 'number', placeholder: '0.00' })}
              {field('Received KGS', 'received_kgs', { type: 'number', required: true, placeholder: '0.00' })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Remarks</label>
              <textarea
                style={{ ...s.input, resize: 'vertical' }}
                rows={2}
                value={form.remarks}
                placeholder="Optional note about why this stock was added manually"
                onChange={e => onChange('remarks', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #cbd5e1', background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: saving ? 0.6 : 1 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: saving ? 0.7 : 1 }}>
              {saving ? (<><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>) : (mode === 'edit' ? 'Save Changes' : 'Add Stock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function YarnStock() {
  const [tab, setTab]           = useState<'summary' | 'detail'>('summary');
  const [meta, setMeta]         = useState<YarnStockMeta>({ locations: [], suppliers: [] });
  const [summary, setSummary]   = useState<YarnStockSummaryRow[]>([]);
  const [detail, setDetail]     = useState<YarnStockDetailRow[]>([]);
  const [stats, setStats]       = useState<YarnStockStats>({ total_kgs: 0, inward_kgs: 0, manual_kgs: 0, total_pieces: 0, total_counts: 0, total_locations: 0 });
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch]     = useState('');
  const [location, setLocation] = useState('');
  const [supplier, setSupplier] = useState('');
  const [countFilter, setCountFilter] = useState(''); // Count / Sort filter
  const [countOptions, setCountOptions] = useState<string[]>([]);
  const [page, setPage]         = useState(1);
  const [limit, setLimit]       = useState(10);

  // Manual "Add / Edit In-Stock" modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState<ManualYarnForm>(emptyManualForm());
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await yarnStockService.getMeta());
    } catch (e: any) {
      // Non-fatal for the page (filters just stay empty), but still useful to know about.
      console.error('Failed to load yarn stock filters:', e.message);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const filters = { search, location, supplier, count: countFilter, page, limit };
      if (tab === 'summary') {
        const res = await yarnStockService.getSummary(filters);
        setSummary(res.data); setTotal(res.total); setStats(res.stats);
      } else {
        const res = await yarnStockService.getDetail(filters);
        setDetail(res.data); setTotal(res.total);
      }
    } catch (e: any) {
      console.error('Failed to load yarn stock:', e);
      setLoadError(e.message || 'Unknown error while loading yarn stock.');
      if (tab === 'summary') { setSummary([]); setStats({ total_kgs: 0, inward_kgs: 0, manual_kgs: 0, total_pieces: 0, total_counts: 0, total_locations: 0 }); }
      else { setDetail([]); }
      setTotal(0);
    }
    setLoading(false);
  }, [tab, search, location, supplier, countFilter, page, limit]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, location, supplier, countFilter, tab, limit]);

  // Accumulate distinct Count / Sort values seen so far on the Summary tab
  // to populate the filter dropdown. There's no dedicated "distinct counts"
  // endpoint yet, so this grows as the user searches/paginates — swap for
  // `meta.counts` once the backend exposes one, same as locations/suppliers.
  useEffect(() => {
    if (tab !== 'summary' || !summary.length) return;
    setCountOptions(prev => {
      const set = new Set(prev);
      summary.forEach(r => { if (r.count_desc) set.add(r.count_desc); });
      const next = Array.from(set).sort((a, b) => a.localeCompare(b));
      return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
    });
  }, [summary, tab]);

  // ── Manual entry handlers ──
  const openAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setManualForm(emptyManualForm());
    setManualError('');
    setShowManualModal(true);
  };
  const openEditModal = (row: YarnStockDetailRow) => {
    // item_id looks like "M-14" for manual rows — pull the numeric id back out.
    const numericId = Number(String(row.item_id).replace(/^M-/, ''));
    setModalMode('edit');
    setEditingId(Number.isFinite(numericId) ? numericId : null);
    setManualForm(formFromRow(row));
    setManualError('');
    setShowManualModal(true);
  };
  const closeManualModal = () => {
    if (manualSaving) return;
    setShowManualModal(false);
  };
  const handleManualChange = (fieldKey: keyof ManualYarnForm, value: string) => {
    setManualForm(prev => ({ ...prev, [fieldKey]: value }));
  };
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');

    if (!manualForm.count_desc.trim()) {
      setManualError('Count / Yarn Description is required.');
      return;
    }
    const kgsNum = Number(manualForm.received_kgs);
    if (!manualForm.received_kgs || isNaN(kgsNum) || kgsNum <= 0) {
      setManualError('Enter a valid KGS value greater than 0.');
      return;
    }

    setManualSaving(true);
    try {
      const payload = {
        ...manualForm,
        count_desc: manualForm.count_desc.trim(),
        received_kgs: kgsNum,
        rate: manualForm.rate ? Number(manualForm.rate) : undefined,
      };
      if (modalMode === 'edit' && editingId != null) {
        await yarnStockService.updateManual(editingId, payload);
      } else {
        await yarnStockService.addManual(payload);
      }
      setShowManualModal(false);
      setManualForm(emptyManualForm());
      setEditingId(null);
      await load();
    } catch (err: any) {
      setManualError(err?.response?.data?.message || err?.message || 'Failed to save stock entry.');
    } finally {
      setManualSaving(false);
    }
  };
  const handleDeleteManual = async (row: YarnStockDetailRow) => {
    const numericId = Number(String(row.item_id).replace(/^M-/, ''));
    if (!Number.isFinite(numericId)) return;
    if (!window.confirm('Delete this manually added stock entry? This cannot be undone.')) return;
    try {
      await yarnStockService.deleteManual(numericId);
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Failed to delete entry.');
    }
  };

  const rows = tab === 'summary' ? summary : detail;
  const columns = tab === 'summary' ? SUMMARY_COLUMNS : DETAIL_COLUMNS;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const inwardKgs = stats.inward_kgs ?? 0;
  const manualKgs = stats.manual_kgs ?? 0;
  const fmtKgs = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Since `count` is now sent to the backend alongside search/location/
  // supplier, `stats` (from getSummary) already reflects the filtered
  // totals for whichever Count/Sort is selected — no extra client-side
  // summing needed to show "total for this count" next to the dropdown.
  const hasFilters = Boolean(search || location || supplier || countFilter);
  const clearFilters = () => { setSearch(''); setLocation(''); setSupplier(''); setCountFilter(''); };

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: ORANGE }}>Yarn Stock</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
            Stock from Yarn Purchase Inward + manual entries — {total} piece{total !== 1 ? 's' : ''} in view
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, background: ORANGE, borderColor: ORANGE, color: '#fff' }} onClick={openAddModal}>
            <PlusCircle size={15} /> Add In-Stock
          </button>
          <button style={{ ...s.btn, borderColor: '#fed7aa', color: ORANGE }} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
          </button>
          <div style={{ position: 'relative' }}>
            <ExportMenu
              onCSV={() => {
                if (rows.length === 0) return;
                exportCSV(rows, columns, `yarn_stock_${tab}_${Date.now()}.csv`);
              }}
              onExcel={() => {
                if (rows.length === 0) return;
                exportExcel(rows, columns, `yarn_stock_${tab}_${Date.now()}.xls`);
              }}
              onPrint={() => {
                if (rows.length === 0) return;
                printTable(rows, columns, 'Yarn Stock', tab === 'summary' ? 'Summary view' : 'Piece Detail view');
              }}
            />
          </div>
        </div>
      </div>

      <ErrorBanner message={loadError} onDismiss={() => setLoadError('')} />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard
          icon={<Layers size={18} color={ORANGE} />} bg="#ffedd5" label="Total Stock KGS"
          value={`${fmtKgs(stats.total_kgs)} KGS`}
          sub={`Inward ${fmtKgs(inwardKgs)} + Manual ${fmtKgs(manualKgs)} KGS`}
        />
        <StatCard icon={<Package size={18} color="#0f766e" />} bg="#ccfbf1" label="Pieces in Stock" value={stats.total_pieces} />
        <StatCard icon={<Boxes size={18} color="#6d28d9" />} bg="#ede9fe" label="Yarn Counts" value={stats.total_counts} />
        <StatCard icon={<MapPin size={18} color="#2563eb" />} bg="#dbeafe" label="Locations" value={stats.total_locations} />
      </div>

      {/* Tabs + toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden' }}>
          {[{ k: 'summary', l: '▦ Summary' }, { k: 'detail', l: '≡ Piece Detail' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: tab === t.k ? ORANGE : '#fff', color: tab === t.k ? '#fff' : '#374151' }}>
              {t.l}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input style={{ ...s.input, paddingLeft: 32 }} placeholder="Search sort no, construction, HSN…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <select style={{ ...s.input, width: 170 }} value={location} onChange={e => setLocation(e.target.value)}>
          <option value="">All Locations</option>
          {meta.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select style={{ ...s.input, width: 170 }} value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">All Suppliers</option>
          {meta.suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>

        {/* Count / Sort filter — shows the total KGS + piece count for the
            selected Count/Sort right below it, sourced from `stats` since
            `countFilter` is included in the backend filters. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <select style={{ ...s.input, width: 190 }} value={countFilter} onChange={e => setCountFilter(e.target.value)}>
            <option value="">All Counts / Sorts</option>
            {countOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {countFilter && !loading && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
              color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6,
              padding: '2px 8px', whiteSpace: 'nowrap',
            }}>
              <Boxes size={11} />
              Total {fmtKgs(stats.total_kgs)} KGS · {stats.total_pieces} pc(s)
            </span>
          )}
        </div>

        {hasFilters && (
          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: ORANGE, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 4px' }}>
            Clear filters
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{total} record{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
            <thead>
              <tr style={{ background: ORANGE }}>
                {columns.map(c => (
                  <th key={c.key} style={{ padding: '11px 14px', color: '#fff', textAlign: 'left', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>
                ))}
                {tab === 'detail' && (
                  <th style={{ padding: '11px 14px', color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Fix the connection issue above, then hit Refresh.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No stock found for the selected filters.</td></tr>
              ) : rows.map((row: any, i) => (
                <tr key={row.item_id ?? row.yarn_id ?? i} style={{ background: i % 2 === 0 ? '#fff' : '#fff7ed' }}>
                  {columns.map(c => {
                    const val = row[c.key];
                    if (c.key === 'source') return (
                      <td key={c.key} style={{ padding: '10px 14px' }}><SourceBadge source={val} /></td>
                    );
                    if (c.key === 'stock_level') return (
                      <td key={c.key} style={{ padding: '10px 14px' }}>
                        <StockChip level={val} />
                        {row.has_pending_inspection ? <PendingBadge /> : null}
                      </td>
                    );
                    if (c.key === 'total_kgs' || c.key === 'received_kgs') return <td key={c.key} style={{ padding: '10px 14px', fontFamily: 'DM Mono,monospace', fontWeight: 700, color: ORANGE }}>{Number(val ?? 0).toFixed(2)} KGS</td>;
                    if (c.key === 'inward_date' || c.key === 'last_inward_date') return <td key={c.key} style={{ padding: '10px 14px' }}>{val ? new Date(val).toLocaleDateString() : '—'}</td>;
                    if (c.key === 'pieces') return <td key={c.key} style={{ padding: '10px 14px' }}>{val}</td>;
                    return <td key={c.key} style={{ padding: '10px 14px' }}>{val ?? '—'}</td>;
                  })}
                  {tab === 'detail' && (
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {row.source === 'manual' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <button title="Edit manual entry" onClick={() => openEditModal(row)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid #bfdbfe', color: '#1d4ed8', background: '#fff', cursor: 'pointer' }}>
                            <Pencil size={13} />
                          </button>
                          <button title="Delete manual entry" onClick={() => handleDeleteManual(row)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', cursor: 'pointer' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && !loadError && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPage={(p: number) => setPage(p)}
            onLimit={(n: number) => { setLimit(n); setPage(1); }}
          />
        )}
      </div>

      <AddInStockModal
        open={showManualModal}
        mode={modalMode}
        form={manualForm}
        saving={manualSaving}
        error={manualError}
        onChange={handleManualChange}
        onClose={closeManualModal}
        onSubmit={handleManualSubmit}
      />

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}