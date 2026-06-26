// frontend/src/pages/client/ClientSamples.tsx
// KEY FIX: All API calls are scoped to the logged-in customer's `customer_id`
// from the JWT payload (stored in localStorage as `user.customer_id`).
// EXPORT FIX: exportToPdf and exportToWord ported from SampleReportModal.

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSampleRequests } from '../../api/services';
import axios from '../../api/axios';
import { FaRobot } from 'react-icons/fa';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SampleRecord {
  id: number;
  request_code: string;
  fabric_type?: string;
  fabric_code?: string;
  fabric_quality?: string;
  color?: string;
  quantity_meters?: number;
  description?: string;
  customer_comments?: string;
  request_date?: string;
  created_at?: string;
  status: string;
  image_url?: string;
  customer_name?: string;
  agent_name?: string;
  sample_type?: string;
}

interface ChatMessage {
  id?: number;
  sender: 'user' | 'admin' | 'bot';
  message: string;
  created_at?: string;
  is_read?: boolean;
}

interface DevAnalysis {
  id?: number;
  style_number?: string;
  construction?: string;
  blend?: string;
  gsm?: number | string;
  weave_type?: string;
  analyzed_by?: string;
  analysis_date?: string;
  remarks?: string;
}

interface YardageMOQ {
  id?: number;
  fabric_code?: string;
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
  fabric_code?: string;
  color?: string;
  min_quantity_meters?: number | string;
  max_quantity_meters?: number | string;
  price_per_meter?: number | string;
  discount_percent?: number | string;
  total_price?: number | string;
  final_price?: number | string;
  currency?: string;
  remarks?: string;
}

interface Report {
  dev_analysis?: DevAnalysis | null;
  yardage_moq?: YardageMOQ | null;
  price_list?: PriceListEntry[];
}

// ─── Read logged-in user ──────────────────────────────────────────────────────
function getLoggedInUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; bg: string; label: string; dot: string }> = {
  pending:          { color: '#92400e', bg: '#fef3c7', label: 'Pending',         dot: '#f59e0b' },
  quality_check:    { color: '#1e40af', bg: '#dbeafe', label: 'Quality Check',   dot: '#3b82f6' },
  yardage_pricing:  { color: '#7c3aed', bg: '#ede9fe', label: 'Yardage Pricing', dot: '#8b5cf6' },
  price_listed:     { color: '#065f46', bg: '#d1fae5', label: 'Price Listed',    dot: '#10b981' },
  bulk_order_ready: { color: '#1e3a5f', bg: '#bfdbfe', label: 'Bulk Ready',      dot: '#2563eb' },
  approved:         { color: '#14532d', bg: '#bbf7d0', label: 'Approved',        dot: '#16a34a' },
  rejected:         { color: '#7f1d1d', bg: '#fee2e2', label: 'Rejected',        dot: '#ef4444' },
  rework:           { color: '#7c2d12', bg: '#ffedd5', label: 'Rework',          dot: '#f97316' },
  collected:        { color: '#134e4a', bg: '#ccfbf1', label: 'Collected',       dot: '#0d9488' },
};

const getMeta = (s: string) =>
  STATUS_META[s] || { color: '#374151', bg: '#f3f4f6', label: s, dot: '#6b7280' };

// ─── Process Steps Config ─────────────────────────────────────────────────────

const PROCESS_STEPS = [
  { key: 'dev_analysis', label: 'P1 - Dev Analysis',   color: '#6366f1', bg: '#ede9fe', borderColor: '#a5b4fc' },
  { key: 'yardage_moq',  label: 'P2 - Yardage & MOQ',  color: '#f59e0b', bg: '#fef3c7', borderColor: '#fcd34d' },
  { key: 'price_list',   label: 'P3 - Price List',     color: '#10b981', bg: '#d1fae5', borderColor: '#6ee7b7' },
];

// ─── Export Helpers ───────────────────────────────────────────────────────────

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

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportToPdf(sample: SampleRecord, report: Report) {
  const sm = getMeta(sample.status);
  const da = report.dev_analysis || {};
  const yardageMOQs: YardageMOQ[] = report.yardage_moq ? [report.yardage_moq] : [];
  const priceLists: PriceListEntry[] = report.price_list || [];

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
            <span style="opacity:.7;">${sample.customer_name || ''}</span>
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
            <div class="info-item"><div class="lbl">Quantity</div><div class="val">${sample.quantity_meters ?? '—'} m</div></div>
            <div class="info-item"><div class="lbl">Sample Type</div><div class="val">${sample.sample_type || '—'}</div></div>
            <div class="info-item"><div class="lbl">Created</div><div class="val">${fmtDate(sample.created_at || sample.request_date)}</div></div>
          </div>
          ${sample.customer_comments
            ? `<hr class="divider"><div class="info-item"><div class="lbl">Customer Comments</div><div class="val" style="font-weight:400; color:#475569;">${sample.customer_comments}</div></div>`
            : ''}
        </div>
      </div>

      <!-- P1: DEV ANALYSIS -->
      <div class="section">
        <div class="section-header"><span class="icon">🔬</span><h2>Development Analysis</h2><span class="proc">Process 1</span></div>
        <div class="section-body">
          ${!report.dev_analysis
            ? '<div class="empty-state">No development analysis has been saved for this request.</div>'
            : `<div class="info-grid">
                <div class="info-item"><div class="lbl">Style Number</div><div class="val">${fmt(da.style_number)}</div></div>
                <div class="info-item"><div class="lbl">Construction</div><div class="val">${fmt(da.construction)}</div></div>
                <div class="info-item"><div class="lbl">Blend</div><div class="val">${fmt(da.blend)}</div></div>
                <div class="info-item"><div class="lbl">GSM</div><div class="val">${fmt(da.gsm)}</div></div>
                <div class="info-item"><div class="lbl">Weave Type</div><div class="val">${fmt(da.weave_type)}</div></div>
                <div class="info-item"><div class="lbl">Analyzed By</div><div class="val">${fmt(da.analyzed_by)}</div></div>
              </div>
              ${da.remarks ? `<hr class="divider"><div class="info-item"><div class="lbl">Remarks</div><div class="val" style="font-weight:400; color:#475569;">${da.remarks}</div></div>` : ''}`
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
                      <td>${fmtCurrency(p.price_per_meter, p.currency)}</td>
                      <td>${fmt(p.discount_percent, '%')}</td>
                      <td>${fmtCurrency(p.total_price, p.currency)}</td>
                      <td class="green">${fmtCurrency(p.final_price, p.currency)}</td>
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
        <div>Report: ${sample.request_code} · ${sample.customer_name || ''}</div>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.focus(), 400);
}

// ─── Word Export ──────────────────────────────────────────────────────────────

function exportToWord(sample: SampleRecord, report: Report) {
  const sm = getMeta(sample.status);
  const da = report.dev_analysis || {};
  const yardageMOQs: YardageMOQ[] = report.yardage_moq ? [report.yardage_moq] : [];
  const priceLists: PriceListEntry[] = report.price_list || [];

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
         <b>Status:</b> ${sm.label} &nbsp;|&nbsp;
         <b>Generated:</b> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>

      <h2>&#x1F4CB; Sample Request Details</h2>
      <table>
        <tr><td class="lbl">Customer</td><td class="val">${sample.customer_name || '—'}</td>
            <td class="lbl">Agent</td><td class="val">${sample.agent_name || '—'}</td></tr>
        <tr><td class="lbl">Fabric Code</td><td class="val">${sample.fabric_code || '—'}</td>
            <td class="lbl">Fabric Quality</td><td class="val">${sample.fabric_quality || '—'}</td></tr>
        <tr><td class="lbl">Color</td><td class="val">${sample.color || '—'}</td>
            <td class="lbl">Quantity</td><td class="val">${sample.quantity_meters ?? '—'} meters</td></tr>
        <tr><td class="lbl">Sample Type</td><td class="val">${sample.sample_type || '—'}</td>
            <td class="lbl">Status</td><td class="val">${sm.label}</td></tr>
        <tr><td class="lbl">Created</td><td class="val">${fmtDate(sample.created_at || sample.request_date)}</td>
            <td class="lbl">Comments</td><td class="val">${sample.customer_comments || '—'}</td></tr>
      </table>

      <h2>&#x1F52C; Process 1 — Development Analysis</h2>
      ${!report.dev_analysis ? '<p><i>No development analysis data saved.</i></p>' : `
        <table>
          <tr><td class="lbl">Style Number</td><td>${fmt(da.style_number)}</td>
              <td class="lbl">Construction</td><td>${fmt(da.construction)}</td></tr>
          <tr><td class="lbl">Blend</td><td>${fmt(da.blend)}</td>
              <td class="lbl">GSM</td><td>${fmt(da.gsm)}</td></tr>
          <tr><td class="lbl">Weave Type</td><td>${fmt(da.weave_type)}</td>
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
              <td>${p.list_type === 'bulk_order' ? 'Bulk' : 'Sample'}</td>
              <td>${fmt(p.min_quantity_meters)}</td>
              <td>${fmt(p.max_quantity_meters)}</td>
              <td>${fmt(p.price_per_meter)}</td>
              <td>${fmt(p.discount_percent, '%')}</td>
              <td>${fmtCurrency(p.total_price, p.currency)}</td>
              <td style="font-weight:bold; color:#16a34a;">${fmtCurrency(p.final_price, p.currency)}</td>
              <td>${fmt(p.currency)}</td>
              <td>${fmt(p.remarks)}</td>
            </tr>
          `).join('')}
        </table>
      `}

      <div class="footer">
        <p>This report was auto-generated from the Fabric Development Sample Request Pipeline.<br>
        Request: ${sample.request_code} &mdash; Customer: ${sample.customer_name || ''}</p>
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

// ─── Icon Components ──────────────────────────────────────────────────────────

const Icon = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  FileText: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  MessageSquare: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Send: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22,2 15,22 11,13 2,9" />
    </svg>
  ),
  Loader: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'cs-spin 1s linear infinite' }}>
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Check: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  FlaskConical: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 19.5A2 2 0 0 0 6.5 22h11a2 2 0 0 0 1.78-2.5l-5.069-9.077A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" /><path d="M7 16h10" />
    </svg>
  ),
  Calculator: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M8 18h.01M12 18h.01" />
    </svg>
  ),
  Tag: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  User: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientSamples() {
  const [samples, setSamples]             = useState<SampleRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [toasts, setToasts]               = useState<{ id: number; msg: string; type: string }[]>([]);
  const prevStatuses                      = useRef<Record<number, string>>({});

  const [reportRecord, setReportRecord]   = useState<SampleRecord | null>(null);
  const [report, setReport]               = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [chatOpen, setChatOpen]           = useState(false);
  const [chatSample, setChatSample]       = useState<SampleRecord | null>(null);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatLoading, setChatLoading]     = useState(false);
  const [botTyping, setBotTyping]         = useState(false);
  const [unread, setUnread]               = useState<Record<number, number>>({});
  const messagesEndRef                    = useRef<HTMLDivElement>(null);
  const pollRef                           = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const user       = getLoggedInUser();
  const customerId = user.customer_id;

  // ─── Toast ────────────────────────────────────────────────────────────────

  const pushToast = useCallback((msg: string, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  // ─── Load samples ─────────────────────────────────────────────────────────

  const loadSamples = useCallback(async (silent = false) => {
    if (!customerId) {
      if (!silent) setLoading(false);
      return;
    }
    try {
      const res = await getSampleRequests(customerId);
      const rows: SampleRecord[] = Array.isArray(res.data) ? res.data : [];
      setSamples(rows);

      if (Object.keys(prevStatuses.current).length > 0) {
        rows.forEach(r => {
          if (prevStatuses.current[r.id] && prevStatuses.current[r.id] !== r.status) {
            const meta = getMeta(r.status);
            pushToast(
              `Order ${r.request_code} → ${meta.label}`,
              r.status === 'rejected' ? 'error'
                : r.status === 'approved' || r.status === 'collected' ? 'success'
                : 'info'
            );
          }
        });
      }
      prevStatuses.current = Object.fromEntries(rows.map(r => [r.id, r.status]));
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, [pushToast, customerId]);

  useEffect(() => {
    loadSamples();
    pollRef.current = setInterval(() => loadSamples(true), 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSamples]);

  // ─── Report loader ────────────────────────────────────────────────────────

  const openReport = async (r: SampleRecord) => {
    setReportRecord(r);
    setReport(null);
    setReportLoading(true);
    try {
      const [da, ym, pl] = await Promise.allSettled([
        axios.get(`/dev-analysis?sample_request_id=${r.id}`),
        axios.get(`/yardage-moq?sample_request_id=${r.id}`),
        axios.get(`/price-lists?sample_request_id=${r.id}`),
      ]);
      setReport({
        dev_analysis: da.status === 'fulfilled' ? da.value.data?.[0] ?? null : null,
        yardage_moq:  ym.status === 'fulfilled' ? ym.value.data?.[0] ?? null : null,
        price_list:   pl.status === 'fulfilled' ? (Array.isArray(pl.value.data) ? pl.value.data : []) : [],
      });
    } catch { setReport({}); }
    finally { setReportLoading(false); }
  };

  // ─── Chat helpers ─────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (sampleId: number) => {
    try {
      const res = await axios.get(
        `/chat/messages?sample_request_id=${sampleId}&user_id=${user.id ?? ''}`
      );
      const msgs: ChatMessage[] = Array.isArray(res.data) ? res.data : [];
      setMessages(msgs);
      setUnread(prev => ({ ...prev, [sampleId]: 0 }));
    } catch { /* silent */ }
  }, [user.id]);

  const openChat = useCallback((r: SampleRecord) => {
    setChatSample(r);
    setChatOpen(true);
    loadMessages(r.id);
  }, [loadMessages]);

  useEffect(() => {
    if (chatOpen && chatSample) {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      chatPollRef.current = setInterval(() => loadMessages(chatSample.id), 5000);
    }
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [chatOpen, chatSample, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botTyping]);

  // ─── Send message ─────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!chatInput.trim() || !chatSample) return;
    const text = chatInput.trim();
    setChatInput('');
    const optimistic: ChatMessage = { sender: 'user', message: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setChatLoading(true);

    try {
      await axios.post('/chat/messages', {
        sample_request_id: chatSample.id,
        user_id: user.id ?? null,
        sender: 'user',
        message: text,
      });

      const histRes = await axios.get(
        `/chat/messages?sample_request_id=${chatSample.id}&user_id=${user.id ?? ''}`
      );
      const history: ChatMessage[] = Array.isArray(histRes.data) ? histRes.data : [];
      setMessages(history);

      const lastAdmin = [...history].reverse().find(m => m.sender === 'admin');
      const adminOnline = lastAdmin
        ? Date.now() - new Date(lastAdmin.created_at || 0).getTime() < 5 * 60 * 1000
        : false;

      if (!adminOnline) {
        setBotTyping(true);
        try {
          const sampleCtx = `
Sample ID: ${chatSample.id} | Code: ${chatSample.request_code}
Customer: ${user.name || 'Customer'} (ID: ${customerId})
Fabric: ${chatSample.fabric_code || 'N/A'} | Quality: ${chatSample.fabric_quality || 'N/A'}
Color: ${chatSample.color || 'N/A'} | Qty: ${chatSample.quantity_meters || 'N/A'} m
Status: ${getMeta(chatSample.status).label} | Type: ${chatSample.sample_type || 'N/A'}
Comments: ${chatSample.customer_comments || 'None'}`.trim();

          const botMsgs = history.slice(-10).map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.message,
          }));

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              system: `You are a support assistant for a textile ERP. Be concise and friendly.
Customer: ${user.name || 'Customer'} (Customer ID: ${customerId})
${sampleCtx}
Rules: Explain status. For delivery/price/corrections say you'll relay to admin. Don't invent info.`,
              messages: [...botMsgs, { role: 'user', content: text }],
            }),
          });

          const data = await response.json();
          const botReply =
            data.content?.find((c: any) => c.type === 'text')?.text ||
            "I'll relay this to our admin team shortly.";

          await axios.post('/chat/messages', {
            sample_request_id: chatSample.id,
            user_id: user.id ?? null,
            sender: 'bot',
            message: botReply,
          });
        } catch {
          await axios.post('/chat/messages', {
            sample_request_id: chatSample.id,
            user_id: user.id ?? null,
            sender: 'bot',
            message: 'Thank you for your message. Our admin team will respond shortly.',
          });
        } finally {
          setBotTyping(false);
          await loadMessages(chatSample.id);
        }
      }
    } catch {
      pushToast('Failed to send message. Please try again.', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  // ─── Filter ───────────────────────────────────────────────────────────────

  const filtered = samples.filter(s =>
    !search.trim() ||
    [s.request_code, s.fabric_type, s.fabric_code, s.description, s.status, s.customer_name]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()))
  );

  if (!loading && !customerId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8 }}>Session Error</div>
        <p>Unable to identify your customer account. Please log out and sign in again.</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <style>{`
        @keyframes cs-slideIn  { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes cs-spin     { to{transform:rotate(360deg)} }
        @keyframes cs-pulse    { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes cs-fadeUp   { from{opacity:0;transform:translateY(20px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }

        .cs-row:hover td { background:#f8faff!important; }
        .cs-search:focus { border-color:#6366f1!important;outline:none;box-shadow:0 0 0 3px rgba(99,102,241,.12); }
        .cs-close:hover { background:#f1f5f9!important; }
        .quick-btn:hover { background:#ede9fe!important;border-color:#a5b4fc!important;color:#4f46e5!important; }

        .cs-btn-report {
          display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;
          border:1.5px solid #a7f3d0;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);
          color:#065f46;font-size:12px;font-weight:700;cursor:pointer;
          transition:all 0.18s cubic-bezier(0.4,0,0.2,1);white-space:nowrap;
          letter-spacing:0.01em;box-shadow:0 1px 3px rgba(16,185,129,0.12),inset 0 1px 0 rgba(255,255,255,0.6);
          position:relative;overflow:hidden;font-family:inherit;
        }
        .cs-btn-report:hover{background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);border-color:#6ee7b7;color:#064e3b;transform:translateY(-1px);box-shadow:0 4px 10px rgba(16,185,129,0.22);}
        .cs-btn-report:active{transform:translateY(0);}

        .cs-btn-chat {
          display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;
          border:1.5px solid #93c5fd;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);
          color:#1d4ed8;font-size:12px;font-weight:700;cursor:pointer;
          transition:all 0.18s cubic-bezier(0.4,0,0.2,1);white-space:nowrap;
          letter-spacing:0.01em;box-shadow:0 1px 3px rgba(37,99,235,0.12),inset 0 1px 0 rgba(255,255,255,0.6);
          position:relative;overflow:hidden;font-family:inherit;
        }
        .cs-btn-chat:hover{background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);border-color:#60a5fa;color:#1e3a8a;transform:translateY(-1px);box-shadow:0 4px 10px rgba(37,99,235,0.22);}
        .cs-btn-chat:active{transform:translateY(0);}

        .process-step { transition: all .2s; }
        .process-step.has-data:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.1) !important; }
        .rp-section { transition: box-shadow .15s; }
        .rp-section:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07) !important; }
        .qc-row:nth-child(even) td { background: #fafbff; }
        .btn-dl-pdf { transition: all .18s; }
        .btn-dl-pdf:hover { background: #1d4ed8 !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.35) !important; }
        .btn-dl-word { transition: all .18s; }
        .btn-dl-word:hover { background: #15803d !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(22,163,74,0.35) !important; }
        .btn-dl-chat { transition: all .18s; }
        .btn-dl-chat:hover { background: #4f46e5 !important; transform: translateY(-1px); }

        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}

        @media(max-width:768px){
          .cs-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
          .cs-table-inner{min-width:780px;}
          .cs-header{flex-direction:column!important;align-items:flex-start!important;}
          .cs-summary-row{flex-wrap:wrap;}
          .cs-chat-overlay{left:12px!important;right:12px!important;width:auto!important;}
          .rp-steps{flex-wrap:wrap!important;}
          .rp-details-grid{grid-template-columns:1fr 1fr!important;}
          .rp-qual-grid{grid-template-columns:1fr 1fr!important;}
        }
      `}</style>

      {/* Toasts */}
      <div style={S.toastStack}>
        {toasts.map(t => (
          <div key={t.id} style={{ ...S.toast, ...(t.type === 'success' ? S.toastSuccess : t.type === 'error' ? S.toastError : S.toastInfo) }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{t.msg}</span>
            <button style={S.toastClose} onClick={() => setToasts(tt => tt.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div style={S.header} className="cs-header">
        <div>
          <div style={S.headerLabel}>CLIENT PORTAL</div>
          <h2 style={S.title}>My Sample Requests</h2>
          <p style={S.subtitle}>
            <span style={S.userChip}>
              <Icon.User />
              {user.name || user.email || 'Customer'}
            </span>
            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            <span style={{ ...S.idChip }}>ID: {customerId}</span>
            <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            Track fabric samples · live updates every 10s
          </p>
        </div>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}><Icon.Search /></span>
          <input className="cs-search" style={S.search} placeholder="Search orders..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      {!loading && (
        <div style={S.summaryRow} className="cs-summary-row">
          {[
            { label: 'Total',    value: samples.length,                                        color: '#6366f1', bg: '#ede9fe', border: '#c4b5fd' },
            { label: 'Pending',  value: samples.filter(s => s.status === 'pending').length,    color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
            { label: 'Approved', value: samples.filter(s => s.status === 'approved').length,   color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
            { label: 'Rejected', value: samples.filter(s => s.status === 'rejected').length,   color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
          ].map(c => (
            <div key={c.label} style={{ ...S.summaryCard, background: c.bg, borderColor: c.border }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.color, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TABLE ── */}
      {loading ? (
        <div style={S.loadBox}>
          <div style={{ display: 'flex', justifyContent: 'center', color: '#6366f1' }}><Icon.Loader /></div>
          <p style={{ color: '#94a3b8', marginTop: 12, fontSize: 14 }}>Loading your requests...</p>
        </div>
      ) : (
        <div style={S.tableCard}>
          <div className="cs-table-wrap">
            <table style={S.table} className="cs-table-inner">
              <thead>
                <tr>
                  {['#', 'Request Code', 'Fabric / Quality', 'Color', 'Qty (m)', 'Date', 'Status', 'Report', 'Support'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={S.empty}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                      <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>No sample requests found</div>
                      <div style={{ fontSize: 13, color: '#94a3b8' }}>
                        {search ? 'Try a different search term' : 'Your admin will create sample requests for your account'}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((s, i) => {
                  const meta = getMeta(s.status);
                  return (
                    <tr key={s.id} className="cs-row">
                      <td style={{ ...S.td, color: '#94a3b8', width: 40, fontWeight: 500 }}>{i + 1}</td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>{s.request_code}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{user.name}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>{s.fabric_code || s.fabric_type || '—'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.fabric_quality || '—'}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: s.color?.toLowerCase() || '#e2e8f0', border: '1.5px solid rgba(0,0,0,0.08)', flexShrink: 0 }} />
                          <span style={{ fontSize: 13 }}>{s.color || '—'}</span>
                        </div>
                      </td>
                      <td style={{ ...S.td, fontWeight: 700, color: '#1e293b' }}>
                        {s.quantity_meters ?? '—'} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>m</span>
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>
                        {(s.created_at || s.request_date)?.slice(0, 10) || '—'}
                      </td>
                      <td style={S.td}>
                        <span style={{ ...S.statusBadge, color: meta.color, background: meta.bg }}>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: meta.dot, marginRight: 5 }} />
                          {meta.label}
                        </span>
                      </td>
                      <td style={S.td}>
                        <button className="cs-btn-report" onClick={() => openReport(s)}>
                          <Icon.FileText />
                          Report
                        </button>
                      </td>
                      <td style={S.td}>
                        <button className="cs-btn-chat" style={{ position: 'relative' }} onClick={() => openChat(s)}>
                          <Icon.MessageSquare />
                          Chat
                          {(unread[s.id] || 0) > 0 && (
                            <span style={S.unreadBadge}>{unread[s.id]}</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ REPORT MODAL ══════════════ */}
      {reportRecord && (
        <div style={S.overlay} onClick={() => setReportRecord(null)}>
          <div style={RP.modal} onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div style={RP.modalHead}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>
                  SAMPLE PROCESS REPORT
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={RP.headIcon}>🧵</div>
                  <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{reportRecord.request_code}</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...S.statusBadge, color: getMeta(reportRecord.status).color, background: getMeta(reportRecord.status).bg, fontSize: 11 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: getMeta(reportRecord.status).dot, marginRight: 5 }} />
                    {getMeta(reportRecord.status).label}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{user.name}</span>
                  {reportRecord.agent_name && <><span style={{ color: '#e2e8f0' }}>·</span><span style={{ fontSize: 12, color: '#64748b' }}>{reportRecord.agent_name}</span></>}
                  <span style={{ color: '#e2e8f0' }}>·</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {(reportRecord.created_at || reportRecord.request_date)?.slice(0, 10) || '—'}
                  </span>
                </div>
              </div>
              <button className="cs-close" style={{ ...S.closeBtn, flexShrink: 0, alignSelf: 'flex-start' }} onClick={() => setReportRecord(null)}>
                <Icon.X />
              </button>
            </div>

            {/* Process Steps Bar */}
            <div style={RP.stepsBar} className="rp-steps">
              {PROCESS_STEPS.map(step => {
                const isPrice = step.key === 'price_list';
                const hasData = !reportLoading && (
                  isPrice ? (report?.price_list?.length ?? 0) > 0 : !!(report as any)?.[step.key]
                );
                const count = isPrice ? (report?.price_list?.length ?? 0) : hasData ? 1 : 0;
                return (
                  <div key={step.key} className={`process-step${hasData ? ' has-data' : ''}`}
                    style={{ ...RP.stepPill, border: `1.5px solid ${hasData ? step.borderColor : '#e2e8f0'}`, background: hasData ? step.bg : '#f8fafc' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: hasData ? step.color : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, boxShadow: hasData ? `0 2px 8px ${step.color}50` : undefined }}>
                      {step.key === 'dev_analysis' && <span style={{ filter: hasData ? 'brightness(10)' : 'none' }}>🔬</span>}
                      {step.key === 'yardage_moq'  && <span style={{ filter: hasData ? 'brightness(0.1)' : 'none' }}>🧮</span>}
                      {step.key === 'price_list'   && <span style={{ filter: hasData ? 'brightness(0.1)' : 'none' }}>💰</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: hasData ? step.color : '#94a3b8', whiteSpace: 'nowrap' }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: hasData ? step.color : '#94a3b8', opacity: 0.75 }}>
                        {reportLoading ? 'Loading…' : hasData ? `${count} record${count !== 1 ? 's' : ''}` : 'No data'}
                      </div>
                    </div>
                    {hasData && (
                      <div style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: step.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon.Check />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {reportLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ color: '#6366f1' }}><Icon.Loader /></div>
                <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Loading report data...</p>
              </div>
            ) : (
              <div style={RP.body}>

                {/* ── Sample Request Details ── */}
                <div style={RP.section} className="rp-section">
                  <div style={RP.secHead}>
                    <div style={{ ...RP.secIcon, background: '#f1f5f9', color: '#475569' }}><Icon.FileText /></div>
                    <span style={RP.secTitle}>Sample Request Details</span>
                  </div>
                  <div style={RP.detailsGrid} className="rp-details-grid">
                    {[
                      { label: 'FABRIC CODE',    value: reportRecord.fabric_code || '—' },
                      { label: 'FABRIC QUALITY', value: reportRecord.fabric_quality || '—' },
                      { label: 'COLOR',          value: reportRecord.color || '—' },
                      { label: 'QUANTITY',       value: reportRecord.quantity_meters ? `${reportRecord.quantity_meters}.00 m` : '—' },
                      { label: 'SAMPLE TYPE',    value: reportRecord.sample_type || '—' },
                      { label: 'CREATED',        value: (reportRecord.created_at || reportRecord.request_date)?.slice(0, 10) || '—' },
                    ].map(f => (
                      <div key={f.label} style={RP.fieldCell}>
                        <div style={RP.fieldLabel}>{f.label}</div>
                        <div style={RP.fieldValue}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Development Analysis (Process 1) ── */}
                <div style={RP.section} className="rp-section">
                  <div style={RP.secHead}>
                    <div style={{ ...RP.secIcon, background: '#ede9fe', color: '#6366f1' }}><Icon.FlaskConical /></div>
                    <span style={RP.secTitle}>Development Analysis</span>
                    <span style={{ ...RP.processTag, background: '#ede9fe', color: '#6366f1' }}>Process 1</span>
                    <span style={{ ...RP.countBadge, background: report?.dev_analysis ? '#ede9fe' : '#f1f5f9', color: report?.dev_analysis ? '#6366f1' : '#94a3b8' }}>
                      {report?.dev_analysis ? '1 record' : '0 records'}
                    </span>
                  </div>
                  {report?.dev_analysis ? (
                    <div style={RP.qualGrid} className="rp-qual-grid">
                      {[
                        { label: 'STYLE NUMBER',  value: report.dev_analysis.style_number  || '—' },
                        { label: 'CONSTRUCTION',  value: report.dev_analysis.construction  || '—' },
                        { label: 'BLEND',         value: report.dev_analysis.blend         || '—' },
                        { label: 'GSM',           value: report.dev_analysis.gsm != null ? String(report.dev_analysis.gsm) : '—' },
                        { label: 'WEAVE TYPE',    value: report.dev_analysis.weave_type    || '—' },
                        { label: 'ANALYZED BY',   value: report.dev_analysis.analyzed_by   || '—' },
                        { label: 'ANALYSIS DATE', value: report.dev_analysis.analysis_date?.slice(0, 10) || '—' },
                      ].map(f => (
                        <div key={f.label} style={RP.fieldCell}>
                          <div style={RP.fieldLabel}>{f.label}</div>
                          <div style={RP.fieldValue}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={RP.emptyBox}>
                      <span style={{ fontSize: 28 }}>📫</span>
                      <span>No development analysis data has been saved for this request.</span>
                    </div>
                  )}
                </div>

                {/* ── Yardage & MOQ (Process 2) ── */}
                <div style={RP.section} className="rp-section">
                  <div style={RP.secHead}>
                    <div style={{ ...RP.secIcon, background: '#fef3c7', color: '#f59e0b' }}><Icon.Calculator /></div>
                    <span style={RP.secTitle}>Yardage & MOQ</span>
                    <span style={{ ...RP.processTag, background: '#fef3c7', color: '#d97706' }}>Process 2</span>
                    <span style={{ ...RP.countBadge, background: report?.yardage_moq ? '#fef3c7' : '#f1f5f9', color: report?.yardage_moq ? '#d97706' : '#94a3b8' }}>
                      {report?.yardage_moq ? '1 record' : '0 records'}
                    </span>
                  </div>
                  {report?.yardage_moq ? (
                    <div style={RP.qualGrid} className="rp-qual-grid">
                      {[
                        { label: 'FABRIC CODE',  value: report.yardage_moq.fabric_code  || '—' },
                        { label: 'ORDER TYPE',   value: report.yardage_moq.order_type   || '—' },
                        { label: 'MOQ (METERS)', value: report.yardage_moq.moq_meters   != null ? `${report.yardage_moq.moq_meters} m` : '—' },
                        { label: 'MOQ (YARDS)',  value: report.yardage_moq.moq_yards    != null ? `${report.yardage_moq.moq_yards} yd` : '—' },
                        { label: 'PRICE / M',    value: report.yardage_moq.price_per_meter != null ? `${report.yardage_moq.currency || 'INR'} ${report.yardage_moq.price_per_meter}` : '—' },
                        { label: 'PRICE / YD',   value: report.yardage_moq.price_per_yard  != null ? `${report.yardage_moq.currency || 'INR'} ${report.yardage_moq.price_per_yard}` : '—' },
                        { label: 'CURRENCY',     value: report.yardage_moq.currency     || '—' },
                        { label: 'VALID FROM',   value: report.yardage_moq.valid_from?.slice(0, 10)  || '—' },
                        { label: 'VALID UNTIL',  value: report.yardage_moq.valid_until?.slice(0, 10) || '—' },
                      ].map(f => (
                        <div key={f.label} style={RP.fieldCell}>
                          <div style={RP.fieldLabel}>{f.label}</div>
                          <div style={RP.fieldValue}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={RP.emptyBox}>
                      <span style={{ fontSize: 28 }}>📫</span>
                      <span>No yardage &amp; MOQ data has been saved for this request.</span>
                    </div>
                  )}
                </div>

                {/* ── Price List (Process 3) ── */}
                <div style={RP.section} className="rp-section">
                  <div style={RP.secHead}>
                    <div style={{ ...RP.secIcon, background: '#d1fae5', color: '#10b981' }}><Icon.Tag /></div>
                    <span style={RP.secTitle}>Price List</span>
                    <span style={{ ...RP.processTag, background: '#d1fae5', color: '#059669' }}>Process 3</span>
                    <span style={{ ...RP.countBadge, background: (report?.price_list?.length ?? 0) > 0 ? '#d1fae5' : '#f1f5f9', color: (report?.price_list?.length ?? 0) > 0 ? '#059669' : '#94a3b8' }}>
                      {report?.price_list?.length ?? 0} records
                    </span>
                  </div>
                  {(report?.price_list?.length ?? 0) > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={RP.table}>
                        <thead>
                          <tr>{['TYPE', 'FABRIC CODE', 'COLOR', 'MIN QTY', 'MAX QTY', 'PRICE/M', 'TOTAL', 'DISCOUNT', 'FINAL PRICE', 'REMARKS'].map(h => <th key={h} style={RP.th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {report!.price_list!.map((p, i) => (
                            <tr key={i} className="qc-row">
                              <td style={RP.td}>
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p.list_type === 'bulk_order' ? '#dbeafe' : '#d1fae5', color: p.list_type === 'bulk_order' ? '#1d4ed8' : '#065f46' }}>
                                  {p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}
                                </span>
                              </td>
                              <td style={RP.td}>{p.fabric_code || '—'}</td>
                              <td style={RP.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {p.color && <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color.toLowerCase(), border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />}
                                  {p.color || '—'}
                                </div>
                              </td>
                              <td style={RP.td}>{p.min_quantity_meters != null ? `${p.min_quantity_meters} m` : '—'}</td>
                              <td style={RP.td}>{p.max_quantity_meters != null ? `${p.max_quantity_meters} m` : '—'}</td>
                              <td style={RP.td}>{p.currency} {p.price_per_meter}</td>
                              <td style={RP.td}>{p.currency} {p.total_price != null ? Number(p.total_price).toFixed(2) : '—'}</td>
                              <td style={RP.td}>{p.discount_percent != null ? `${p.discount_percent}%` : '0%'}</td>
                              <td style={{ ...RP.td, fontWeight: 800, color: '#16a34a', fontSize: 14 }}>{p.currency} {p.final_price != null ? Number(p.final_price).toFixed(2) : '—'}</td>
                              <td style={{ ...RP.td, color: '#64748b', fontSize: 12 }}>{p.remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={RP.emptyBox}>
                      <span style={{ fontSize: 28 }}>📫</span>
                      <span>No price list entries have been saved for this request.</span>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── Footer with working export buttons ── */}
            <div style={RP.footer}>
              <span style={{ fontSize: 12, color: '#64748b', flex: 1, whiteSpace: 'nowrap' as const }}>
                Download full process report for <b>{reportRecord.request_code}</b>
              </span>
              <button
                className="btn-dl-pdf"
                style={RP.btnPdf}
                disabled={reportLoading || !report}
                onClick={() => {
                  if (report) exportToPdf(reportRecord, report);
                }}
              >
                <Icon.Download />Download PDF
              </button>
              <button
                className="btn-dl-word"
                style={RP.btnWord}
                disabled={reportLoading || !report}
                onClick={() => {
                  if (report) exportToWord(reportRecord, report);
                }}
              >
                <Icon.Download />Download Word
              </button>
              <button
                className="btn-dl-chat"
                style={RP.btnChat}
                onClick={() => { setReportRecord(null); openChat(reportRecord); }}
              >
                <FaRobot style={{ fontSize: 13 }} />Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ CHAT WIDGET ══════════════ */}
      {chatOpen && chatSample && (
        <div style={S.chatOverlay} className="cs-chat-overlay">
          <div style={S.chatBox}>
            <div style={S.chatHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={S.chatAvatar}>🧵</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Support Chat</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{chatSample.request_code} · {getMeta(chatSample.status).label}</div>
                </div>
              </div>
              <button className="cs-close" style={{ ...S.closeBtn, width: 32, height: 32 }} onClick={() => setChatOpen(false)}><Icon.X /></button>
            </div>
            <div style={S.contextBanner}>
              <span style={{ fontSize: 12, color: '#4f46e5' }}>
                📌 <b>{chatSample.request_code}</b> — {chatSample.fabric_code || chatSample.fabric_type} · {getMeta(chatSample.status).label}
              </span>
            </div>
            <div style={S.messages}>
              {messages.length === 0 && (
                <div style={S.emptyChat}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                  <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Hello, {user.name || 'there'}!</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Ask about your order status, request corrections, or get help.</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={m.id ?? i} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                  {m.sender !== 'user' && (
                    <div style={{ ...S.msgAvatar, background: m.sender === 'bot' ? '#ede9fe' : '#dbeafe' }}>
                      {m.sender === 'bot' ? '🤖' : '👨‍💼'}
                    </div>
                  )}
                  <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: m.sender === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.sender === 'user' ? '#6366f1' : m.sender === 'bot' ? '#f5f3ff' : '#f0f9ff', color: m.sender === 'user' ? '#fff' : '#1e293b', fontSize: 14, lineHeight: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    {m.sender !== 'user' && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: m.sender === 'bot' ? '#7c3aed' : '#2563eb', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                        {m.sender === 'bot' ? 'AI Assistant' : 'Admin'}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' as const }}>
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                  {m.sender === 'user' && (
                    <div style={{ ...S.msgAvatar, background: '#e0e7ff', marginLeft: 6, marginRight: 0 }}>
                      {(user.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
              {botTyping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ ...S.msgAvatar, background: '#ede9fe' }}>🤖</div>
                  <div style={{ background: '#f5f3ff', borderRadius: '14px 14px 14px 4px', padding: '12px 16px', fontSize: 13, color: '#7c3aed' }}>
                    <span style={{ animation: 'cs-pulse 1.2s infinite' }}>● ● ●</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div style={S.quickReplies}>
              {['What is the current status?', 'When will it be delivered?', 'I need a correction', 'Can I see price details?'].map(q => (
                <button key={q} className="quick-btn" style={S.quickBtn} onClick={() => setChatInput(q)}>{q}</button>
              ))}
            </div>
            <div style={S.chatInputRow}>
              <input style={S.chatInput} placeholder="Type your message..."
                value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={chatLoading} />
              <button style={{ ...S.sendBtn, opacity: chatLoading || !chatInput.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={sendMessage} disabled={chatLoading || !chatInput.trim()}>
                <Icon.Send /> {chatLoading ? '…' : 'Send'}
              </button>
            </div>
            <div style={{ padding: '6px 16px 10px', fontSize: 11, color: '#94a3b8', textAlign: 'center' as const }}>
              Powered by AI · Responses saved for your records
            </div>
          </div>
        </div>
      )}

      {!chatOpen && (
        <button style={S.floatChat}
          onClick={() => { if (samples.length > 0) openChat(samples[0]); else pushToast('No orders found.', 'info'); }}>
          💬
          {Object.values(unread).reduce((a, b) => a + b, 0) > 0 && (
            <span style={S.floatBadge}>{Object.values(unread).reduce((a, b) => a + b, 0)}</span>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Report Modal Styles ──────────────────────────────────────────────────────

const RP: Record<string, React.CSSProperties> = {
  modal:       { background: '#fff', width: '100%', maxWidth: 720, borderRadius: 16, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', animation: 'cs-fadeUp .25s cubic-bezier(0.34,1.56,0.64,1)', display: 'flex', flexDirection: 'column' },
  modalHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 5 },
  headIcon:    { width: 38, height: 38, borderRadius: 10, background: '#ede9fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginRight: 2 },
  stepsBar:    { display: 'flex', gap: 10, padding: '14px 24px', background: '#fafbff', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' },
  stepPill:    { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, flex: 1, minWidth: 148, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'default' },
  body:        { padding: '16px 24px 8px', overflowY: 'auto' },
  section:     { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  secHead:     { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' },
  secIcon:     { width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  secTitle:    { fontSize: 14, fontWeight: 800, color: '#0f172a' },
  processTag:  { marginLeft: 'auto', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 },
  countBadge:  { marginLeft: 6, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 },
  detailsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' },
  qualGrid:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' },
  fieldCell:   { padding: '10px 16px', borderBottom: '1px solid #f8fafc', display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel:  { fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  fieldValue:  { fontSize: 13, fontWeight: 600, color: '#0f172a' },
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  th:          { padding: '9px 14px', background: '#1e3a5f', color: '#fff', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, whiteSpace: 'nowrap' as const },
  td:          { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#374151' },
  emptyBox:    { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 10, padding: '28px 16px', color: '#94a3b8', fontSize: 13 },
  footer:      { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', position: 'sticky', bottom: 0, zIndex: 5, flexWrap: 'wrap' as const },
  btnPdf:      { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.25)', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' },
  btnWord:     { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.25)', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' },
  btnChat:     { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.25)', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' },
};

// ─── Page-level Styles ────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:          { padding: 28, background: '#f1f5f9', minHeight: '100vh', fontFamily: "'Inter', sans-serif", position: 'relative' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' },
  headerLabel:   { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 },
  title:         { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  subtitle:      { fontSize: 13, color: '#6b7280', marginTop: 4, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userChip:      { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  idChip:        { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  searchWrap:    { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon:    { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' },
  search:        { padding: '9px 14px 9px 32px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', width: 220, background: '#fff', transition: 'border .2s' },
  summaryRow:    { display: 'flex', gap: 12, marginBottom: 20 },
  summaryCard:   { borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 100, border: '1.5px solid transparent' },
  tableCard:     { background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #e2e8f0' },
  table:         { width: '100%', borderCollapse: 'collapse' },
  th:            { background: '#2563eb', padding: '12px 14px', textAlign: 'left', fontSize: 12, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' },
  td:            { padding: '13px 14px', fontSize: 14, color: '#374151', borderTop: '1px solid #f3f4f6' },
  statusBadge:   { display: 'inline-flex', alignItems: 'center', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  empty:         { padding: 50, textAlign: 'center', color: '#9ca3af', fontSize: 14 },
  loadBox:       { textAlign: 'center', padding: 60 },
  unreadBadge:   { position: 'absolute', top: -5, right: -5, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
  toastStack:    { position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 },
  toast:         { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', animation: 'cs-slideIn .3s ease', border: '1px solid transparent' },
  toastSuccess:  { background: '#f0fdf4', borderColor: '#86efac', color: '#166534' },
  toastError:    { background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' },
  toastInfo:     { background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' },
  toastClose:    { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'inherit', padding: 0, opacity: 0.6 },
  overlay:       { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 1000, backdropFilter: 'blur(4px)' },
  closeBtn:      { border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s', flexShrink: 0, color: '#374151' },
  chatOverlay:   { position: 'fixed', bottom: 24, right: 24, zIndex: 2000, width: 400, maxWidth: 'calc(100vw - 48px)' },
  chatBox:       { background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden', animation: 'cs-slideIn .25s ease', border: '1px solid #e2e8f0' },
  chatHead:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' },
  chatAvatar:    { width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  contextBanner: { padding: '8px 16px', background: '#eff6ff', borderBottom: '1px solid #dbeafe' },
  messages:      { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', minHeight: 200, maxHeight: 340 },
  emptyChat:     { textAlign: 'center', padding: '20px 10px', color: '#64748b' },
  msgAvatar:     { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, alignSelf: 'flex-end', marginRight: 6 },
  quickReplies:  { padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9' },
  quickBtn:      { padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, color: '#4f46e5', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' },
  chatInputRow:  { display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid #f1f5f9' },
  chatInput:     { flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border .2s', fontFamily: 'inherit' },
  sendBtn:       { padding: '0 16px', height: 42, borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'all .15s', whiteSpace: 'nowrap' },
  floatChat:     { position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%', background: '#6366f1', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', boxShadow: '0 8px 24px rgba(99,102,241,.5)', zIndex: 1999, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' },
  floatBadge:    { position: 'absolute', top: 0, right: 0, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
};