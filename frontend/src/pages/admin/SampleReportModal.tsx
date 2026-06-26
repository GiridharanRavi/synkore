import React, { useEffect, useState, useRef } from 'react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface SampleRecord {
  id: number;
  request_code: string;
  customer_name: string;
  agent_name: string;
  sample_type: 'parcel' | 'whatsapp';
  fabric_code: string;
  fabric_quality: string;
  color: string;
  quantity_meters: number;
  customer_comments: string;
  status: string;
  image_url?: string;
  created_at?: string;
}

interface DevAnalysis {
  id?: number;
  style_number?: string;
  construction?: string;
  blend?: string;
  gsm?: string | number;
  weave_type?: string;
  analyzed_by?: string;
  analysis_date?: string;
  remarks?: string;
}

interface YardageMOQ {
  id?: number;
  order_type?: string;
  moq_meters?: number | string;
  moq_yards?: number | string;
  price_per_meter?: number | string;
  price_per_yard?: number | string;
  currency?: string;
  valid_from?: string;
  valid_until?: string;
}

interface PriceListEntry {
  id?: number;
  list_type?: string;
  min_quantity_meters?: number | string;
  max_quantity_meters?: number | string;
  price_per_meter?: number | string;
  discount_percent?: number | string;
  total_price?: number | string;
  final_price?: number | string;
  currency?: string;
  remarks?: string;
}

interface ProcessReportData {
  sample: SampleRecord;
  devAnalyses: DevAnalysis[];
  yardageMOQs: YardageMOQ[];
  priceLists: PriceListEntry[];
}

interface SampleReportModalProps {
  record: SampleRecord | null;
  onClose: () => void;
  /** Base API URL e.g. http://localhost:5000 */
  baseUrl?: string;
}

// ─────────────────────────────────────────────
// STATUS META
// ─────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  pending:          { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
  quality_check:    { color: '#1e40af', bg: '#dbeafe', label: 'Quality Check' },
  yardage_pricing:  { color: '#7c3aed', bg: '#ede9fe', label: 'Yardage Pricing' },
  price_listed:     { color: '#065f46', bg: '#d1fae5', label: 'Price Listed' },
  bulk_order_ready: { color: '#1e3a5f', bg: '#bfdbfe', label: 'Bulk Ready' },
  approved:         { color: '#14532d', bg: '#bbf7d0', label: 'Approved' },
  rejected:         { color: '#7f1d1d', bg: '#fee2e2', label: 'Rejected' },
  rework:           { color: '#7c2d12', bg: '#ffedd5', label: 'Rework' },
  collected:        { color: '#134e4a', bg: '#ccfbf1', label: 'Collected' },
  Approved:         { color: '#14532d', bg: '#bbf7d0', label: 'Approved' },
  Collected:        { color: '#134e4a', bg: '#ccfbf1', label: 'Collected' },
  Pending:          { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
  Rejected:         { color: '#7f1d1d', bg: '#fee2e2', label: 'Rejected' },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const fmt = (v: any, suffix = '') =>
  v != null && v !== '' ? `${v}${suffix}` : '—';

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtCurrency = (amt?: number | string, cur = 'INR') =>
  amt != null && amt !== '' ? `${cur} ${Number(amt).toFixed(2)}` : '—';

const calcYards = (m?: number | string) =>
  m ? (Number(m) * 1.09361).toFixed(3) : '—';

const calcPriceYard = (ppm?: number | string) =>
  ppm ? (Number(ppm) / 1.09361).toFixed(2) : '—';

// ─────────────────────────────────────────────
// WORD EXPORT
// ─────────────────────────────────────────────

function exportToWord(data: ProcessReportData) {
  const { sample, devAnalyses, yardageMOQs, priceLists } = data;
  const sm = STATUS_META[sample.status] || { label: sample.status, color: '#374151', bg: '#f3f4f6' };
  const da = devAnalyses[0] || {};

  const wordHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Development Report - ${sample.request_code}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; margin: 0; }
        h1   { font-size: 20pt; color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
        h2   { font-size: 14pt; color: #1e293b; background: #f1f5f9; padding: 6px 10px; border-left: 4px solid #6366f1; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt; }
        th   { background: #1e40af; color: #fff; padding: 7px 10px; text-align: left; }
        td   { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .lbl { color: #64748b; font-size: 9pt; }
        .val { font-weight: bold; }
        .green { color: #16a34a; font-weight: bold; }
        .footer { margin-top: 40px; color: #94a3b8; font-size: 9pt; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      </style>
    </head>
    <body>
      <h1>&#x1F9F5; Development Process Report</h1>
      <p><b>Report Code:</b> ${sample.request_code} &nbsp;|&nbsp;
         <b>Generated:</b> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

      <h2>&#x1F4CB; Sample Request Details</h2>
      <table>
        <tr><td class="lbl">Customer</td><td class="val">${sample.customer_name}</td>
            <td class="lbl">Agent</td><td class="val">${sample.agent_name || '—'}</td></tr>
        <tr><td class="lbl">Fabric Code</td><td class="val">${sample.fabric_code}</td>
            <td class="lbl">Fabric Quality</td><td class="val">${sample.fabric_quality}</td></tr>
        <tr><td class="lbl">Color</td><td class="val">${sample.color}</td>
            <td class="lbl">Quantity</td><td class="val">${sample.quantity_meters} meters</td></tr>
        <tr><td class="lbl">Sample Type</td><td class="val">${sample.sample_type}</td>
            <td class="lbl">Status</td><td class="val">${sm.label}</td></tr>
        <tr><td class="lbl">Created</td><td class="val">${fmtDate(sample.created_at)}</td>
            <td class="lbl">Comments</td><td class="val">${sample.customer_comments || '—'}</td></tr>
      </table>

      <h2>&#x1F52C; Process 1 — Development Analysis</h2>
      ${devAnalyses.length === 0 ? '<p><i>No development analysis data saved.</i></p>' : `
        <table>
         
              <td class="lbl">Style Number</td><td>${fmt(da.style_number)}</td></tr>
          <tr><td class="lbl">Construction</td><td>${fmt(da.construction)}</td>
              <td class="lbl">Blend</td><td>${fmt(da.blend)}</td></tr>
          <tr><td class="lbl">GSM</td><td>${fmt(da.gsm)}</td>
              <td class="lbl">Weave Type</td><td>${fmt(da.weave_type)}</td></tr>
              <td class="lbl">Analyzed By</td><td>${fmt(da.analyzed_by)}</td></tr>
          <tr><td class="lbl">Analysis Date</td><td>${fmtDate(da.analysis_date)}</td>
              <td class="lbl">Remarks</td><td>${fmt(da.remarks)}</td></tr>
        </table>
      `}

      <h2>&#x1F4E6; Process 2 — Yardage &amp; MOQ</h2>
      ${yardageMOQs.length === 0 ? '<p><i>No yardage/MOQ data saved.</i></p>' : `
        <table>
          <tr><th>Order Type</th><th>MOQ (m)</th><th>MOQ (yd)</th><th>Price/m</th><th>Price/yd</th><th>Currency</th><th>Valid From</th><th>Valid Until</th></tr>
          ${yardageMOQs.map(y => `
            <tr>
              <td>${fmt(y.order_type)}</td>
              <td>${fmt(y.moq_meters)}</td>
              <td>${calcYards(y.moq_meters)}</td>
              <td>${fmt(y.price_per_meter)}</td>
              <td>${calcPriceYard(y.price_per_meter)}</td>
              <td>${fmt(y.currency)}</td>
              <td>${fmtDate(y.valid_from)}</td>
              <td>${fmtDate(y.valid_until)}</td>
            </tr>
          `).join('')}
        </table>
      `}

      <h2>&#x1F4B0; Process 3 — Price List</h2>
      ${priceLists.length === 0 ? '<p><i>No price list data saved.</i></p>' : `
        <table>
          <tr><th>Type</th><th>Min Qty (m)</th><th>Max Qty (m)</th><th>Price/m</th><th>Discount</th><th>Total</th><th>Final Price</th><th>Currency</th><th>Remarks</th></tr>
          ${priceLists.map(p => `
            <tr>
              <td>${p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}</td>
              <td>${fmt(p.min_quantity_meters)}</td>
              <td>${fmt(p.max_quantity_meters)}</td>
              <td>${fmt(p.price_per_meter)}</td>
              <td>${fmt(p.discount_percent, '%')}</td>
              <td>${fmtCurrency(p.total_price as number, p.currency)}</td>
              <td style="font-weight:bold; color:#16a34a;">${fmtCurrency(p.final_price as number, p.currency)}</td>
              <td>${fmt(p.currency)}</td>
              <td>${fmt(p.remarks)}</td>
            </tr>
          `).join('')}
        </table>
      `}

      <div class="footer">
        <p>This report was auto-generated from the Fabric Development Sample Request Pipeline.<br>
        Request: ${sample.request_code} &mdash; Customer: ${sample.customer_name}</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Dev_Report_${sample.request_code}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// PDF EXPORT (browser print)
// ─────────────────────────────────────────────

function exportToPdf(data: ProcessReportData) {
  const { sample, devAnalyses, yardageMOQs, priceLists } = data;
  const sm = STATUS_META[sample.status] || { label: sample.status, color: '#374151', bg: '#f3f4f6' };
  const da = devAnalyses[0] || {};

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Development Report - ${sample.request_code}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 24px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
          @page { margin: 15mm; size: A4; }
        }
        .report-header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #fff; border-radius: 12px; padding: 24px 28px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
        .report-header h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
        .report-header .sub { font-size: 11px; opacity: .75; }
        .report-header .meta { text-align: right; font-size: 11px; opacity: .85; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; background: ${sm.bg}; color: ${sm.color}; }
        .section { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .section-header { background: #f8fafc; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
        .section-header .icon { font-size: 16px; }
        .section-header h2 { font-size: 13px; font-weight: 800; color: #1e293b; }
        .section-header .proc { font-size: 10px; font-weight: 700; color: #6366f1; background: #ede9fe; padding: 2px 8px; border-radius: 20px; }
        .section-body { padding: 14px 16px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .info-item .lbl { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 2px; }
        .info-item .val { font-size: 12px; font-weight: 700; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #1e3a8a; color: #fff; padding: 7px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
        tr:last-child td { border-bottom: none; }
        tr:nth-child(even) td { background: #fafbff; }
        .green { color: #16a34a; font-weight: 700; }
        .badge-bulk   { background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; }
        .badge-sample { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; }
        .empty-state { color: #94a3b8; font-style: italic; padding: 10px 0; font-size: 11px; }
        .divider { border: none; border-top: 1px dashed #e2e8f0; margin: 10px 0; }
        .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; color: #94a3b8; font-size: 9px; }
        .print-bar { display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 16px; }
        .print-btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; }
        .btn-blue { background: #1e40af; color: #fff; }
        .btn-gray { background: #f1f5f9; color: #374151; }
      </style>
    </head>
    <body>
      <div class="print-bar no-print">
        <button class="print-btn btn-gray" onclick="window.close()">✕ Close</button>
        <button class="print-btn btn-blue" onclick="window.print()">🖨 Print / Save PDF</button>
      </div>

      <div class="report-header">
        <div>
          <div class="sub">FABRIC DEVELOPMENT · SAMPLE PROCESS REPORT</div>
          <h1>🧵 ${sample.request_code}</h1>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="status-badge">${sm.label}</span>
            <span style="opacity:.7;">${sample.customer_name}</span>
            ${sample.agent_name ? `<span style="opacity:.55;">· Agent: ${sample.agent_name}</span>` : ''}
          </div>
        </div>
        <div class="meta">
          <div style="font-weight:800; font-size:13px;">Report Generated</div>
          <div>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div style="margin-top:4px; opacity:.7;">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      <!-- SAMPLE DETAILS -->
      <div class="section">
        <div class="section-header"><span class="icon">📋</span><h2>Sample Request Details</h2></div>
        <div class="section-body">
          <div class="info-grid">
            <div class="info-item"><div class="lbl">Fabric Code</div><div class="val">${sample.fabric_code || '—'}</div></div>
            <div class="info-item"><div class="lbl">Fabric Quality</div><div class="val">${sample.fabric_quality || '—'}</div></div>
            <div class="info-item"><div class="lbl">Color</div><div class="val">${sample.color || '—'}</div></div>
            <div class="info-item"><div class="lbl">Quantity</div><div class="val">${sample.quantity_meters} m</div></div>
            <div class="info-item"><div class="lbl">Sample Type</div><div class="val">${sample.sample_type}</div></div>
            <div class="info-item"><div class="lbl">Created</div><div class="val">${fmtDate(sample.created_at)}</div></div>
          </div>
          ${sample.customer_comments ? `<hr class="divider"><div class="info-item"><div class="lbl">Customer Comments</div><div class="val" style="font-weight:400; color:#475569;">${sample.customer_comments}</div></div>` : ''}
        </div>
      </div>

      <!-- P1: DEV ANALYSIS -->
      <div class="section">
        <div class="section-header"><span class="icon">🔬</span><h2>Development Analysis</h2><span class="proc">Process 1</span></div>
        <div class="section-body">
          ${devAnalyses.length === 0
            ? '<div class="empty-state">No development analysis has been saved for this request.</div>'
            : `<div class="info-grid">
              
                <div class="info-item"><div class="lbl">Style Number</div><div class="val">${fmt(da.style_number)}</div></div>
                <div class="info-item"><div class="lbl">Construction</div><div class="val">${fmt(da.construction)}</div></div>
                <div class="info-item"><div class="lbl">Blend</div><div class="val">${fmt(da.blend)}</div></div>
                <div class="info-item"><div class="lbl">GSM</div><div class="val">${fmt(da.gsm)}</div></div>
                <div class="info-item"><div class="lbl">Weave Type</div><div class="val">${fmt(da.weave_type)}</div></div>
               
                <div class="info-item"><div class="lbl">Analyzed By</div><div class="val">${fmt(da.analyzed_by)}</div></div>
              </div>
              ${da.remarks ? `<hr class="divider"><div class="info-item" style="margin-top:0;"><div class="lbl">Remarks</div><div class="val" style="font-weight:400; color:#475569;">${da.remarks}</div></div>` : ''}`
          }
        </div>
      </div>

      <!-- P2: YARDAGE & MOQ -->
      <div class="section">
        <div class="section-header"><span class="icon">📦</span><h2>Yardage &amp; MOQ</h2><span class="proc">Process 2</span></div>
        <div class="section-body">
          ${yardageMOQs.length === 0
            ? '<div class="empty-state">No yardage & MOQ data has been saved for this request.</div>'
            : `<table>
                <thead><tr>
                  <th>Order Type</th><th>MOQ (m)</th><th>MOQ (yd)</th>
                  <th>Price/m</th><th>Price/yd</th><th>Currency</th><th>Valid From</th><th>Valid Until</th>
                </tr></thead>
                <tbody>
                  ${yardageMOQs.map(y => `
                    <tr>
                      <td>${fmt(y.order_type)}</td>
                      <td>${fmt(y.moq_meters)}</td>
                      <td style="color:#92400e;">${calcYards(y.moq_meters)}</td>
                      <td>${fmt(y.price_per_meter)}</td>
                      <td style="color:#92400e;">${calcPriceYard(y.price_per_meter)}</td>
                      <td>${fmt(y.currency)}</td>
                      <td>${fmtDate(y.valid_from)}</td>
                      <td>${fmtDate(y.valid_until)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>

      <!-- P3: PRICE LIST -->
      <div class="section">
        <div class="section-header"><span class="icon">💰</span><h2>Price List</h2><span class="proc">Process 3</span></div>
        <div class="section-body">
          ${priceLists.length === 0
            ? '<div class="empty-state">No price list data has been saved for this request.</div>'
            : `<table>
                <thead><tr>
                  <th>Type</th><th>Min Qty (m)</th><th>Max Qty (m)</th>
                  <th>Price/m</th><th>Discount</th><th>Total</th><th>Final Price</th><th>Remarks</th>
                </tr></thead>
                <tbody>
                  ${priceLists.map(p => `
                    <tr>
                      <td><span class="${p.list_type === 'bulk_order' ? 'badge-bulk' : 'badge-sample'}">${p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}</span></td>
                      <td>${fmt(p.min_quantity_meters)}</td>
                      <td>${fmt(p.max_quantity_meters)}</td>
                      <td>${fmtCurrency(p.price_per_meter as number, p.currency)}</td>
                      <td>${fmt(p.discount_percent, '%')}</td>
                      <td>${fmtCurrency(p.total_price as number, p.currency)}</td>
                      <td class="green">${fmtCurrency(p.final_price as number, p.currency)}</td>
                      <td>${fmt(p.remarks)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>

      <div class="footer">
        <div>Fabric Development · Sample Request Pipeline</div>
        <div>Report: ${sample.request_code} · ${sample.customer_name}</div>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.focus(), 400);
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function SampleReportModal({
  record,
  onClose,
  baseUrl = 'http://localhost:5000',
}: SampleReportModalProps) {
  const [data, setData]       = useState<ProcessReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const scrollRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!record) return;
    setData(null); setError(null); setLoading(true);

    // Fetch all three process tables using sample_request_id
    Promise.all([
      fetch(`${baseUrl}/api/dev-analysis?sample_request_id=${record.id}`).then(r => r.json()),
      fetch(`${baseUrl}/api/yardage-moq?sample_request_id=${record.id}`).then(r => r.json()),
      fetch(`${baseUrl}/api/price-lists?sample_request_id=${record.id}`).then(r => r.json()),
    ])
      .then(([da, ym, pl]) => {
        setData({
          sample:       record,
          devAnalyses:  Array.isArray(da?.data) ? da.data : Array.isArray(da) ? da : [],
          yardageMOQs:  Array.isArray(ym?.data) ? ym.data : Array.isArray(ym) ? ym : [],
          priceLists:   Array.isArray(pl?.data) ? pl.data : Array.isArray(pl) ? pl : [],
        });
      })
      .catch(() => setError('Failed to load process data. Please try again.'))
      .finally(() => setLoading(false));
  }, [record]);

  if (!record) return null;

  const sm = STATUS_META[record.status] || { label: record.status, color: '#374151', bg: '#f3f4f6' };

  // Process completion indicators (3 processes matching image)
  const steps = [
    { id: 1, icon: '🔬', label: 'Dev Analysis', count: data?.devAnalyses.length  ?? null, color: '#6366f1' },
    { id: 2, icon: '📦', label: 'Yardage & MOQ', count: data?.yardageMOQs.length ?? null, color: '#f59e0b' },
    { id: 3, icon: '💰', label: 'Price List',   count: data?.priceLists.length   ?? null, color: '#10b981' },
  ];

  return (
    <div style={rs.overlay} onClick={onClose}>
      <div style={rs.modal} onClick={e => e.stopPropagation()}>

        {/* ── MODAL HEADER ── */}
        <div style={rs.header}>
          <div style={{ flex: 1 }}>
            <div style={rs.headerLabel}>DEVELOPMENT PROCESS REPORT</div>
            <div style={rs.headerTitle}>🧵 {record.request_code}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <span style={{ ...rs.statusBadge, color: sm.color, background: sm.bg }}>{sm.label}</span>
              <span style={rs.headerMeta}>{record.customer_name}</span>
              {record.agent_name && <span style={{ ...rs.headerMeta, opacity: .6 }}>· {record.agent_name}</span>}
              <span style={{ ...rs.headerMeta, opacity: .5 }}>· {fmtDate(record.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <button style={rs.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        {/* ── PROCESS STATUS BAR ── */}
        <div style={rs.processBar}>
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div style={rs.stepWrap}>
                <div style={{
                  ...rs.stepDot,
                  background: s.count != null && s.count > 0 ? s.color : '#e2e8f0',
                  boxShadow: s.count != null && s.count > 0 ? `0 0 0 3px ${s.color}22` : 'none',
                }}>
                  {s.icon}
                </div>
                <div>
                  <div style={rs.stepLabel}>P{s.id} · {s.label}</div>
                  <div style={{ ...rs.stepCount, color: s.count != null && s.count > 0 ? s.color : '#94a3b8' }}>
                    {s.count == null ? '...' : s.count > 0 ? `${s.count} record${s.count > 1 ? 's' : ''}` : 'No data'}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && <div style={rs.stepLine} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── BODY ── */}
        <div style={rs.body} ref={scrollRef}>

          {loading && (
            <div style={rs.center}>
              <div style={rs.spinner} />
              <div style={{ color: '#64748b', marginTop: 12 }}>Loading process data...</div>
            </div>
          )}

          {error && <div style={rs.errorBox}>{error}</div>}

          {data && (
            <>
              {/* Sample Info */}
              <Section icon="📋" title="Sample Request Details" proc="">
                <div style={rs.infoGrid}>
                  <InfoItem label="Fabric Code"    value={data.sample.fabric_code} />
                  <InfoItem label="Fabric Quality" value={data.sample.fabric_quality} />
                  <InfoItem label="Color"          value={data.sample.color} />
                  <InfoItem label="Quantity"       value={`${data.sample.quantity_meters} m`} />
                  <InfoItem label="Sample Type"    value={data.sample.sample_type} />
                  <InfoItem label="Created"        value={fmtDate(data.sample.created_at)} />
                </div>
                {data.sample.customer_comments && (
                  <div style={rs.commentBox}>
                    <div style={rs.commentLabel}>Customer Comments</div>
                    <div style={rs.commentText}>{data.sample.customer_comments}</div>
                  </div>
                )}
              </Section>

              {/* P1: Dev Analysis */}
              <Section icon="🔬" title="Development Analysis" proc="Process 1" color="#6366f1" count={data.devAnalyses.length}>
                {data.devAnalyses.length === 0
                  ? <EmptyState text="No development analysis has been saved for this request." />
                  : (() => {
                      const da = data.devAnalyses[0];
                      return (
                        <div>
                          <div style={rs.infoGrid}>
                          
                            <InfoItem label="Style Number"   value={fmt(da.style_number)} />
                            <InfoItem label="Construction"   value={fmt(da.construction)} />
                            <InfoItem label="Blend"          value={fmt(da.blend)} />
                            <InfoItem label="GSM"            value={fmt(da.gsm)} />
                            <InfoItem label="Weave Type"     value={fmt(da.weave_type)} />
                            <InfoItem label="Analyzed By"    value={fmt(da.analyzed_by)} />
                            <InfoItem label="Analysis Date"  value={fmtDate(da.analysis_date)} />
                          </div>
                          {da.remarks && (
                            <div style={rs.commentBox}>
                              <div style={rs.commentLabel}>Remarks</div>
                              <div style={rs.commentText}>{da.remarks}</div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                }
              </Section>

              {/* P2: Yardage & MOQ */}
              <Section icon="📦" title="Yardage & MOQ" proc="Process 2" color="#f59e0b" count={data.yardageMOQs.length}>
                {data.yardageMOQs.length === 0
                  ? <EmptyState text="No yardage & MOQ data has been saved for this request." />
                  : <table style={rs.table}>
                      <thead>
                        <tr>{['Order Type','MOQ (m)','MOQ (yd)','Price/m','Price/yd','Currency','Valid From','Valid Until'].map(h =>
                          <th key={h} style={rs.th}>{h}</th>
                        )}</tr>
                      </thead>
                      <tbody>
                        {data.yardageMOQs.map((y, i) => (
                          <tr key={i} style={rs.tr}>
                            <td style={rs.td}>
                              <span style={{ ...rs.orderBadge, background: y.order_type === 'bulk' ? '#dbeafe' : '#d1fae5', color: y.order_type === 'bulk' ? '#1d4ed8' : '#065f46' }}>
                                {y.order_type === 'bulk' ? '📦 Bulk' : '🧵 Sample'}
                              </span>
                            </td>
                            <td style={rs.td}><b>{fmt(y.moq_meters)}</b></td>
                            <td style={{ ...rs.td, color: '#92400e' }}>{calcYards(y.moq_meters)}</td>
                            <td style={rs.td}>{fmt(y.price_per_meter)}</td>
                            <td style={{ ...rs.td, color: '#92400e' }}>{calcPriceYard(y.price_per_meter)}</td>
                            <td style={rs.td}>{fmt(y.currency)}</td>
                            <td style={rs.td}>{fmtDate(y.valid_from)}</td>
                            <td style={rs.td}>{fmtDate(y.valid_until)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </Section>

              {/* P3: Price List */}
              <Section icon="💰" title="Price List" proc="Process 3" color="#10b981" count={data.priceLists.length}>
                {data.priceLists.length === 0
                  ? <EmptyState text="No price list entries have been saved for this request." />
                  : <table style={rs.table}>
                      <thead>
                        <tr>{['Type','Min (m)','Max (m)','Price/m','Discount','Total','Final Price','Remarks'].map(h =>
                          <th key={h} style={rs.th}>{h}</th>
                        )}</tr>
                      </thead>
                      <tbody>
                        {data.priceLists.map((p, i) => (
                          <tr key={i} style={rs.tr}>
                            <td style={rs.td}>
                              <span style={{ ...rs.orderBadge, background: p.list_type === 'bulk_order' ? '#dbeafe' : '#d1fae5', color: p.list_type === 'bulk_order' ? '#1d4ed8' : '#065f46' }}>
                                {p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}
                              </span>
                            </td>
                            <td style={rs.td}>{fmt(p.min_quantity_meters)}</td>
                            <td style={rs.td}>{fmt(p.max_quantity_meters)}</td>
                            <td style={rs.td}>{fmtCurrency(p.price_per_meter as number, p.currency)}</td>
                            <td style={rs.td}>{fmt(p.discount_percent, '%')}</td>
                            <td style={rs.td}>{fmtCurrency(p.total_price as number, p.currency)}</td>
                            <td style={{ ...rs.td, color: '#16a34a', fontWeight: 800 }}>{fmtCurrency(p.final_price as number, p.currency)}</td>
                            <td style={rs.td}>{fmt(p.remarks)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </Section>

              {/* Download footer */}
              <div style={rs.downloadBar}>
                <div style={{ color: '#64748b', fontSize: 13 }}>
                  Download full process report for <b>{record.request_code}</b>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={{ ...rs.dlBtn, background: '#1e40af' }} onClick={() => exportToPdf(data)}>
                    📄 Download PDF
                  </button>
                  <button style={{ ...rs.dlBtn, background: '#0f766e' }} onClick={() => exportToWord(data)}>
                    📝 Download Word
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function Section({ icon, title, proc, color, count, children }: {
  icon: string; title: string; proc: string;
  color?: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div style={rs.section}>
      <div style={rs.sectionHeader}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={rs.sectionTitle}>{title}</div>
        </div>
        {proc && (
          <span style={{ ...rs.procBadge, background: `${color}18`, color }}>
            {proc}
          </span>
        )}
        {count != null && (
          <span style={{ ...rs.countBadge, background: count > 0 ? '#f0fdf4' : '#f8fafc', color: count > 0 ? '#16a34a' : '#94a3b8' }}>
            {count} record{count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={rs.sectionBody}>{children}</div>
    </div>
  );
}

function InfoItem({ label, value, valueStyle }: { label: string; value: any; valueStyle?: React.CSSProperties }) {
  return (
    <div style={rs.infoItem}>
      <div style={rs.infoLabel}>{label}</div>
      <div style={{ ...rs.infoVal, ...valueStyle }}>{value || '—'}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={rs.emptyState}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
      <div>{text}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REPORT STYLES
// ─────────────────────────────────────────────

const rs: Record<string, React.CSSProperties> = {
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: 16 },
  modal:        { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', overflow: 'hidden' },

  header:       { display: 'flex', gap: 16, alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff', flexShrink: 0 },
  headerLabel:  { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase' as const, marginBottom: 4 },
  headerTitle:  { fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 },
  headerMeta:   { fontSize: 13, color: '#475569' },
  statusBadge:  { display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
  closeBtn:     { width: 36, height: 36, border: 'none', background: '#f1f5f9', borderRadius: 8, fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },

  processBar:   { display: 'flex', alignItems: 'center', gap: 0, padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 },
  stepWrap:     { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  stepDot:      { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  stepLabel:    { fontSize: 11, fontWeight: 700, color: '#374151' },
  stepCount:    { fontSize: 10, fontWeight: 600 },
  stepLine:     { width: 24, height: 2, background: '#e2e8f0', flexShrink: 0, margin: '0 4px' },

  body:         { flex: 1, overflowY: 'auto' as const, padding: '20px 24px' },
  center:       { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: 60, color: '#64748b' },
  spinner:      { width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  errorBox:     { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 18px', fontSize: 14, fontWeight: 600 },

  section:      { border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  sectionHeader:{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' },
  sectionTitle: { fontSize: 14, fontWeight: 800, color: '#1e293b' },
  sectionBody:  { padding: 16 },
  procBadge:    { padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700 },
  countBadge:   { padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700 },

  infoGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  infoItem:     { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  infoLabel:    { fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: .8 },
  infoVal:      { fontSize: 13, fontWeight: 700, color: '#0f172a' },

  commentBox:   { background: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 12, border: '1px solid #e2e8f0' },
  commentLabel: { fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: .8, marginBottom: 4 },
  commentText:  { fontSize: 13, color: '#475569' },

  table:        { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:           { padding: '9px 12px', background: '#1e3a8a', color: '#fff', textAlign: 'left' as const, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: .5 },
  td:           { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#374151' },
  tr:           {},

  orderBadge:   { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 },
  emptyState:   { textAlign: 'center' as const, color: '#94a3b8', padding: '24px 0', fontSize: 13 },

  downloadBar:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginTop: 4 },
  dlBtn:        { padding: '10px 20px', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 },
};