import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../api/axios';
import SampleReportModal from './SampleReportModal';
import {
  getSampleRequests,
  deleteSampleRequest,
  saveDevAnalysis,
  saveYardageMOQ,
  savePriceList,
} from '../../api/services';
import { useNotification } from './NotificationContext';

// ─────────────────────────────────────────────
// PROFESSIONAL SVG ICON COMPONENTS
// ─────────────────────────────────────────────

const Icon = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Plus: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9"/>
    </svg>
  ),
  Microscope: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/>
      <path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/>
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>
    </svg>
  ),
  FlaskConical: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 18.5A2 2 0 0 0 6.5 21.5h11a2 2 0 0 0 1.78-2.904l-5.069-8.077A2 2 0 0 1 14 9.527V2"/>
      <path d="M8.5 2h7"/><path d="M7 16h10"/>
    </svg>
  ),
  Ruler: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/>
      <path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/>
      <path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>
    </svg>
  ),
  Calculator: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2"/>
      <line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/>
      <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  ),
  Tag: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/>
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  MessageSquare: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Bell: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Edit: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  FileText: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  X: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15,18 9,12 15,6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,18 15,12 9,6"/>
    </svg>
  ),
  Send: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
    </svg>
  ),
  AlertCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Package: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Image: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21,15 16,10 5,21"/>
    </svg>
  ),
  Fabric: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
  Loader: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
    </svg>
  ),
  RefreshCw: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  User: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  MoreVertical: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
    </svg>
  ),
  ShoppingCart: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  ClipboardList: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
    </svg>
  ),
  TrendingUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Truck: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface SampleRecord {
  id: number;
  request_code: string;
  customer_name: string;
  customer_id?: string;
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

interface CustomerMaster {
  id: number;
  customer_name: string;
  customer_id?: string;
  email?: string;
  contact_no?: string;
  agent?: string;
  district?: string;
  state?: string;
  status?: string;
}

interface AgentMaster {
  id: number;
  agent_name: string;
  agent_code?: string;
  contact_no?: string;
  email?: string;
  district?: string;
  state?: string;
  status?: string;
}

interface FabricMaster {
  id: number;
  fabric_code?: string;
  fabric_quality?: string;
  body_weave_pattern?: string;
  weave_pattern?: string;
  pattern?: string;
}

interface DevAnalysisForm {
  style_number: string;
  construction: string;
  blend: string;
  gsm: string;
  weave_type: string;
  analyzed_by: string;
  analysis_date: string;
  remarks: string;
}

interface YardageMOQ {
  order_type: string;
  moq_meters: string;
  moq_yards: number;
  price_per_meter: string;
  price_per_yard: number;
  currency: string;
  valid_from: string;
  valid_until: string;
}

interface PriceListEntry {
  list_type: string;
  min_quantity_meters: string;
  max_quantity_meters: string;
  price_per_meter: string;
  discount_percent: string;
  total_price: number;
  final_price: number;
  currency: string;
  remarks: string;
}

interface ChatMessage {
  id?: number;
  sender: 'user' | 'admin' | 'bot';
  message: string;
  created_at?: string;
  is_read?: boolean;
}

interface BellNotification {
  id: string;
  sample_request_id: number;
  request_code: string;
  customer_name: string;
  message: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  is_read: boolean;
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const BASE_URL = 'http://localhost:5000';
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const PROCESS_STEPS = [
  { id: 1, key: 'dev_analysis', label: 'Development Analysis', IconEl: Icon.FlaskConical, color: '#6366f1', bg: '#eef2ff' },
  { id: 2, key: 'yardage_moq',  label: 'Yardage & MOQ',        IconEl: Icon.Calculator,   color: '#f59e0b', bg: '#fef3c7' },
  { id: 3, key: 'price_list',   label: 'Price List',            IconEl: Icon.Tag,           color: '#10b981', bg: '#d1fae5' },
  { id: 4, key: 'chat',         label: 'Chat',                  IconEl: Icon.MessageSquare, color: '#8b5cf6', bg: '#ede9fe' },
];

const EDIT_TABS = [
  { id: 0, label: 'Request Info',         key: 'request',      IconEl: Icon.FileText },
  { id: 1, label: 'Development Analysis', key: 'dev_analysis', IconEl: Icon.FlaskConical },
  { id: 2, label: 'Yardage & MOQ',        key: 'yardage_moq',  IconEl: Icon.Calculator },
  { id: 3, label: 'Price List',           key: 'price_list',   IconEl: Icon.Tag },
  { id: 4, label: 'Chat',                 key: 'chat',         IconEl: Icon.MessageSquare },
];

const STATUS_META: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  pending:          { color: '#92400e', bg: '#fef3c7', dot: '#f59e0b', label: 'Pending' },
  quality_check:    { color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6', label: 'Quality Check' },
  yardage_pricing:  { color: '#7c3aed', bg: '#ede9fe', dot: '#8b5cf6', label: 'Yardage Pricing' },
  price_listed:     { color: '#065f46', bg: '#d1fae5', dot: '#10b981', label: 'Price Listed' },
  bulk_order_ready: { color: '#1e3a5f', bg: '#bfdbfe', dot: '#60a5fa', label: 'Bulk Ready' },
  approved:         { color: '#14532d', bg: '#bbf7d0', dot: '#22c55e', label: 'Approved' },
  rejected:         { color: '#7f1d1d', bg: '#fee2e2', dot: '#ef4444', label: 'Rejected' },
  rework:           { color: '#7c2d12', bg: '#ffedd5', dot: '#f97316', label: 'Rework' },
  collected:        { color: '#134e4a', bg: '#ccfbf1', dot: '#14b8a6', label: 'Collected' },
};

const emptyForm = {
  request_code: '', customer_name: '', customer_id: '', agent_name: '',
  sample_type: 'whatsapp', fabric_code: '', fabric_quality: '',
  color: '', quantity_meters: '', customer_comments: '', status: 'pending',
};

const emptyDevAnalysis: DevAnalysisForm = {
  style_number: '', construction: '', blend: '',
  gsm: '', weave_type: 'plain',
  analyzed_by: '', analysis_date: '', remarks: '',
};

const emptyYardage: YardageMOQ = {
  order_type: 'sample', moq_meters: '', moq_yards: 0,
  price_per_meter: '', price_per_yard: 0, currency: 'INR',
  valid_from: '', valid_until: '',
};

const emptyPrice: PriceListEntry = {
  list_type: 'sample_meter', min_quantity_meters: '', max_quantity_meters: '',
  price_per_meter: '', discount_percent: '0', total_price: 0,
  final_price: 0, currency: 'INR', remarks: '',
};

// ─────────────────────────────────────────────
// SHARED DROPDOWN STYLES
// ─────────────────────────────────────────────

const dropdownOverlayStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 3000,
  background: '#fff', border: '1.5px solid #6366f1', borderRadius: 10,
  boxShadow: '0 8px 32px rgba(99,102,241,0.15)', marginTop: 4,
  maxHeight: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const dropdownSearchBoxStyle: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid #f1f5f9', position: 'relative',
};

const dropdownSearchIconStyle: React.CSSProperties = {
  position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)',
  color: '#94a3b8', pointerEvents: 'none', display: 'flex',
};

// ─────────────────────────────────────────────
// CUSTOMER SELECT COMPONENT
// ─────────────────────────────────────────────

interface CustomerSelectProps {
  value: string;
  agentValue: string;
  onChange: (customerName: string, agentName: string, customerId: string) => void;
  customers: CustomerMaster[];
  loading: boolean;
  required?: boolean;
}

function CustomerSelect({ value, agentValue, onChange, customers, loading, required }: CustomerSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.customer_id   || '').toLowerCase().includes(q) ||
      (c.contact_no    || '').toLowerCase().includes(q) ||
      (c.email         || '').toLowerCase().includes(q) ||
      (c.district      || '').toLowerCase().includes(q)
    );
  });

  const selectedCustomer = customers.find(c => c.customer_name === value);

  const handleSelect = (c: CustomerMaster) => {
    onChange(c.customer_name, c.agent || '', c.customer_id || '');
    setSearch('');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          ...s.input,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none', minHeight: 42,
          borderColor: open ? '#6366f1' : '#d1d5db',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {loading ? (
          <span style={{ color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'flex' }}><Icon.Loader /></span>
            Loading customers…
          </span>
        ) : value ? (
          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
            {value}
            {selectedCustomer?.customer_id && (
              <span style={{ fontWeight: 400, color: '#6366f1', marginLeft: 6, fontSize: 12 }}>
                ({selectedCustomer.customer_id})
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Select customer…</span>
        )}
        <span style={{ color: '#94a3b8', display: 'flex', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginLeft: 8 }}>
          <Icon.ChevronDown />
        </span>
      </div>

      {open && (
        <div style={dropdownOverlayStyle}>
          <div style={dropdownSearchBoxStyle}>
            <span style={dropdownSearchIconStyle}><Icon.Search /></span>
            <input
              autoFocus
              style={{ ...s.input, paddingLeft: 30, fontSize: 13, border: 'none', background: '#f8fafc', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              placeholder="Search by name, ID, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {customers.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
                ⚠ No customers loaded.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No customer matching "{search}"
              </div>
            ) : (
              filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    background: c.customer_name === value ? '#eef2ff' : 'transparent',
                    borderLeft: c.customer_name === value ? '3px solid #6366f1' : '3px solid transparent',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (c.customer_name !== value) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (c.customer_name !== value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.customer_name}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                    {c.customer_id && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>{c.customer_id}</span>}
                    {c.contact_no  && <span style={{ fontSize: 11, color: '#94a3b8' }}>📞 {c.contact_no}</span>}
                    {c.agent       && <span style={{ fontSize: 11, color: '#64748b' }}>Agent: {c.agent}</span>}
                    {c.district    && <span style={{ fontSize: 11, color: '#64748b' }}>📍 {c.district}{c.state ? `, ${c.state}` : ''}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
          {value && (
            <div
              style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 600 }}
              onClick={() => { onChange('', '', ''); setOpen(false); setSearch(''); }}
            >
              ✕ Clear selection
            </div>
          )}
        </div>
      )}

      {required && (
        <input tabIndex={-1} style={{ opacity: 0, height: 0, position: 'absolute' }} value={value} required onChange={() => {}} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// AGENT SELECT COMPONENT
// ─────────────────────────────────────────────

interface AgentSelectProps {
  value: string;
  onChange: (name: string) => void;
  agents: AgentMaster[];
  loading: boolean;
}

function AgentSelect({ value, onChange, agents, loading }: AgentSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = agents.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.agent_name  || '').toLowerCase().includes(q) ||
      (a.agent_code  || '').toLowerCase().includes(q) ||
      (a.contact_no  || '').toLowerCase().includes(q) ||
      (a.email       || '').toLowerCase().includes(q) ||
      (a.district    || '').toLowerCase().includes(q)
    );
  });

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          ...s.input,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none', minHeight: 42,
          borderColor: open ? '#6366f1' : '#d1d5db',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {loading ? (
          <span style={{ color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'flex' }}><Icon.Loader /></span>
            Loading agents…
          </span>
        ) : value ? (
          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#6366f1', display: 'flex' }}><Icon.User /></span>
            {value}
          </span>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Select agent…</span>
        )}
        <span style={{ color: '#94a3b8', display: 'flex', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginLeft: 8 }}>
          <Icon.ChevronDown />
        </span>
      </div>

      {open && (
        <div style={dropdownOverlayStyle}>
          <div style={dropdownSearchBoxStyle}>
            <span style={dropdownSearchIconStyle}><Icon.Search /></span>
            <input
              autoFocus
              style={{ ...s.input, paddingLeft: 30, fontSize: 13, border: 'none', background: '#f8fafc', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              placeholder="Search by name, code, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {agents.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
                ⚠ No agents loaded.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No agent matching "{search}"
              </div>
            ) : (
              filtered.map(a => (
                <div
                  key={a.id}
                  onClick={() => { onChange(a.agent_name); setSearch(''); setOpen(false); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    background: a.agent_name === value ? '#eef2ff' : 'transparent',
                    borderLeft: a.agent_name === value ? '3px solid #6366f1' : '3px solid transparent',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (a.agent_name !== value) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (a.agent_name !== value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{a.agent_name}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                    {a.agent_code && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>#{a.agent_code}</span>}
                    {a.contact_no && <span style={{ fontSize: 11, color: '#94a3b8' }}>📞 {a.contact_no}</span>}
                    {a.district   && <span style={{ fontSize: 11, color: '#64748b' }}>📍 {a.district}{a.state ? `, ${a.state}` : ''}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
          {value && (
            <div
              style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 600 }}
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
            >
              ✕ Clear selection
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 3-DOT ROW MENU COMPONENT
// ─────────────────────────────────────────────

interface RowMenuProps {
  record: SampleRecord;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvertToOrder: () => void;
}

function RowMenu({ record, onReport, onEdit, onDelete, onConvertToOrder }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  };

  const items = [
    {
      label: 'View Report',
      icon: <Icon.FileText />,
      color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0',
      action: () => { onReport(); setOpen(false); },
    },
    {
      label: 'Edit Request',
      icon: <Icon.Edit />,
      color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd',
      action: () => { onEdit(); setOpen(false); },
    },
    { type: 'divider' as const },
    {
      label: 'Convert to Order',
      icon: <Icon.ShoppingCart />,
      color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd',
      bold: true, highlight: true,
      action: () => { onConvertToOrder(); setOpen(false); },
    },
    { type: 'divider' as const },
    {
      label: 'Delete',
      icon: <Icon.Trash />,
      color: '#b91c1c', bg: '#fff1f2', border: '#fca5a5',
      action: () => { onDelete(); setOpen(false); },
    },
  ];

  return (
    <>
      <button
        ref={btnRef}
        className="row-menu-btn"
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: '1.5px solid #e2e8f0',
          background: open ? '#f1f5f9' : '#fff',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748b', transition: 'all .15s',
        }}
        onClick={handleOpen}
        title="More actions"
      >
        <Icon.MoreVertical />
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            zIndex: 9999,
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            minWidth: 200,
            overflow: 'hidden',
            animation: 'menuSlideIn .15s ease',
          }}
        >
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid #f1f5f9',
            background: '#fafbff',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
              Actions
            </div>
            <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginTop: 1 }}>
              {record.request_code}
            </div>
          </div>

          {items.map((item, i) => {
            if (item.type === 'divider') {
              return <div key={i} style={{ height: 1, background: '#f1f5f9', margin: '2px 0' }} />;
            }
            return (
              <div
                key={i}
                onClick={item.action}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', cursor: 'pointer',
                  background: item.highlight
                    ? 'linear-gradient(135deg, #faf5ff, #ede9fe)'
                    : '#fff',
                  transition: 'background .1s',
                  borderLeft: item.highlight ? '3px solid #8b5cf6' : '3px solid transparent',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = item.bg!;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = item.highlight
                    ? 'linear-gradient(135deg, #faf5ff, #ede9fe)' : '#fff';
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: item.bg, border: `1px solid ${item.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: item.color, flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <span style={{ fontSize: 13, fontWeight: item.bold ? 700 : 500, color: item.color }}>
                  {item.label}
                </span>
                {item.highlight && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    background: '#7c3aed', color: '#fff',
                    padding: '1px 6px', borderRadius: 10,
                    textTransform: 'uppercase', letterSpacing: .5,
                  }}>
                    NEW
                  </span>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// CONVERT TO ORDER — CONFIRMATION MODAL
// ─────────────────────────────────────────────

interface OrderBookingModalProps {
  record:    SampleRecord | null;
  onClose:   () => void;
  onConfirm: (record: SampleRecord) => void;
  saving?:   boolean;
  error?:    string;
}

function OrderBookingModal({ record, onClose, onConfirm, saving = false, error = '' }: OrderBookingModalProps) {
  if (!record) return null;

  const meta = STATUS_META[record.status] || {
    color: '#374151', bg: '#f3f4f6', dot: '#94a3b8', label: record.status,
  };

  const DetailField = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={OB.field}>
      <div style={OB.fieldLabel}>{label}</div>
      <div style={OB.fieldVal}>{children}</div>
    </div>
  );

  return (
    <div style={OB.overlay} onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div style={OB.modal} onClick={e => e.stopPropagation()}>
        <div style={OB.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={OB.headerIcon}><Icon.ShoppingCart /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                Convert to order booking?
              </h3>
              <span style={OB.fromBadge}>From sample request</span>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                Confirming will save a conversion record and show a success message.
              </p>
            </div>
          </div>
          <button style={OB.closeBtn} onClick={onClose} disabled={saving} title="Close">
            <Icon.X />
          </button>
        </div>
        <div style={OB.body}>
          <div style={OB.sectionLabel}>Request details</div>
          <div style={OB.grid}>
            <DetailField label="Request code">
              <span style={{ fontWeight: 800, color: '#6366f1' }}>{record.request_code}</span>
            </DetailField>
            <DetailField label="Status">
              <span style={{ ...OB.statusPill, color: meta.color, background: meta.bg }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block', marginRight: 5, flexShrink: 0 }} />
                {meta.label}
              </span>
            </DetailField>
            <DetailField label="Customer">{record.customer_name || '—'}</DetailField>
            <DetailField label="Customer ID">{record.customer_id || '—'}</DetailField>
            <DetailField label="Agent">{record.agent_name || '—'}</DetailField>
            <DetailField label="Sample type">
              {record.sample_type === 'parcel' ? '📦 Parcel' : '💬 WhatsApp'}
            </DetailField>
            <DetailField label="Fabric code">
              <span style={{ fontWeight: 700 }}>{record.fabric_code || '—'}</span>
            </DetailField>
            <DetailField label="Fabric quality">{record.fabric_quality || '—'}</DetailField>
            <DetailField label="Color">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: record.color?.toLowerCase() || '#e2e8f0', border: '1.5px solid #e2e8f0', flexShrink: 0 }} />
                {record.color || '—'}
              </span>
            </DetailField>
            <DetailField label="Quantity">
              <span style={{ fontWeight: 700 }}>
                {record.quantity_meters}
                <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}> m</span>
              </span>
            </DetailField>
            <DetailField label="Request date">{record.created_at?.slice(0, 10) || '—'}</DetailField>
            <DetailField label="Comments">
              <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>
                {record.customer_comments || '—'}
              </span>
            </DetailField>
          </div>
          <div style={OB.divider} />
          <div style={OB.infoBox}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              A <strong>conversion record</strong> will be saved. After confirming, you can navigate to the
              <strong> Customer Orders</strong> page to complete the order.
            </p>
          </div>
          {error && (
            <div style={{ marginTop: 12, background: '#fff1f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 13px', fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}
        </div>
        <div style={OB.footer}>
          <button style={OB.cancelBtn} onClick={onClose} disabled={saving}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
            Cancel
          </button>
          <button
            style={{ ...OB.confirmBtn, opacity: saving ? 0.75 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            onClick={() => !saving && onConfirm(record)} disabled={saving}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#1d4ed8'; }}
            onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#2563eb'; }}>
            {saving ? (
              <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
            ) : (
              <><Icon.ShoppingCart />Yes, convert to order</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BELL NOTIFICATION PANEL
// ─────────────────────────────────────────────

interface BellNotificationPanelProps {
  notifications: BellNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenChat: (srId: number, requestCode: string, customerName: string) => void;
  onClose: () => void;
}

const BellNotificationPanel: React.FC<BellNotificationPanelProps> = ({
  notifications, onMarkRead, onOpenChat, onClose
}) => {
  const unreadCount = notifications.filter(n => !n.is_read).length;
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, width: 360, maxHeight: 480,
      background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      border: '1px solid #e2e8f0', zIndex: 2000, overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbff' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Notifications</div>
          {unreadCount > 0 && <div style={{ fontSize: 12, color: '#6366f1', marginTop: 2 }}>{unreadCount} unread</div>}
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>All caught up!</div>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className="notif-item"
              style={{ padding: '12px 18px', borderBottom: '1px solid #f8fafc', background: n.is_read ? '#fff' : '#f5f3ff', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
              onClick={() => { onMarkRead(n.id); onOpenChat(n.sample_request_id, n.request_code, n.customer_name); onClose(); }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {n.sender === 'bot' ? '🤖' : '👤'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{n.customer_name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatTimeAgo(n.timestamp)}</div>
                </div>
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 3 }}>{n.request_code}</div>
                <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.message}</div>
              </div>
              {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

function formatTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function SampleRequests() {
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const admin = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const [records, setRecords]       = useState<SampleRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [customers, setCustomers]               = useState<CustomerMaster[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [agents, setAgents]                     = useState<AgentMaster[]>([]);
  const [agentsLoading, setAgentsLoading]       = useState(false);
  const [fabricMasters, setFabricMasters]       = useState<FabricMaster[]>([]);
  const [fabricsLoading, setFabricsLoading]     = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(10);
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<SampleRecord | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState('');

  const [activeSR, setActiveSR]             = useState<SampleRecord | null>(null);
  const [activeProcess, setActiveProcess]   = useState<number | null>(null);
  const [processSaving, setProcessSaving]   = useState(false);
  const [processSuccess, setProcessSuccess] = useState<string | null>(null);
  const [processError, setProcessError]     = useState<string | null>(null);

  const [savedYardage,    setSavedYardage]    = useState<any[]>([]);
  const [savedPrices,     setSavedPrices]     = useState<any[]>([]);
  const [fetchingYardage, setFetchingYardage] = useState(false);
  const [fetchingPrice,   setFetchingPrice]   = useState(false);

  const [devAnalysisForm, setDevAnalysisForm] = useState<DevAnalysisForm>(emptyDevAnalysis);
  const [yardageForm, setYardageForm]         = useState<YardageMOQ>(emptyYardage);
  const [priceForm, setPriceForm]             = useState<PriceListEntry>(emptyPrice);
  const [priceList, setPriceList]             = useState<PriceListEntry[]>([]);

  const [editingPriceRow,   setEditingPriceRow]   = useState<Record<number, PriceListEntry & { id: number }>>({});
  const [deletingPriceId,   setDeletingPriceId]   = useState<number | null>(null);
  const [editingYardageRow, setEditingYardageRow] = useState<Record<number, YardageMOQ & { id: number }>>({});

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]     = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [unread, setUnread]           = useState<Record<number, number>>({});
  const messagesEndRef                = useRef<HTMLDivElement>(null);
  const chatPollRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  const [bellNotifications, setBellNotifications] = useState<BellNotification[]>([]);
  const [bellOpen, setBellOpen]                   = useState(false);
  const bellPollRef                               = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenMsgIds                            = useRef<Record<number, Set<number>>>({});
  const openChatSrId                              = useRef<number | null>(null);
  const bellRef                                   = useRef<HTMLDivElement>(null);
  const bellUnreadCount = bellNotifications.filter(n => !n.is_read).length;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editId, setEditId]               = useState<number | null>(null);
  const [editRecord, setEditRecord]       = useState<SampleRecord | null>(null);
  const [activeEditTab, setActiveEditTab] = useState(0);
  const [form, setForm]                   = useState<any>(emptyForm);
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState<string | null>(null);
  const [removeImage, setRemoveImage]     = useState(false);

  const [newModalOpen, setNewModalOpen]       = useState(false);
  const [newForm, setNewForm]                 = useState<any>(emptyForm);
  const [newImageFile, setNewImageFile]       = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newError, setNewError]               = useState<string | null>(null);

  const [reportRecord, setReportRecord] = useState<SampleRecord | null>(null);

  // ── Order Booking state ──
  const [orderBookingRecord,  setOrderBookingRecord]  = useState<SampleRecord | null>(null);
  const [orderBookingOpen,    setOrderBookingOpen]    = useState(false);
  const [orderBookingSaving,  setOrderBookingSaving]  = useState(false);
  const [orderBookingError,   setOrderBookingError]   = useState('');
  const [orderBookingSuccess, setOrderBookingSuccess] = useState(false);
  const [convertedRecord,     setConvertedRecord]     = useState<SampleRecord | null>(null);

  // ── Export state ──
  const [exportOpen,  setExportOpen]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────
  // EXPORT click-outside handler
  // ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─────────────────────────────────────────────
  // CUSTOMER CODE RESOLVER
  // ─────────────────────────────────────────────
  const resolveCustomerCode = useCallback((r: SampleRecord): string => {
    if (!r.customer_id) return '';
    // If it's already a string code (e.g. "CUS-2026-001"), use it directly
    if (typeof r.customer_id === 'string' && isNaN(Number(r.customer_id))) return r.customer_id;
    // Otherwise it's a numeric FK — look up the customer master
    const matched = customers.find(c => c.id === Number(r.customer_id));
    return matched?.customer_id ?? r.customer_id ?? '';
  }, [customers]);

  // ─────────────────────────────────────────────
  // EXPORT HELPERS
  // ─────────────────────────────────────────────
  const buildExportRows = useCallback((data: SampleRecord[]) =>
    data.map((r, i) => ({
      '#':              i + 1,
      'Request Code':   r.request_code ?? '',
      'Customer Name':  r.customer_name ?? '',
      'Customer Code':  resolveCustomerCode(r),
      'Agent':          r.agent_name ?? '',
      'Sample Type':    r.sample_type === 'parcel' ? 'Parcel' : 'WhatsApp',
      'Fabric Code':    r.fabric_code ?? '',
      'Fabric Quality': r.fabric_quality ?? '',
      'Color':          r.color ?? '',
      'Qty (m)':        r.quantity_meters ?? '',
      'Status':         STATUS_META[r.status]?.label ?? r.status ?? '',
      'Created':        r.created_at?.slice(0, 10) ?? '',
    })), [resolveCustomerCode]);

  const escapeCsv = (val: any): string => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    setExportOpen(false); setExporting(true);
    const rows = buildExportRows(filteredRecords);
    if (!rows.length) { setExporting(false); return; }
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escapeCsv((r as any)[h])).join(',')),
    ];
    downloadBlob(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
      `sample-requests-${new Date().toISOString().slice(0, 10)}.csv`
    );
    setExporting(false);
  };

  const handleExportExcel = () => {
    setExportOpen(false); setExporting(true);
    const rows = buildExportRows(filteredRecords);
    if (!rows.length) { setExporting(false); return; }
    const headers = Object.keys(rows[0]);
    const tableHtml = `<table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const htmlDoc = `<html><head><meta charset="UTF-8"></head><body>${tableHtml}</body></html>`;
    downloadBlob(
      new Blob([htmlDoc], { type: 'application/vnd.ms-excel' }),
      `sample-requests-${new Date().toISOString().slice(0, 10)}.xls`
    );
    setExporting(false);
  };

  const handlePrintTable = () => {
    setExportOpen(false); setExporting(true);
    const rows = buildExportRows(filteredRecords);
    if (!rows.length) { setExporting(false); return; }
    const headers = Object.keys(rows[0]);
    const win = window.open('', '_blank', 'width=1200,height=700');
    if (!win) { setExporting(false); return; }
    win.document.write(`
      <html>
        <head>
          <title>Sample Requests</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1a2332; }
            h2 { margin: 0 0 4px; font-size: 18px; }
            p { margin: 0 0 16px; color: #64748b; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background: #2563eb; color: #fff; }
            tr:nth-child(even) td { background: #eff6ff; }
          </style>
        </head>
        <body>
          <h2>Sample Requests</h2>
          <p>${rows.length} record(s) · Printed on ${new Date().toLocaleString('en-IN')}</p>
          <table>
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${(r as any)[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); };<\/script>
        </body>
      </html>
    `);
    win.document.close();
    setExporting(false);
  };

  // ─────────────────────────────────────────────
  // OPEN / CONFIRM ORDER BOOKING
  // ─────────────────────────────────────────────

  const openOrderBooking = (r: SampleRecord) => {
    setOrderBookingRecord(r);
    setOrderBookingError('');
    setOrderBookingOpen(true);
  };

  const handleConfirmOrderBooking = async (r: SampleRecord) => {
    setOrderBookingSaving(true);
    setOrderBookingError('');
    try {
      await axios.post('/order-conversions', {
        sample_request_id: r.id,
        request_code:      r.request_code,
        customer_name:     r.customer_name,
        customer_id:       r.customer_id  || '',
        agent_name:        r.agent_name   || '',
        fabric_code:       r.fabric_code  || '',
        fabric_quality:    r.fabric_quality || '',
        color:             r.color         || '',
        quantity_meters:   r.quantity_meters || 0,
        converted_by:      admin?.name || 'admin',
        notes:             '',
      });
      setOrderBookingOpen(false);
      setOrderBookingSaving(false);
      setConvertedRecord(r);
      setOrderBookingSuccess(true);
      addNotification('success', 'Order Converted', `"${r.request_code}" has been converted successfully.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to start conversion. Please try again.';
      setOrderBookingError(msg);
      setOrderBookingSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const res = await axios.get('/customers?limit=1000&page=1');
      const raw = res.data;
      const rows: CustomerMaster[] = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.customers) ? raw.customers
        : Array.isArray(raw?.result) ? raw.result : [];
      setCustomers(rows);
    } catch (e) { setCustomers([]); }
    finally { setCustomersLoading(false); }
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await axios.get('/agents?limit=1000&page=1');
      const raw = res.data;
      const rows: AgentMaster[] = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.agents) ? raw.agents
        : Array.isArray(raw?.result) ? raw.result : [];
      setAgents(rows);
    } catch (e) { setAgents([]); }
    finally { setAgentsLoading(false); }
  }, []);

  const loadFabricMasters = useCallback(async () => {
    setFabricsLoading(true);
    try {
      const res = await axios.get('/fabrics');
      const raw = res.data;
      const rows: FabricMaster[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setFabricMasters(rows);
    } catch { setFabricMasters([]); }
    finally { setFabricsLoading(false); }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadFabricMasters();
    loadAgents();
  }, [loadCustomers, loadFabricMasters, loadAgents]);

  // ─────────────────────────────────────────────
  // BELL NOTIFICATIONS
  // ─────────────────────────────────────────────

  const pollBellNotifications = useCallback(async () => {
    try {
      const unreadRes = await axios.get('/chat/unread');
      const unreadMap: Record<number, number> = {};
      (unreadRes.data as any[]).forEach(r => { unreadMap[r.sample_request_id] = r.count; });
      setUnread(unreadMap);

      const srIdsWithUnread = Object.keys(unreadMap).map(Number).filter(id => unreadMap[id] > 0 && id !== openChatSrId.current);

      for (const srId of srIdsWithUnread) {
        try {
          const msgsRes = await axios.get(`/chat/messages?sample_request_id=${srId}`);
          const msgs: ChatMessage[] = Array.isArray(msgsRes.data) ? msgsRes.data : [];

          if (!lastSeenMsgIds.current[srId]) {
            lastSeenMsgIds.current[srId] = new Set(msgs.map(m => m.id!).filter(Boolean));
            continue;
          }

          const newClientMsgs = msgs.filter(m => m.id && !lastSeenMsgIds.current[srId].has(m.id) && (m.sender === 'user' || m.sender === 'bot'));

          if (newClientMsgs.length > 0) {
            const srRecord = records.find(r => r.id === srId);
            const requestCode  = srRecord?.request_code || `SR-${srId}`;
            const customerName = srRecord?.customer_name || 'Customer';

            const newBellItems: BellNotification[] = newClientMsgs.map(m => ({
              id: `${srId}-${m.id}-${Date.now()}`,
              sample_request_id: srId,
              request_code: requestCode,
              customer_name: customerName,
              message: m.message,
              sender: m.sender as 'user' | 'bot',
              timestamp: m.created_at ? new Date(m.created_at) : new Date(),
              is_read: false,
            }));

            setBellNotifications(prev => {
              const existingMsgIds = new Set(prev.map(n => n.id.split('-')[1]));
              const trulyNew = newBellItems.filter(n => !existingMsgIds.has(n.id.split('-')[1]));
              if (trulyNew.length === 0) return prev;
              return [...trulyNew, ...prev].slice(0, 50);
            });

            newClientMsgs.forEach(m => { if (m.id) lastSeenMsgIds.current[srId].add(m.id); });
            newClientMsgs.slice(0, 1).forEach(m => {
              addNotification('info', `💬 New message from ${customerName}`, `${requestCode}: "${m.message.slice(0, 60)}${m.message.length > 60 ? '…' : ''}"`);
            });
          }
          msgs.forEach(m => { if (m.id) lastSeenMsgIds.current[srId].add(m.id); });
        } catch { /* silent */ }
      }

      try {
        const notifRes = await axios.get('/notifications?role=admin&unread_only=1&limit=30');
        const notifs: any[] = Array.isArray(notifRes.data) ? notifRes.data : [];
        const convNotifs = notifs.filter((n: any) => n.type === 'order_conversion');

        if (convNotifs.length > 0) {
          const newBellItems: BellNotification[] = convNotifs
            .filter((n: any) => !lastSeenMsgIds.current['__notif__' as any]?.has(n.id))
            .map((n: any) => ({
              id:                `notif-${n.id}`,
              sample_request_id: n.sample_request_id,
              request_code:      n.meta?.request_code || '',
              customer_name:     n.meta?.customer_name || '',
              message:           n.title,
              sender:            'user' as const,
              timestamp:         new Date(n.created_at),
              is_read:           !!n.is_read,
            }));

          if (newBellItems.length > 0) {
            if (!lastSeenMsgIds.current['__notif__' as any]) {
              lastSeenMsgIds.current['__notif__' as any] = new Set();
            }
            newBellItems.forEach(n => {
              const rawId = Number(n.id.replace('notif-', ''));
              lastSeenMsgIds.current['__notif__' as any].add(rawId);
            });
            setBellNotifications(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const trulyNew = newBellItems.filter(n => !existingIds.has(n.id));
              if (!trulyNew.length) return prev;
              return [...trulyNew, ...prev].slice(0, 50);
            });
          }
        }
      } catch { /* silent */ }

    } catch { /* silent */ }
  }, [records, addNotification]);

  useEffect(() => {
    pollBellNotifications();
    bellPollRef.current = setInterval(pollBellNotifications, 5000);
    return () => { if (bellPollRef.current) clearInterval(bellPollRef.current); };
  }, [pollBellNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markBellRead    = useCallback((id: string) => setBellNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n)), []);
  const markAllBellRead = useCallback(() => setBellNotifications(prev => prev.map(n => ({ ...n, is_read: true }))), []);

  const handleBellOpenChat = useCallback((srId: number) => {
    const sr = records.find(r => r.id === srId);
    if (sr) openEditModal(sr, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  // ─────────────────────────────────────────────
  // FETCH HELPERS
  // ─────────────────────────────────────────────

  const fetchYardageList = async (srId: number) => {
    setFetchingYardage(true);
    try {
      const res  = await axios.get(`/yardage-moq?sample_request_id=${srId}`);
      setSavedYardage(Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []));
    } catch { setSavedYardage([]); }
    finally { setFetchingYardage(false); }
  };

  const fetchPriceList = async (srId: number) => {
    setFetchingPrice(true);
    try {
      const res = await axios.get(`/price-lists?sample_request_id=${srId}`);
      setSavedPrices(Array.isArray(res.data) ? res.data : []);
    } catch { setSavedPrices([]); }
    finally { setFetchingPrice(false); }
  };

  const loadData = () => {
    setLoading(true);
    getSampleRequests()
      .then((d: any) => {
        const rows = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
        setRecords(rows);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, pageSize]);

  const loadUnread = useCallback(async () => {
    try {
      const res = await axios.get('/chat/unread');
      const map: Record<number, number> = {};
      (res.data as any[]).forEach(r => { map[r.sample_request_id] = r.count; });
      setUnread(map);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 8000);
    return () => clearInterval(t);
  }, [loadUnread]);

  const startChatPoll = useCallback((srId: number) => {
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    chatPollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/chat/messages?sample_request_id=${srId}`);
        setMessages(Array.isArray(res.data) ? res.data : []);
      } catch { /* silent */ }
    }, 4000);
  }, []);

  const stopChatPoll = useCallback(() => { if (chatPollRef.current) clearInterval(chatPollRef.current); }, []);
  useEffect(() => () => stopChatPoll(), [stopChatPoll]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const filteredRecords = records.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.request_code?.toLowerCase().includes(q) || r.customer_name?.toLowerCase().includes(q) ||
      r.agent_name?.toLowerCase().includes(q) || r.fabric_code?.toLowerCase().includes(q) ||
      r.fabric_quality?.toLowerCase().includes(q) || r.color?.toLowerCase().includes(q) || r.status?.toLowerCase().includes(q)
    );
  });

  const totalPages   = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage     = Math.min(currentPage, totalPages);
  const pageStart    = (safePage - 1) * pageSize;
  const pagedRecords = filteredRecords.slice(pageStart, pageStart + pageSize);

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [];
    if (safePage <= 3)                   { pages.push(1, 2, 3, 4, '...', totalPages); }
    else if (safePage >= totalPages - 2) { pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages); }
    else                                 { pages.push(1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages); }
    return pages;
  };

  // ─────────────────────────────────────────────
  // RESET / OPEN / CLOSE HELPERS
  // ─────────────────────────────────────────────

  const resetAllForms = () => {
    setSavedYardage([]); setSavedPrices([]); setPriceList([]);
    setDevAnalysisForm(emptyDevAnalysis); setYardageForm(emptyYardage); setPriceForm(emptyPrice);
    setFetchingYardage(false); setFetchingPrice(false);
    setEditingYardageRow({}); setEditingPriceRow({}); setDeletingPriceId(null);
  };

  const openProcess = async (sr: SampleRecord, proc: number) => {
    setActiveSR(sr); setActiveProcess(proc);
    setProcessSuccess(null); setProcessError(null); resetAllForms();
    if (proc === 2) await fetchYardageList(sr.id);
    if (proc === 3) await fetchPriceList(sr.id);
    if (proc === 4) {
      try { await axios.post(`/chat/mark-read`, { sample_request_id: sr.id }); } catch { /* silent */ }
      try {
        const res = await axios.get(`/chat/messages?sample_request_id=${sr.id}`);
        setMessages(Array.isArray(res.data) ? res.data : []);
        setUnread(prev => ({ ...prev, [sr.id]: 0 }));
        setBellNotifications(prev => prev.map(n => n.sample_request_id === sr.id ? { ...n, is_read: true } : n));
        const msgs: ChatMessage[] = Array.isArray(res.data) ? res.data : [];
        if (!lastSeenMsgIds.current[sr.id]) lastSeenMsgIds.current[sr.id] = new Set();
        msgs.forEach(m => { if (m.id) lastSeenMsgIds.current[sr.id].add(m.id); });
      } catch { setMessages([]); }
      openChatSrId.current = sr.id;
      startChatPoll(sr.id);
    }
  };

  const closeProcess = () => {
    openChatSrId.current = null;
    setActiveSR(null); setActiveProcess(null);
    setProcessSaving(false); setProcessSuccess(null); setProcessError(null);
    setMessages([]); setChatInput(''); stopChatPoll(); resetAllForms();
  };

  const openEditModal = async (r: SampleRecord, initialTab: number = 0) => {
    resetAllForms(); setMessages([]); setChatInput('');
    setProcessSuccess(null); setProcessError(null); setError(null);
    setImageFile(null); setRemoveImage(false);
    setEditId(r.id); setEditRecord(r); setActiveEditTab(initialTab);
    setForm({
      request_code: r.request_code || '', customer_name: r.customer_name || '',
      customer_id: r.customer_id || '', agent_name: r.agent_name || '',
      sample_type: r.sample_type || 'whatsapp', fabric_code: r.fabric_code || '',
      fabric_quality: r.fabric_quality || '', color: r.color || '',
      quantity_meters: r.quantity_meters || '', customer_comments: r.customer_comments || '',
      status: r.status || 'pending',
    });
    setImagePreview(r.image_url ? (r.image_url.startsWith('http') ? r.image_url : `${BASE_URL}${r.image_url}`) : null);
    setEditModalOpen(true);

    await Promise.all([
      fetchYardageList(r.id),
      fetchPriceList(r.id),
      axios.get(`/chat/messages?sample_request_id=${r.id}`)
        .then(res => {
          const msgs: ChatMessage[] = Array.isArray(res.data) ? res.data : [];
          setMessages(msgs);
          if (!lastSeenMsgIds.current[r.id]) lastSeenMsgIds.current[r.id] = new Set();
          msgs.forEach(m => { if (m.id) lastSeenMsgIds.current[r.id].add(m.id); });
        })
        .catch(() => setMessages([])),
    ]);

    if (initialTab === 4) {
      openChatSrId.current = r.id;
      try { await axios.post(`/chat/mark-read`, { sample_request_id: r.id }); } catch { /* silent */ }
      setUnread(prev => ({ ...prev, [r.id]: 0 }));
      setBellNotifications(prev => prev.map(n => n.sample_request_id === r.id ? { ...n, is_read: true } : n));
      startChatPoll(r.id);
    }
  };

  const closeEditModal = () => {
    openChatSrId.current = null;
    setEditModalOpen(false); setEditId(null); setEditRecord(null);
    setForm(emptyForm); setImageFile(null); setImagePreview(null); setRemoveImage(false);
    setError(null); setMessages([]); setChatInput('');
    setProcessSuccess(null); setProcessError(null);
    stopChatPoll(); resetAllForms();
  };

  const switchEditTab = async (tabId: number, sr?: SampleRecord) => {
    setActiveEditTab(tabId); setProcessSuccess(null); setProcessError(null);
    setDevAnalysisForm(emptyDevAnalysis); setYardageForm(emptyYardage); setPriceForm(emptyPrice);
    setPriceList([]); setEditingYardageRow({}); setEditingPriceRow({});
    const record = sr || editRecord;
    if (!record) return;
    if (tabId === 2) await fetchYardageList(record.id);
    if (tabId === 3) { setDeletingPriceId(null); await fetchPriceList(record.id); }
    if (tabId === 4) {
      openChatSrId.current = record.id;
      try { await axios.post(`/chat/mark-read`, { sample_request_id: record.id }); } catch { /* silent */ }
      setUnread(prev => ({ ...prev, [record.id]: 0 }));
      setBellNotifications(prev => prev.map(n => n.sample_request_id === record.id ? { ...n, is_read: true } : n));
      try {
        const res = await axios.get(`/chat/messages?sample_request_id=${record.id}`);
        const msgs: ChatMessage[] = Array.isArray(res.data) ? res.data : [];
        setMessages(msgs);
        if (!lastSeenMsgIds.current[record.id]) lastSeenMsgIds.current[record.id] = new Set();
        msgs.forEach(m => { if (m.id) lastSeenMsgIds.current[record.id].add(m.id); });
      } catch { /* silent */ }
      startChatPoll(record.id);
    } else {
      openChatSrId.current = null;
      stopChatPoll();
    }
  };

  // ─────────────────────────────────────────────
  // SAVE HANDLERS
  // ─────────────────────────────────────────────

  const handleUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSubmitting(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v as string));
      if (imageFile) fd.append('image', imageFile);
      if (removeImage) fd.append('remove_image', 'true');
      await axios.put(`/sample-requests/${editId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addNotification('success', 'Sample Request Updated', `"${form.request_code}" updated.`);
      loadData();
      setProcessSuccess('✓ Request info updated successfully!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Save failed';
      setError(msg);
      addNotification('error', 'Save Failed', msg);
    } finally { setSubmitting(false); }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setNewError(null);
    try {
      const fd = new FormData();
      Object.entries(newForm).forEach(([k, v]) => fd.append(k, v as string));
      if (newImageFile) fd.append('image', newImageFile);
      await axios.post('/sample-requests', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addNotification('success', 'Sample Request Added', `New request "${newForm.request_code}" created.`);
      setNewModalOpen(false); setNewForm(emptyForm); setNewImageFile(null); setNewImagePreview(null);
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Save failed';
      setNewError(msg);
      addNotification('error', 'Save Failed', msg);
    } finally { setSubmitting(false); }
  };

  const handleSaveDevAnalysis = async () => {
    const sr = editRecord || activeSR;
    if (!sr) return;
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      await saveDevAnalysis({
        sample_request_id: sr.id,
        style_number:  devAnalysisForm.style_number  || undefined,
        construction:  devAnalysisForm.construction  || undefined,
        blend:         devAnalysisForm.blend          || undefined,
        gsm:           devAnalysisForm.gsm.trim()     || undefined,
        weave_type:    devAnalysisForm.weave_type     || undefined,
        analyzed_by:   devAnalysisForm.analyzed_by   || undefined,
        analysis_date: devAnalysisForm.analysis_date  || undefined,
        remarks:       devAnalysisForm.remarks        || undefined,
      });
      setProcessSuccess('✓ Development analysis saved!');
      addNotification('success', 'Dev Analysis Saved', `Analysis for "${sr.request_code}" saved.`);
      setDevAnalysisForm(emptyDevAnalysis);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save';
      setProcessError(msg);
      addNotification('error', 'Dev Analysis Failed', msg);
    } finally { setProcessSaving(false); }
  };

  const handleSaveYardage = async () => {
    const sr = editRecord || activeSR;
    if (!sr) return;
    if (!yardageForm.moq_meters || !yardageForm.price_per_meter) { setProcessError('Please enter MOQ meters and price per meter'); return; }
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      await saveYardageMOQ({
        sample_request_id: sr.id,
        fabric_code:       sr.fabric_code || undefined,
        order_type:        yardageForm.order_type as 'sample' | 'bulk',
        moq_meters:        parseFloat(yardageForm.moq_meters),
        price_per_meter:   parseFloat(yardageForm.price_per_meter),
        currency:          yardageForm.currency,
        valid_from:        yardageForm.valid_from  || undefined,
        valid_until:       yardageForm.valid_until || undefined,
      });
      setProcessSuccess('✓ Yardage & MOQ saved!');
      addNotification('success', 'Yardage Saved', `MOQ of ${yardageForm.moq_meters}m saved.`);
      setYardageForm(emptyYardage);
      await fetchYardageList(sr.id);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save yardage';
      setProcessError(msg);
      addNotification('error', 'Yardage Failed', msg);
    } finally { setProcessSaving(false); }
  };

  const startEditYardageRow = (row: any) => {
    setEditingYardageRow(prev => ({
      ...prev,
      [row.id]: {
        id: row.id, order_type: row.order_type || 'sample',
        moq_meters: row.moq_meters?.toString() || '', moq_yards: parseFloat(row.moq_yards || 0),
        price_per_meter: row.price_per_meter?.toString() || '', price_per_yard: parseFloat(row.price_per_yard || 0),
        currency: row.currency || 'INR', valid_from: row.valid_from?.slice(0, 10) || '', valid_until: row.valid_until?.slice(0, 10) || '',
      }
    }));
    setProcessSuccess(null); setProcessError(null);
  };

  const cancelEditYardageRow = (id: number) => setEditingYardageRow(prev => { const n = { ...prev }; delete n[id]; return n; });

  const confirmUpdateYardageRow = async (id: number) => {
    const sr = editRecord || activeSR;
    if (!sr) return;
    const row = editingYardageRow[id];
    if (!row) return;
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      await axios.put(`/yardage-moq/${id}`, {
        sample_request_id: sr.id, fabric_code: sr.fabric_code || undefined,
        order_type: row.order_type, moq_meters: parseFloat(row.moq_meters),
        price_per_meter: parseFloat(row.price_per_meter), currency: row.currency,
        valid_from: row.valid_from || undefined, valid_until: row.valid_until || undefined,
      });
      setProcessSuccess('✓ Yardage record updated.');
      cancelEditYardageRow(id);
      await fetchYardageList(sr.id);
      addNotification('success', 'Yardage Updated', 'MOQ record updated.');
    } catch (err: any) {
      setProcessError(err?.response?.data?.message || 'Failed to update');
    } finally { setProcessSaving(false); }
  };

  const handleDeleteYardage = async (yardageId: number) => {
    if (!window.confirm('Delete this yardage MOQ record?')) return;
    const sr = editRecord || activeSR;
    if (!sr) return;
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      await axios.delete(`/yardage-moq/${yardageId}`);
      setProcessSuccess('✓ Yardage record deleted.');
      cancelEditYardageRow(yardageId);
      await fetchYardageList(sr.id);
      addNotification('warning', 'Yardage Record Deleted', 'Yardage MOQ entry removed.');
    } catch (err: any) {
      setProcessError(err?.response?.data?.message || 'Failed to delete');
    } finally { setProcessSaving(false); }
  };

  const handleSavePriceList = async () => {
    const sr = editRecord || activeSR;
    if (!sr) return;
    if (priceList.length === 0) { setProcessError('Please add at least one price entry'); return; }
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      await Promise.all(priceList.map(p =>
        savePriceList({
          sample_request_id: sr.id, fabric_code: sr.fabric_code, fabric_quality: sr.fabric_quality,
          color: sr.color, list_type: p.list_type as 'sample_meter' | 'bulk_order',
          min_quantity_meters: parseFloat(p.min_quantity_meters),
          max_quantity_meters: p.max_quantity_meters ? parseFloat(p.max_quantity_meters) : undefined,
          price_per_meter: parseFloat(p.price_per_meter), discount_percent: parseFloat(p.discount_percent) || 0,
          currency: p.currency, remarks: p.remarks || undefined,
        })
      ));
      setProcessSuccess(`✓ ${priceList.length} price entr${priceList.length > 1 ? 'ies' : 'y'} saved!`);
      setPriceList([]); setPriceForm(emptyPrice); await fetchPriceList(sr.id);
      addNotification('success', 'Price List Saved', `${priceList.length} entries saved.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save price list';
      setProcessError(msg);
      addNotification('error', 'Price List Failed', msg);
    } finally { setProcessSaving(false); }
  };

  const handleDeleteSavedPrice = async (priceId: number) => {
    if (!window.confirm('Delete this price entry?')) return;
    const sr = editRecord || activeSR;
    if (!sr) return;
    setDeletingPriceId(priceId); setProcessSuccess(null); setProcessError(null);
    try {
      await axios.delete(`/price-lists/${priceId}`);
      setProcessSuccess('✓ Price entry deleted.');
      await fetchPriceList(sr.id);
      addNotification('warning', 'Price Entry Deleted', 'Price list entry removed.');
    } catch (err: any) {
      setProcessError(err?.response?.data?.message || 'Failed to delete');
    } finally { setDeletingPriceId(null); }
  };

  const handleUpdateSavedPrice = async (priceId: number, updatedData: Partial<PriceListEntry>) => {
    const sr = editRecord || activeSR;
    if (!sr) return;
    setProcessSaving(true); setProcessSuccess(null); setProcessError(null);
    try {
      const total = parseFloat(updatedData.min_quantity_meters || '0') * parseFloat(updatedData.price_per_meter || '0');
      const disc  = parseFloat(updatedData.discount_percent || '0');
      const final = total - (total * disc / 100);
      await axios.put(`/price-lists/${priceId}`, { ...updatedData, min_quantity_meters: parseFloat(updatedData.min_quantity_meters || '0'), max_quantity_meters: updatedData.max_quantity_meters ? parseFloat(updatedData.max_quantity_meters) : null, price_per_meter: parseFloat(updatedData.price_per_meter || '0'), discount_percent: disc, total_price: total, final_price: final });
      setProcessSuccess('✓ Price entry updated!');
      await fetchPriceList(sr.id);
      addNotification('success', 'Price Entry Updated', 'Price list entry updated.');
    } catch (err: any) {
      setProcessError(err?.response?.data?.message || 'Failed to update');
    } finally { setProcessSaving(false); }
  };

  const sendAdminMessage = async (srId: number) => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim(); setChatInput(''); setChatLoading(true);
    try {
      await axios.post('/chat/messages', { sample_request_id: srId, user_id: admin.id ?? null, sender: 'admin', message: text });
      const res = await axios.get(`/chat/messages?sample_request_id=${srId}`);
      const msgs: ChatMessage[] = Array.isArray(res.data) ? res.data : [];
      setMessages(msgs);
      if (!lastSeenMsgIds.current[srId]) lastSeenMsgIds.current[srId] = new Set();
      msgs.forEach(m => { if (m.id) lastSeenMsgIds.current[srId].add(m.id); });
    } catch { setProcessError('Message failed to send.'); }
    finally { setChatLoading(false); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { setError('Only JPG, PNG, WEBP or GIF allowed'); return; }
    if (file.size > 5*1024*1024) { setError('Image must be under 5MB'); return; }
    setError(null); setImageFile(file); setRemoveImage(false); setImagePreview(URL.createObjectURL(file));
  };

  const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { setNewError('Only JPG, PNG, WEBP or GIF allowed'); return; }
    if (file.size > 5*1024*1024) { setNewError('Image must be under 5MB'); return; }
    setNewError(null); setNewImageFile(file); setNewImagePreview(URL.createObjectURL(file));
  };

  const openDeleteConfirm = (r: SampleRecord) => { setDeleteTarget(r); setDeleteError(''); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteSampleRequest(deleteTarget.id);
      addNotification('warning', 'Sample Request Deleted', `"${deleteTarget.request_code}" deleted.`);
      setDeleteTarget(null); loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Delete failed';
      setDeleteError(msg); addNotification('error', 'Delete Failed', msg);
    } finally { setDeleting(false); }
  };

  const calcYardage      = (m: string) => parseFloat(m) ? (parseFloat(m) * 1.09361).toFixed(3) : '0.000';
  const calcPricePerYard = (ppm: string) => parseFloat(ppm) ? (parseFloat(ppm) / 1.09361).toFixed(2) : '0.00';
  const calcTotal        = (qty: string, ppm: string) => parseFloat(qty) * parseFloat(ppm) || 0;
  const calcFinal        = (total: number, disc: string) => total - (total * (parseFloat(disc) || 0) / 100);

  const fmtMoney = (v: any, decimals: number = 2): string => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n.toFixed(decimals) : '—';
  };

  const addPriceRow = () => {
    if (!priceForm.min_quantity_meters || !priceForm.price_per_meter) { setProcessError('Please enter min quantity and price per meter'); return; }
    const total = calcTotal(priceForm.min_quantity_meters, priceForm.price_per_meter);
    const final = calcFinal(total, priceForm.discount_percent);
    setPriceList(l => [...l, { ...priceForm, total_price: total, final_price: final }]);
    setPriceForm(emptyPrice); setProcessError(null);
  };

  const startEditPrice = (p: any) => {
    setEditingPriceRow(prev => ({
      ...prev,
      [p.id]: { id: p.id, list_type: p.list_type || 'sample_meter', min_quantity_meters: p.min_quantity_meters?.toString() || '', max_quantity_meters: p.max_quantity_meters?.toString() || '', price_per_meter: p.price_per_meter?.toString() || '', discount_percent: p.discount_percent?.toString() || '0', total_price: p.total_price || 0, final_price: p.final_price || 0, currency: p.currency || 'INR', remarks: p.remarks || '' }
    }));
  };

  const cancelEditPrice  = (id: number) => setEditingPriceRow(prev => { const n = { ...prev }; delete n[id]; return n; });
  const confirmUpdatePrice = async (id: number) => { const row = editingPriceRow[id]; if (!row) return; await handleUpdateSavedPrice(id, row); cancelEditPrice(id); };

  // ─────────────────────────────────────────────
  // SUB-COMPONENTS
  // ─────────────────────────────────────────────

  const TabLoader = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: '#6366f1' }}>
      <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}><Icon.Loader /></div>
      <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Loading saved data…</div>
    </div>
  );

  const renderDevAnalysisTab = (sr: SampleRecord) => (
    <div style={s.panelBody}>
      <div style={s.sectionTitle}>
        Development Analysis
        <span style={{ ...s.existsBadge, background: '#fef3c7', color: '#92400e' }}>+ Create New Record</span>
      </div>
      <div style={s.fabricInfo}>
        <div style={s.fabricInfoItem}><span style={s.fiLabel}>Fabric Code</span><span style={s.fiValue}>{sr.fabric_code}</span></div>
        <div style={s.fabricInfoItem}><span style={s.fiLabel}>Quality</span><span style={s.fiValue}>{sr.fabric_quality}</span></div>
        <div style={s.fabricInfoItem}><span style={s.fiLabel}>Color</span><span style={s.fiValue}>{sr.color}</span></div>
        <div style={s.fabricInfoItem}><span style={s.fiLabel}>Sample Type</span><span style={s.fiValue}>{sr.sample_type}</span></div>
      </div>
      <div style={s.daSection}>
        <div style={s.daSectionLabel}>🎨 Style Information</div>
        <div style={s.grid2} className="sr-grid2">
          <div style={s.fieldGroup}>
            <label style={s.label}>Style Number</label>
            <input style={s.input} placeholder="e.g. OXF-001" value={devAnalysisForm.style_number} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, style_number: e.target.value })} />
          </div>
        </div>
      </div>
      <div style={s.daSection}>
        <div style={s.daSectionLabel}>🏗 Construction Details</div>
        <div style={s.grid2} className="sr-grid2">
          <div style={s.fieldGroup}><label style={s.label}>Construction</label><input style={s.input} placeholder="e.g. 40×40 / 133×72" value={devAnalysisForm.construction} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, construction: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Blend</label><input style={s.input} placeholder="e.g. 60% Cotton, 40% Polyester" value={devAnalysisForm.blend} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, blend: e.target.value })} /></div>
          <div style={s.fieldGroup}>
            <label style={s.label}>GSM</label>
            <input style={s.input} type="text" placeholder="e.g. 180 or 135-140" value={devAnalysisForm.gsm} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, gsm: e.target.value })} />
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Weave Type</label>
            <select style={s.input} value={devAnalysisForm.weave_type} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, weave_type: e.target.value })}>
              {['plain','twill','satin','dobby','jacquard','oxford','canvas','crepe','other'].map(w => <option key={w} value={w}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div style={s.daSection}>
        <div style={s.daSectionLabel}>✨ Analyst Metadata</div>
        <div style={s.grid2} className="sr-grid2">
          <div style={s.fieldGroup}><label style={s.label}>Analyzed By</label><input style={s.input} placeholder="Analyst name" value={devAnalysisForm.analyzed_by} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, analyzed_by: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Analysis Date</label><input style={s.input} type="date" value={devAnalysisForm.analysis_date} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, analysis_date: e.target.value })} /></div>
        </div>
        <div style={{ ...s.fieldGroup, marginTop: 14 }}>
          <label style={s.label}>Remarks</label>
          <textarea style={s.textarea} placeholder="Additional notes…" value={devAnalysisForm.remarks} onChange={e => setDevAnalysisForm({ ...devAnalysisForm, remarks: e.target.value })} />
        </div>
      </div>
      <button style={{ ...s.saveProcess, opacity: processSaving ? 0.7 : 1 }} onClick={handleSaveDevAnalysis} disabled={processSaving}>
        {processSaving ? 'Saving…' : '✓ Save Development Analysis'}
      </button>
    </div>
  );

  const renderYardageTab = (sr: SampleRecord) => (
    <div style={s.panelBody}>
      {fetchingYardage ? <TabLoader /> : savedYardage.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.CheckCircle /> {savedYardage.length} Saved Yardage Record{savedYardage.length > 1 ? 's' : ''}
          </div>
          <div style={{ borderRadius: 10, border: '1px solid #d1fae5', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Type','MOQ (m)','MOQ (yd)','Price/m','Currency','Valid From','Valid Until','Actions'].map(h => <th key={h} style={{ ...s.pth, background: '#f0fdf4', color: '#15803d' }}>{h}</th>)}</tr></thead>
              <tbody>
                {savedYardage.map((y: any) => {
                  const isEditing = !!editingYardageRow[y.id];
                  const row = editingYardageRow[y.id] || y;
                  return (
                    <tr key={y.id} style={{ background: isEditing ? '#faf5ff' : undefined }}>
                      <td style={s.ptd}>{isEditing ? <select style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} value={row.order_type} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], order_type: e.target.value } }))}><option value="sample">🧵 Sample</option><option value="bulk">📦 Bulk</option></select> : <span style={{ ...s.listTypeBadge, background: y.order_type === 'bulk' ? '#dbeafe' : '#d1fae5', color: y.order_type === 'bulk' ? '#1d4ed8' : '#065f46' }}>{y.order_type === 'bulk' ? '📦 Bulk' : '🧵 Sample'}</span>}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 80 }} type="number" value={row.moq_meters} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], moq_meters: e.target.value } }))} /> : <b>{y.moq_meters}</b>}</td>
                      <td style={{ ...s.ptd, color: '#92400e' }}>{isEditing ? (row.moq_meters ? calcYardage(row.moq_meters) : '—') : (y.moq_yards != null ? fmtMoney(y.moq_yards, 3) : '—')}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 80 }} type="number" value={row.price_per_meter} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], price_per_meter: e.target.value } }))} /> : y.price_per_meter}</td>
                      <td style={s.ptd}>{isEditing ? <select style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} value={row.currency} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], currency: e.target.value } }))}><option>INR</option><option>USD</option><option>EUR</option></select> : y.currency}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} type="date" value={row.valid_from} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], valid_from: e.target.value } }))} /> : (y.valid_from?.slice(0,10) || '—')}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} type="date" value={row.valid_until} onChange={e => setEditingYardageRow(prev => ({ ...prev, [y.id]: { ...prev[y.id], valid_until: e.target.value } }))} /> : (y.valid_until?.slice(0,10) || '—')}</td>
                      <td style={s.ptd}><div style={{ display: 'flex', gap: 4 }}>{isEditing ? (<><button style={{ ...s.inlineEditBtn, background: '#d1fae5', color: '#065f46' }} onClick={() => confirmUpdateYardageRow(y.id)} disabled={processSaving}>✓ Save</button><button style={{ ...s.inlineEditBtn, background: '#f1f5f9', color: '#64748b' }} onClick={() => cancelEditYardageRow(y.id)}>✕</button></>) : (<><button style={{ ...s.inlineEditBtn, background: '#e0e7ff', color: '#4338ca' }} onClick={() => startEditYardageRow(y)}><Icon.Edit /> Edit</button><button style={{ ...s.inlineEditBtn, background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDeleteYardage(y.id)} disabled={processSaving}><Icon.Trash /> Del</button></>)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ ...s.priceFormBox, borderColor: '#e2e8f0', background: '#f8fafc' }}>
        <div style={s.sectionTitle}>Yardage MOQ Price<span style={{ ...s.existsBadge, background: '#fef3c7', color: '#92400e' }}>+ Create New Record</span></div>
        <div style={s.infoRow}><div style={s.infoChip}>Fabric: <b>{sr.fabric_code}</b></div><div style={s.infoChip}>Quality: <b>{sr.fabric_quality}</b></div></div>
        <div style={s.grid2} className="sr-grid2">
          <div style={s.fieldGroup}><label style={s.label}>Order Type</label><select style={s.input} value={yardageForm.order_type} onChange={e => setYardageForm({ ...yardageForm, order_type: e.target.value })}><option value="sample">Sample Order</option><option value="bulk">Bulk Order</option></select></div>
          <div style={s.fieldGroup}><label style={s.label}>Currency</label><select style={s.input} value={yardageForm.currency} onChange={e => setYardageForm({ ...yardageForm, currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option></select></div>
          <div style={s.fieldGroup}><label style={s.label}>MOQ (Meters)</label><input style={s.input} type="number" placeholder="Min order qty" value={yardageForm.moq_meters} onChange={e => setYardageForm({ ...yardageForm, moq_meters: e.target.value, moq_yards: parseFloat(e.target.value) * 1.09361 || 0 })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>MOQ (Yards) — Auto</label><input style={{ ...s.input, background: '#fffbeb', color: '#92400e' }} value={yardageForm.moq_meters ? calcYardage(yardageForm.moq_meters) : ''} readOnly placeholder="Auto-calculated" /></div>
          <div style={s.fieldGroup}><label style={s.label}>Price / Meter ({yardageForm.currency})</label><input style={s.input} type="number" placeholder="e.g. 450" value={yardageForm.price_per_meter} onChange={e => setYardageForm({ ...yardageForm, price_per_meter: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Price / Yard — Auto</label><input style={{ ...s.input, background: '#fffbeb', color: '#92400e' }} value={yardageForm.price_per_meter ? calcPricePerYard(yardageForm.price_per_meter) : ''} readOnly placeholder="Auto-calculated" /></div>
          <div style={s.fieldGroup}><label style={s.label}>Valid From</label><input style={s.input} type="date" value={yardageForm.valid_from} onChange={e => setYardageForm({ ...yardageForm, valid_from: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Valid Until</label><input style={s.input} type="date" value={yardageForm.valid_until} onChange={e => setYardageForm({ ...yardageForm, valid_until: e.target.value })} /></div>
        </div>
        {yardageForm.moq_meters && yardageForm.price_per_meter && (
          <div style={s.conversionCard}>
            <div style={s.convRow}><div style={s.convItem}><div style={s.convLabel}>MOQ Meters</div><div style={s.convValue}>{yardageForm.moq_meters} m</div></div><div style={s.convArrow}>⇄</div><div style={s.convItem}><div style={s.convLabel}>MOQ Yards</div><div style={s.convValue}>{calcYardage(yardageForm.moq_meters)} yd</div></div></div>
            <div style={s.convRow}><div style={s.convItem}><div style={s.convLabel}>Price / Meter</div><div style={s.convValue}>{yardageForm.currency} {yardageForm.price_per_meter}</div></div><div style={s.convArrow}>⇄</div><div style={s.convItem}><div style={s.convLabel}>Price / Yard</div><div style={s.convValue}>{yardageForm.currency} {calcPricePerYard(yardageForm.price_per_meter)}</div></div></div>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>
              Total MOQ Value: {yardageForm.currency} {fmtMoney(parseFloat(yardageForm.moq_meters) * parseFloat(yardageForm.price_per_meter))}
            </div>
          </div>
        )}
        <button style={{ ...s.saveProcess, opacity: processSaving ? 0.7 : 1, marginTop: 16 }} onClick={handleSaveYardage} disabled={processSaving}>
          {processSaving ? 'Saving…' : '✓ Save Yardage & MOQ'}
        </button>
      </div>
    </div>
  );

  const renderPriceTab = (sr: SampleRecord) => (
    <div style={s.panelBody}>
      {fetchingPrice ? <TabLoader /> : savedPrices.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.CheckCircle /> {savedPrices.length} Saved Price Entr{savedPrices.length > 1 ? 'ies' : 'y'}
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #d1fae5' }}>
            <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Type','Qty Range','Price/m','Discount','Final Price','Currency','Remarks','Actions'].map(h => <th key={h} style={{ ...s.pth, background: '#f0fdf4', color: '#15803d' }}>{h}</th>)}</tr></thead>
              <tbody>
                {savedPrices.map((p: any) => {
                  const isEditing = !!editingPriceRow[p.id];
                  const row = editingPriceRow[p.id] || p;
                  return (
                    <tr key={p.id} style={{ background: isEditing ? '#faf5ff' : undefined }}>
                      <td style={s.ptd}>{isEditing ? <select style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} value={row.list_type} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], list_type: e.target.value } }))}><option value="sample_meter">🧵 Sample</option><option value="bulk_order">📦 Bulk</option></select> : <span style={{ ...s.listTypeBadge, background: p.list_type === 'bulk_order' ? '#dbeafe' : '#d1fae5', color: p.list_type === 'bulk_order' ? '#1d4ed8' : '#065f46' }}>{p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}</span>}</td>
                      <td style={s.ptd}>{isEditing ? <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input style={{ ...s.input, padding: '4px 6px', fontSize: 12, width: 60 }} type="number" value={row.min_quantity_meters} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], min_quantity_meters: e.target.value } }))} /><span>–</span><input style={{ ...s.input, padding: '4px 6px', fontSize: 12, width: 60 }} type="number" value={row.max_quantity_meters} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], max_quantity_meters: e.target.value } }))} placeholder="∞" /><span style={{ fontSize: 11, color: '#94a3b8' }}>m</span></div> : `${p.min_quantity_meters}–${p.max_quantity_meters || '∞'} m`}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 80 }} type="number" value={row.price_per_meter} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], price_per_meter: e.target.value } }))} /> : p.price_per_meter}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12, width: 60 }} type="number" value={row.discount_percent} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], discount_percent: e.target.value } }))} /> : `${p.discount_percent}%`}</td>
                      <td style={{ ...s.ptd, fontWeight: 700, color: '#10b981' }}>{isEditing ? calcFinal(calcTotal(row.min_quantity_meters, row.price_per_meter), row.discount_percent).toFixed(2) : fmtMoney(p.final_price)}</td>
                      <td style={s.ptd}>{isEditing ? <select style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} value={row.currency} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], currency: e.target.value } }))}><option>INR</option><option>USD</option><option>EUR</option></select> : p.currency}</td>
                      <td style={s.ptd}>{isEditing ? <input style={{ ...s.input, padding: '4px 8px', fontSize: 12 }} value={row.remarks} onChange={e => setEditingPriceRow(prev => ({ ...prev, [p.id]: { ...prev[p.id], remarks: e.target.value } }))} placeholder="Remarks" /> : (p.remarks || '—')}</td>
                      <td style={s.ptd}><div style={{ display: 'flex', gap: 4 }}>{isEditing ? <><button style={{ ...s.inlineEditBtn, background: '#d1fae5', color: '#065f46' }} onClick={() => confirmUpdatePrice(p.id)} disabled={processSaving}>✓ Save</button><button style={{ ...s.inlineEditBtn, background: '#f1f5f9', color: '#64748b' }} onClick={() => cancelEditPrice(p.id)}>✕</button></> : <><button style={{ ...s.inlineEditBtn, background: '#e0e7ff', color: '#4338ca' }} onClick={() => startEditPrice(p)}><Icon.Edit /> Edit</button><button style={{ ...s.inlineEditBtn, background: deletingPriceId === p.id ? '#fca5a5' : '#fee2e2', color: '#dc2626' }} onClick={() => handleDeleteSavedPrice(p.id)} disabled={deletingPriceId === p.id}>{deletingPriceId === p.id ? '…' : <><Icon.Trash /> Del</>}</button></>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={s.priceFormBox}>
        <div style={s.sectionTitle}>Fabric Price List<span style={{ ...s.existsBadge, background: '#fef3c7', color: '#92400e' }}>+ Create New Entry</span></div>
        <div style={s.infoRow}><div style={s.infoChip}>Fabric: <b>{sr.fabric_code}</b></div><div style={s.infoChip}>Color: <b>{sr.color}</b></div></div>
        <div style={s.priceFormTitle}>+ Add New Price Entry</div>
        <div style={s.grid2} className="sr-grid2">
          <div style={s.fieldGroup}><label style={s.label}>List Type</label><select style={s.input} value={priceForm.list_type} onChange={e => setPriceForm({ ...priceForm, list_type: e.target.value })}><option value="sample_meter">Sample Meter</option><option value="bulk_order">Bulk Order</option></select></div>
          <div style={s.fieldGroup}><label style={s.label}>Currency</label><select style={s.input} value={priceForm.currency} onChange={e => setPriceForm({ ...priceForm, currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option></select></div>
          <div style={s.fieldGroup}><label style={s.label}>Min Qty (m)</label><input style={s.input} type="number" placeholder="From meters" value={priceForm.min_quantity_meters} onChange={e => setPriceForm({ ...priceForm, min_quantity_meters: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Max Qty (m)</label><input style={s.input} type="number" placeholder="Up to meters" value={priceForm.max_quantity_meters} onChange={e => setPriceForm({ ...priceForm, max_quantity_meters: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Price / Meter</label><input style={s.input} type="number" placeholder="e.g. 380" value={priceForm.price_per_meter} onChange={e => setPriceForm({ ...priceForm, price_per_meter: e.target.value })} /></div>
          <div style={s.fieldGroup}><label style={s.label}>Discount (%)</label><input style={s.input} type="number" placeholder="0" value={priceForm.discount_percent} onChange={e => setPriceForm({ ...priceForm, discount_percent: e.target.value })} /></div>
        </div>
        <div style={s.fieldGroup}><label style={s.label}>Remarks</label><input style={s.input} placeholder="Notes on this price tier" value={priceForm.remarks} onChange={e => setPriceForm({ ...priceForm, remarks: e.target.value })} /></div>
        {priceForm.min_quantity_meters && priceForm.price_per_meter && (
          <div style={s.calcPreview}>
            Total: <b>{priceForm.currency} {calcTotal(priceForm.min_quantity_meters, priceForm.price_per_meter).toFixed(2)}</b>
            <span style={{ margin: '0 12px', color: '#cbd5e1' }}>|</span>
            After {priceForm.discount_percent}% discount: <b style={{ color: '#10b981' }}>{priceForm.currency} {calcFinal(calcTotal(priceForm.min_quantity_meters, priceForm.price_per_meter), priceForm.discount_percent).toFixed(2)}</b>
          </div>
        )}
        <button style={s.addRowBtn} onClick={addPriceRow}>＋ Add to Pending List</button>
      </div>
      {priceList.length > 0 && (
        <div style={s.priceTable}>
          <div style={s.priceTableHeader}>Pending to Save ({priceList.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Type','Qty Range','Price/m','Disc','Total','Final','Remarks',''].map(h => <th key={h} style={s.pth}>{h}</th>)}</tr></thead>
              <tbody>
                {priceList.map((p, i) => (
                  <tr key={i}>
                    <td style={s.ptd}><span style={{ ...s.listTypeBadge, background: p.list_type === 'bulk_order' ? '#dbeafe' : '#d1fae5', color: p.list_type === 'bulk_order' ? '#1d4ed8' : '#065f46' }}>{p.list_type === 'bulk_order' ? '📦 Bulk' : '🧵 Sample'}</span></td>
                    <td style={s.ptd}>{p.min_quantity_meters}–{p.max_quantity_meters} m</td>
                    <td style={s.ptd}>{p.currency} {p.price_per_meter}</td>
                    <td style={s.ptd}>{p.discount_percent}%</td>
                    <td style={s.ptd}>{p.currency} {fmtMoney(p.total_price)}</td>
                    <td style={{ ...s.ptd, fontWeight: 700, color: '#10b981' }}>{p.currency} {fmtMoney(p.final_price)}</td>
                    <td style={s.ptd}>{p.remarks || '—'}</td>
                    <td style={s.ptd}><button style={{ ...s.inlineEditBtn, background: '#fee2e2', color: '#dc2626' }} onClick={() => setPriceList(l => l.filter((_, idx) => idx !== i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {priceList.length > 0 && (
        <button style={{ ...s.saveProcess, opacity: processSaving ? 0.7 : 1 }} onClick={handleSavePriceList} disabled={processSaving}>
          {processSaving ? 'Saving…' : `✓ Save ${priceList.length} Price Entr${priceList.length > 1 ? 'ies' : 'y'}`}
        </button>
      )}
    </div>
  );

  const renderChatTab = (sr: SampleRecord) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: 520 }}>
      <div style={{ padding: '0 28px 0', flexShrink: 0 }}>
        <div style={s.infoRow}>
          <div style={s.infoChip}>Fabric: <b>{sr.fabric_code}</b></div>
          <div style={s.infoChip}>Customer: <b>{sr.customer_name}</b></div>
          <div style={s.infoChip}>Status: <b>{STATUS_META[sr.status]?.label || sr.status}</b></div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: '#64748b' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#6366f1', marginRight: 4 }} />Admin (you)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#dbeafe', border: '1px solid #93c5fd', marginRight: 4 }} />Customer</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ede9fe', border: '1px solid #c4b5fd', marginRight: 4 }} />AI Bot</span>
        </div>
      </div>
      <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '0 28px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, gap: 8, padding: 40 }}>
            <span style={{ fontSize: 40 }}>💬</span>
            <div style={{ fontWeight: 600 }}>No messages yet</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id ?? i} style={{ display: 'flex', justifyContent: m.sender === 'admin' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
            {m.sender !== 'admin' && (
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: m.sender === 'bot' ? '#ede9fe' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, marginRight: 8, alignSelf: 'flex-end' }}>
                {m.sender === 'bot' ? '🤖' : '👤'}
              </div>
            )}
            <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: m.sender === 'admin' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.sender === 'admin' ? '#6366f1' : m.sender === 'bot' ? '#f5f3ff' : '#f1f5f9', color: m.sender === 'admin' ? '#fff' : '#1e293b', fontSize: 14, lineHeight: 1.55, boxShadow: m.sender === 'admin' ? '0 2px 8px rgba(99,102,241,0.25)' : '0 1px 4px rgba(0,0,0,0.06)' }}>
              {m.sender !== 'admin' && <div style={{ fontSize: 10, fontWeight: 700, color: m.sender === 'bot' ? '#7c3aed' : '#374151', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.sender === 'bot' ? 'AI Bot' : 'Customer'}</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
              <div style={{ fontSize: 10, marginTop: 5, opacity: 0.6, textAlign: 'right' }}>{m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
            </div>
            {m.sender === 'admin' && <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, marginLeft: 8, alignSelf: 'flex-end' }}>{(admin.name || 'A').charAt(0).toUpperCase()}</div>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ flexShrink: 0, padding: '12px 28px 20px', borderTop: '1px solid #f1f5f9', background: '#fff', display: 'flex', gap: 10 }}>
        <input style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} placeholder="Type a message as admin…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminMessage(sr.id); } }} disabled={chatLoading} />
        <button style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: chatLoading || !chatInput.trim() ? '#c7d2fe' : '#6366f1', color: '#fff', cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => sendAdminMessage(sr.id)} disabled={chatLoading || !chatInput.trim()}>
          <Icon.Send /> {chatLoading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bellRing { 0%,100% { transform: rotate(0); } 20% { transform: rotate(15deg); } 40% { transform: rotate(-12deg); } 60% { transform: rotate(10deg); } 80% { transform: rotate(-8deg); } }
        @keyframes bellPulse { 0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.5); } 70% { box-shadow: 0 0 0 8px rgba(99,102,241,0); } 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); } }
        @keyframes deletePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }
        @keyframes menuSlideIn { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes orderSlideIn { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes successBounce { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes exportDdSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        .sr-ob-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:visible; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:28px; }
        .sr-ob-table { width:100%; border-collapse:collapse; font-size:13px; }
        .sr-ob-table thead tr { background:#2563eb; }
        .sr-ob-table th { padding:12px 16px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:13px; }
        .sr-ob-table th.th-center { text-align:center; }
        .sr-ob-table tbody tr:nth-child(odd) td { background:#fff; }
        .sr-ob-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .sr-ob-table tbody tr { transition:filter 0.1s; }
        .sr-ob-table tbody tr:hover td { filter:brightness(0.97); }
        .sr-ob-table td { padding:11px 16px; color:#374151; white-space:nowrap; font-size:13px; border-bottom:none; vertical-align:middle; }
        .sr-ob-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:13px; color:#64748b; flex-wrap:wrap; gap:10px; }
        .sr-ob-pag-btns { display:flex; gap:4px; align-items:center; }
        .sr-ob-pag-btn { padding:5px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:13px; color:#1e293b; min-width:32px; height:32px; display:flex; align-items:center; justify-content:center; transition:all 0.12s; font-family:inherit; }
        .sr-ob-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .sr-ob-pag-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; font-weight:700; }
        .sr-ob-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }
        .sr-ob-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
        .sr-ob-search-wrap { position:relative; flex:1; min-width:220px; max-width:400px; }
        .sr-ob-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none; }
        .sr-ob-search { width:100%; padding:8px 14px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff; color:#1e293b; outline:none; transition:border 0.15s; font-family:inherit; box-sizing:border-box; }
        .sr-ob-search:focus { border-color:#2563eb; }
        .sr-ob-rec-count { font-size:13px; color:#64748b; white-space:nowrap; }
        .sr-ob-page-size { display:flex; align-items:center; gap:8px; font-size:13px; color:#64748b; margin-left:auto; }
        .sr-ob-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; background:#fff; cursor:pointer; outline:none; font-family:inherit; }
        .sr-ob-proc-btn { display:inline-flex; align-items:center; gap:3px; padding:4px 8px; border-radius:6px; border:1.5px solid; background:transparent; cursor:pointer; font-size:11px; font-weight:700; transition:all .15s; white-space:nowrap; position:relative; font-family:inherit; }
        .sr-ob-proc-btn:hover { opacity:0.8; transform:translateY(-1px); }
        .row-menu-btn:hover { background:#f1f5f9 !important; border-color:#cbd5e1 !important; }
        .sr-delete-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:1300; padding:20px; backdrop-filter:blur(3px); }
        .sr-delete-modal { background:#fff; border-radius:18px; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,0.25); animation:fadeSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1); overflow:hidden; }
        .sr-delete-modal-header { padding:24px 24px 0; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px; }
        .sr-delete-icon-wrap { width:60px; height:60px; border-radius:16px; background:linear-gradient(135deg,#fef2f2,#fee2e2); border:2px solid #fecaca; display:flex; align-items:center; justify-content:center; color:#dc2626; animation:deletePulse 2s ease-in-out infinite; }
        .sr-delete-modal-body { padding:16px 24px 20px; text-align:center; }
        .sr-delete-modal-title { font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px; }
        .sr-delete-modal-subtitle { font-size:14px; color:#64748b; line-height:1.5; margin:0 0 14px; }
        .sr-delete-modal-code { display:inline-flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 16px; margin-bottom:6px; }
        .sr-delete-modal-code-text { font-size:15px; font-weight:800; color:#1e293b; }
        .sr-delete-error { background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; padding:8px 12px; color:#dc2626; font-size:13px; font-weight:600; margin-top:10px; text-align:left; }
        .sr-delete-modal-footer { display:flex; gap:10px; padding:0 24px 24px; }
        .sr-delete-cancel-btn { flex:1; padding:11px; border:1.5px solid #e2e8f0; background:#f8fafc; border-radius:10px; font-size:14px; font-weight:600; color:#475569; cursor:pointer; font-family:inherit; }
        .sr-delete-confirm-btn { flex:1; padding:11px; border:none; background:linear-gradient(135deg,#dc2626,#b91c1c); border-radius:10px; font-size:14px; font-weight:700; color:#fff; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:6px; }
        .sr-delete-confirm-btn:hover:not(:disabled) { background:linear-gradient(135deg,#b91c1c,#991b1b); }
        .sr-delete-confirm-btn:disabled { opacity:0.65; cursor:not-allowed; }
        .sr-edit-tab-btn:hover { background:#f1f5f9 !important; }
        .sr-edit-tab-btn.active { background:#6366f1 !important; color:#fff !important; border-color:#6366f1 !important; }
        .chat-messages::-webkit-scrollbar { width:4px; }
        .chat-messages::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px; }
        .bell-ringing { animation:bellRing 0.6s ease-in-out; }
        .bell-pulse { animation:bellPulse 1.5s ease-out infinite; }
        .notif-item:hover { background:#f0f4ff !important; }
        .success-icon-bounce { animation: successBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .success-stay-btn:hover { background:#f1f5f9 !important; }
        .success-go-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .sr-export-item:hover { background:#eff6ff !important; }
        @media(max-width:768px) {
          .sr-page { padding:14px !important; }
          .sr-topbar { flex-direction:column !important; align-items:flex-start !important; gap:12px !important; }
          .sr-process-bar { display:none !important; }
          .sr-table-wrap { overflow-x:auto !important; }
          .sr-ob-table { min-width:920px; }
          .sr-panel { max-width:100% !important; width:100% !important; }
          .sr-edit-modal { max-width:100% !important; margin:8px !important; border-radius:12px !important; min-width:unset !important; }
          .sr-grid2 { grid-template-columns:1fr !important; }
          .sr-ob-toolbar { flex-wrap:wrap; }
          .sr-ob-page-size { margin-left:0; }
          .sr-ob-pagination { flex-direction:column; align-items:flex-start; }
          .sr-edit-tabs { overflow-x:auto; }
        }
        @media(max-width:480px) {
          .sr-procbtn-label { display:none; }
          .sr-top-title { font-size:20px !important; }
          .sr-edit-tab-label { display:none; }
        }
      `}</style>

      <div style={s.page} className="sr-page">

        {/* ══ TOP HEADER ══ */}
        <div style={s.topBar} className="sr-topbar">
          <div>
            <h1 style={s.topTitle} className="sr-top-title">Analysis Pipeline</h1>
            <div style={s.topLabel}>FABRIC DEVELOPMENT</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* ── Bell notifications ── */}
            <div ref={bellRef} style={{ position: 'relative' }}>
              <button
                style={{ position: 'relative', width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: bellUnreadCount > 0 ? '#ede9fe' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: bellUnreadCount > 0 ? '#6366f1' : '#64748b', transition: 'all .2s' }}
                className={bellUnreadCount > 0 ? 'bell-pulse' : ''}
                onClick={() => setBellOpen(o => !o)}
                title="Notifications"
              >
                <span className={bellUnreadCount > 0 ? 'bell-ringing' : ''} style={{ display: 'flex' }}><Icon.Bell /></span>
                {bellUnreadCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, border: '2px solid #fff' }}>
                    {bellUnreadCount > 9 ? '9+' : bellUnreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <BellNotificationPanel
                  notifications={bellNotifications}
                  onMarkRead={markBellRead}
                  onMarkAllRead={markAllBellRead}
                  onOpenChat={handleBellOpenChat}
                  onClose={() => setBellOpen(false)}
                />
              )}
            </div>

            {/* ── Export dropdown ── */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#fff', color: '#2563eb',
                  border: '1.5px solid #bfdbfe', borderRadius: 10,
                  padding: '9px 14px', fontSize: 13, fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', opacity: exporting ? 0.6 : 1,
                  fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
                }}
                onClick={() => !exporting && setExportOpen(o => !o)}
                disabled={exporting}
              >
                {exporting
                  ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  : <Icon.Download />}
                Export
                <span style={{ display: 'flex', transition: 'transform 0.2s', transform: exportOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <Icon.ChevronDown />
                </span>
              </button>

              {exportOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  minWidth: 210, background: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 12,
                  boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                  zIndex: 500, padding: 6,
                  animation: 'exportDdSlide 0.15s ease',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 10px 4px' }}>
                    Export / Print
                  </div>
                  {[
                    { label: 'Export as CSV',   icon: '📄', bg: '#f3f0ff', color: '#7c3aed', action: handleExportCSV },
                    { label: 'Export as Excel', icon: '📊', bg: '#f0fdf4', color: '#16a34a', action: handleExportExcel },
                    { label: 'Print Table',     icon: '🖨️', bg: '#eff6ff', color: '#1a56db', action: handlePrintTable },
                  ].map(item => (
                    <button
                      key={item.label}
                      className="sr-export-item"
                      onClick={item.action}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        width: '100%', background: 'none', border: 'none',
                        padding: '9px 10px', borderRadius: 8,
                        fontSize: 13, fontWeight: 500, color: '#1a2332',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: 7, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── New Request button ── */}
            <button style={s.newBtn} onClick={() => { setNewForm(emptyForm); setNewImageFile(null); setNewImagePreview(null); setNewError(null); setNewModalOpen(true); }}>
              <Icon.Plus /> New Request
            </button>

          </div>
        </div>

        {/* ══ PROCESS LEGEND ══ */}
        <div style={s.processBar} className="sr-process-bar">
          {PROCESS_STEPS.map((p, i) => (
            <React.Fragment key={p.id}>
              <div style={s.processStep}>
                <div style={{ ...s.processIcon, background: p.bg, color: p.color }}><p.IconEl /></div>
                <div>
                  <div style={s.processNum}>Process {p.id}</div>
                  <div style={s.processLabel}>{p.label}</div>
                </div>
              </div>
              {i < PROCESS_STEPS.length - 1 && <div style={s.processArrow}><Icon.ArrowRight /></div>}
            </React.Fragment>
          ))}
        </div>

        {/* ══ TOOLBAR ══ */}
        <div className="sr-ob-toolbar">
          <div className="sr-ob-search-wrap">
            <Icon.Search />
            <input className="sr-ob-search" placeholder="Search by code, customer, fabric, color, status…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <span className="sr-ob-rec-count">
            {filteredRecords.length === records.length ? `${records.length} record(s)` : `${filteredRecords.length} of ${records.length} record(s)`}
          </span>
          <div className="sr-ob-page-size">
            <span>Show</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* ══ TABLE ══ */}
        {loading ? (
          <div style={s.loadingBox}>
            <div style={{ color: '#6366f1', animation: 'spin 1s linear infinite', display: 'flex', justifyContent: 'center' }}><Icon.Loader /></div>
            <div style={{ marginTop: 12, color: '#64748b' }}>Loading requests…</div>
          </div>
        ) : (
          <div className="sr-ob-card">
            <div
              className="sr-table-wrap"
              style={{
                overflowX: 'auto',
                overflowY: 'visible',
                scrollbarWidth: 'thin',
                scrollbarColor: '#c7d3e8 transparent',
                borderRadius: '12px',
              }}
            >
              <table className="sr-ob-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Image</th>
                    <th>Code</th>
                    <th>Customer</th>
                    {/* ── NEW: Customer Code column ── */}
                    <th>Cust. Code</th>
                    <th>Type</th>
                    <th>Fabric / Quality</th>
                    <th>Color</th>
                    <th>Qty (m)</th>
                    <th>Status</th>
                    <th>Process Actions</th>
                    <th className="th-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: '50px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        {searchQuery ? `No results for "${searchQuery}"` : 'No sample requests found'}
                      </td>
                    </tr>
                  ) : (
                    pagedRecords.map((r, idx) => {
                      const meta        = STATUS_META[r.status] || { color: '#374151', bg: '#f3f4f6', dot: '#94a3b8', label: r.status };
                      const unreadCount = unread[r.id] || 0;
                      const custCode    = resolveCustomerCode(r);
                      return (
                        <tr key={r.id}>
                          <td style={{ color: '#94a3b8', fontWeight: 500 }}>{pageStart + idx + 1}</td>
                          <td>
                            {r.image_url ? (
                              <img src={r.image_url.startsWith('http') ? r.image_url : `${BASE_URL}${r.image_url}`} alt="fabric" style={s.thumb} />
                            ) : (
                              <div style={s.noImg}><Icon.Fabric /></div>
                            )}
                          </td>
                          <td><div style={s.code}>{r.request_code}</div><div style={s.sub}>{r.created_at?.slice(0, 10)}</div></td>
                          <td><div style={s.name}>{r.customer_name}</div><div style={s.sub}>{r.agent_name}</div></td>

                          {/* ── NEW: Customer Code cell ── */}
                          <td>
                            {custCode
                              ? <span style={{
                                  fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700,
                                  color: '#0f766e', background: '#f0fdf4',
                                  border: '1px solid #86efac', borderRadius: 5,
                                  padding: '2px 7px', display: 'inline-block', whiteSpace: 'nowrap',
                                }}>{custCode}</span>
                              : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                          </td>

                          <td>
                            <span style={{ ...s.typeBadge, ...(r.sample_type === 'parcel' ? s.typePart : s.typeWA) }}>
                              {r.sample_type === 'parcel' ? <><Icon.Package /> Parcel</> : <>💬 WhatsApp</>}
                            </span>
                          </td>
                          <td><div style={s.name}>{r.fabric_code}</div><div style={s.sub}>{r.fabric_quality}</div></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 14, height: 14, borderRadius: '50%', background: r.color?.toLowerCase() === 'white' ? '#f1f5f9' : r.color?.toLowerCase() || '#e2e8f0', border: '1.5px solid #e2e8f0', flexShrink: 0 }} />
                              <span style={{ fontSize: 13 }}>{r.color}</span>
                            </div>
                          </td>
                          <td><div style={s.qty}>{r.quantity_meters}<span style={s.unit}> m</span></div></td>
                          <td>
                            <span style={{ ...s.statusBadge, color: meta.color, background: meta.bg }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: meta.dot, marginRight: 5 }} />
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap' }}>
                              {PROCESS_STEPS.map(p => (
                                <button key={p.id} className="sr-ob-proc-btn" style={{ borderColor: p.color, color: p.color }} onClick={() => openProcess(r, p.id)} title={p.id === 4 ? 'Chat' : `Process ${p.id}: ${p.label}`}>
                                  <p.IconEl />
                                  <span className="sr-procbtn-label">{p.id === 4 ? 'Chat' : `P${p.id}`}</span>
                                  {p.id === 4 && unreadCount > 0 && <span style={s.unreadDot}>{unreadCount}</span>}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <RowMenu
                                record={r}
                                onReport={() => setReportRecord(r)}
                                onEdit={() => navigate(`/admin/development-process/edit/${r.request_code}`)}
                                onDelete={() => openDeleteConfirm(r)}
                                onConvertToOrder={() => openOrderBooking(r)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredRecords.length > 0 && (
              <div className="sr-ob-pagination">
                <span>Page {safePage} of {totalPages} &nbsp;·&nbsp; Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filteredRecords.length)} of {filteredRecords.length} record(s)</span>
                <div className="sr-ob-pag-btns">
                  <button className="sr-ob-pag-btn" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>«</button>
                  <button className="sr-ob-pag-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>← Prev</button>
                  {getPageNumbers().map((pg, idx) =>
                    pg === '...' ? (
                      <span key={`e-${idx}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: 14 }}>…</span>
                    ) : (
                      <button key={pg} className={`sr-ob-pag-btn${safePage === pg ? ' active' : ''}`} onClick={() => setCurrentPage(pg as number)}>{pg}</button>
                    )
                  )}
                  <button className="sr-ob-pag-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next →</button>
                  <button className="sr-ob-pag-btn" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>»</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ DELETE CONFIRMATION MODAL ══ */}
        {deleteTarget && (
          <div className="sr-delete-overlay" onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}>
            <div className="sr-delete-modal">
              <div className="sr-delete-modal-header">
                <div className="sr-delete-icon-wrap"><Icon.AlertTriangle /></div>
              </div>
              <div className="sr-delete-modal-body">
                <h3 className="sr-delete-modal-title">Delete Sample Request?</h3>
                <p className="sr-delete-modal-subtitle">This action is permanent and cannot be undone. All associated data will be removed.</p>
                <div className="sr-delete-modal-code">
                  <span style={{ fontSize: 20 }}>🧵</span>
                  <div>
                    <div className="sr-delete-modal-code-text">{deleteTarget.request_code}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{deleteTarget.customer_name} · {deleteTarget.fabric_code}</div>
                  </div>
                </div>
                {deleteError && <div className="sr-delete-error">⚠ {deleteError}</div>}
              </div>
              <div className="sr-delete-modal-footer">
                <button className="sr-delete-cancel-btn" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>Cancel</button>
                <button className="sr-delete-confirm-btn" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? (<><span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex' }}><Icon.Loader /></span> Deleting…</>) : (<><Icon.Trash /> Yes, Delete</>)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ QUICK-ACCESS PROCESS PANEL ══ */}
        {activeSR && activeProcess && (
          <div style={s.panelOverlay} onClick={closeProcess}>
            <div style={s.panel} className="sr-panel" onClick={e => e.stopPropagation()}>
              <div style={s.panelHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: PROCESS_STEPS[activeProcess - 1].bg, color: PROCESS_STEPS[activeProcess - 1].color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {React.createElement(PROCESS_STEPS[activeProcess - 1].IconEl)}
                  </div>
                  <div>
                    <div style={s.panelSub}>Process {activeProcess}</div>
                    <div style={s.panelTitle}>{PROCESS_STEPS[activeProcess - 1].label}</div>
                    <div style={s.panelCode}>{activeSR.request_code} · {activeSR.customer_name}</div>
                  </div>
                </div>
                <button style={s.panelClose} onClick={closeProcess}><Icon.X /></button>
              </div>
              {processSuccess && <div style={s.successMsg}><Icon.CheckCircle /> {processSuccess}</div>}
              {processError   && <div style={s.errorMsg}><Icon.AlertCircle /> {processError}</div>}
              {activeProcess === 1 && renderDevAnalysisTab(activeSR)}
              {activeProcess === 2 && renderYardageTab(activeSR)}
              {activeProcess === 3 && renderPriceTab(activeSR)}
              {activeProcess === 4 && renderChatTab(activeSR)}
            </div>
          </div>
        )}

        {/* ══ FULL EDIT MODAL ══ */}
        {editModalOpen && editRecord && (
          <div style={s.overlay} onClick={closeEditModal}>
            <div className="sr-edit-modal" style={s.editModal} onClick={e => e.stopPropagation()}>
              <div style={s.editModalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {editRecord.image_url ? (
                    <img src={editRecord.image_url.startsWith('http') ? editRecord.image_url : `${BASE_URL}${editRecord.image_url}`} alt="fabric" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, background: '#f1f5f9', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}><Icon.Fabric /></div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Edit Request</div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{editRecord.request_code}</h3>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{editRecord.customer_name} · {editRecord.fabric_code}</div>
                  </div>
                </div>
                <button style={s.closeBtn} onClick={closeEditModal}><Icon.X /></button>
              </div>

              <div style={s.editTabBar} className="sr-edit-tabs">
                {EDIT_TABS.map(tab => {
                  const isActive    = activeEditTab === tab.id;
                  const unreadCount = tab.id === 4 ? (unread[editRecord.id] || 0) : 0;
                  const stepColor   = tab.id === 0 ? '#6366f1' : PROCESS_STEPS[tab.id - 1]?.color || '#6366f1';
                  return (
                    <button
                      key={tab.id}
                      className={`sr-edit-tab-btn${isActive ? ' active' : ''}`}
                      style={{ ...s.editTabBtn, background: isActive ? '#6366f1' : 'transparent', color: isActive ? '#fff' : '#475569', borderColor: isActive ? '#6366f1' : '#e2e8f0', position: 'relative' }}
                      onClick={() => switchEditTab(tab.id, editRecord ?? undefined)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', color: isActive ? '#fff' : stepColor }}><tab.IconEl /></span>
                      <span className="sr-edit-tab-label" style={{ marginLeft: 6, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
                      {unreadCount > 0 && <span style={{ ...s.unreadDot, top: -4, right: -4 }}>{unreadCount}</span>}
                    </button>
                  );
                })}
              </div>

              {activeEditTab > 0 && processSuccess && (
                <div style={{ ...s.successMsg, margin: 0, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Icon.CheckCircle /> {processSuccess}</div>
              )}
              {activeEditTab > 0 && processError && (
                <div style={{ ...s.errorMsg, margin: 0, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Icon.AlertCircle /> {processError}</div>
              )}

              <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 180px)' }}>
                {activeEditTab === 0 && (
                  <div>
                    {error && <div style={s.errorBox}>{error}</div>}
                    {processSuccess && <div style={{ ...s.successMsg, margin: '12px 28px 0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Icon.CheckCircle /> {processSuccess}</div>}
                    <form onSubmit={handleUpdateRequest}>
                      <div style={s.formSection}>
                        <div style={s.formSectionLabel}>Request Info</div>
                        <div style={s.grid2} className="sr-grid2">
                          <div style={s.fieldGroup}><label style={s.label}>Request Code *</label><input style={s.input} placeholder="SR-2024-001" value={form.request_code} onChange={e => setForm({ ...form, request_code: e.target.value })} required /></div>
                          <div style={s.fieldGroup}><label style={s.label}>Sample Type</label><select style={s.input} value={form.sample_type} onChange={e => setForm({ ...form, sample_type: e.target.value })}><option value="parcel">📦 Parcel</option><option value="whatsapp">💬 WhatsApp</option></select></div>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Customer Name *</label>
                            <CustomerSelect value={form.customer_name} agentValue={form.agent_name} onChange={(name, agentName, customerId) => setForm({ ...form, customer_name: name, customer_id: customerId, agent_name: agentName || form.agent_name })} customers={customers} loading={customersLoading} required />
                            {form.customer_name && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 3 }}>✓ <b>{form.customer_name}</b></div>}
                          </div>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Agent Name</label>
                            <AgentSelect value={form.agent_name} onChange={name => setForm({ ...form, agent_name: name })} agents={agents} loading={agentsLoading} />
                            {form.agent_name && <div style={{ fontSize: 11, color: '#15803d', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Icon.User /> <b>{form.agent_name}</b></div>}
                          </div>
                        </div>
                      </div>
                      <div style={s.formSection}>
                        <div style={s.formSectionLabel}>Fabric Details</div>
                        <div style={s.grid2} className="sr-grid2">
                          <div style={s.fieldGroup}><label style={s.label}>Fabric Code</label><input style={s.input} placeholder="e.g. FB-001" value={form.fabric_code} onChange={e => setForm({ ...form, fabric_code: e.target.value })} /></div>
                          <div style={s.fieldGroup}><label style={s.label}>Fabric Quality</label><input style={s.input} placeholder="e.g. 100% Cotton" value={form.fabric_quality} onChange={e => setForm({ ...form, fabric_quality: e.target.value })} /></div>
                          <div style={s.fieldGroup}><label style={s.label}>Color</label><input style={s.input} placeholder="e.g. Navy Blue" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></div>
                          <div style={s.fieldGroup}><label style={s.label}>Quantity (Meters)</label><input style={s.input} type="number" placeholder="e.g. 50" value={form.quantity_meters} onChange={e => setForm({ ...form, quantity_meters: e.target.value })} /></div>
                        </div>
                      </div>
                      <div style={s.formSection}>
                        <div style={s.formSectionLabel}>Status & Notes</div>
                        <div style={s.fieldGroup}><label style={s.label}>Status</label><select style={s.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select></div>
                        <div style={{ ...s.fieldGroup, marginTop: 14 }}><label style={s.label}>Customer Comments</label><textarea style={s.textarea} placeholder="Customer requirements or comments..." value={form.customer_comments} onChange={e => setForm({ ...form, customer_comments: e.target.value })} /></div>
                      </div>
                      <div style={s.formSection}>
                        <div style={s.formSectionLabel}>Fabric Image</div>
                        {imagePreview ? (
                          <div style={s.previewWrap}>
                            <img src={imagePreview} alt="preview" style={s.preview} />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <label style={s.changeBtn}>Change<input type="file" hidden onChange={handleImageChange} /></label>
                              <button type="button" style={s.removeBtn} onClick={() => { setImageFile(null); setImagePreview(null); setRemoveImage(true); }}>Remove</button>
                            </div>
                          </div>
                        ) : (
                          <label style={s.dropzone}>
                            <input type="file" hidden onChange={handleImageChange} />
                            <div style={{ color: '#6366f1' }}><Icon.Image /></div>
                            <div style={{ fontWeight: 600, marginTop: 8 }}>Click to Upload Fabric Image</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>JPG, PNG, WEBP or GIF · Max 5MB</div>
                          </label>
                        )}
                      </div>
                      <div style={s.modalFooter}>
                        <button type="button" style={s.cancelBtn} onClick={closeEditModal}>Cancel</button>
                        <button type="submit" style={s.submitBtn} disabled={submitting}>{submitting ? 'Saving…' : '↻ Update Request'}</button>
                      </div>
                    </form>
                  </div>
                )}
                {activeEditTab === 1 && renderDevAnalysisTab(editRecord)}
                {activeEditTab === 2 && renderYardageTab(editRecord)}
                {activeEditTab === 3 && renderPriceTab(editRecord)}
                {activeEditTab === 4 && renderChatTab(editRecord)}
              </div>
            </div>
          </div>
        )}

        {/* ══ NEW REQUEST MODAL ══ */}
        {newModalOpen && (
          <div style={s.overlay} onClick={() => setNewModalOpen(false)}>
            <div style={s.modal} className="sr-modal" onClick={e => e.stopPropagation()}>
              <div style={s.modalHeader}>
                <div>
                  <div style={{ fontSize: 12, color: '#6366f1', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>New Request</div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Create Sample Request</h3>
                </div>
                <button style={s.closeBtn} onClick={() => setNewModalOpen(false)}><Icon.X /></button>
              </div>
              {newError && <div style={s.errorBox}>{newError}</div>}
              <form onSubmit={handleCreateRequest}>
                <div style={s.formSection}>
                  <div style={s.formSectionLabel}>Request Info</div>
                  <div style={s.grid2} className="sr-grid2">
                    <div style={s.fieldGroup}><label style={s.label}>Request Code *</label><input style={s.input} placeholder="SR-2024-001" value={newForm.request_code} onChange={e => setNewForm({ ...newForm, request_code: e.target.value })} required /></div>
                    <div style={s.fieldGroup}><label style={s.label}>Sample Type</label><select style={s.input} value={newForm.sample_type} onChange={e => setNewForm({ ...newForm, sample_type: e.target.value })}><option value="parcel">📦 Parcel</option><option value="whatsapp">💬 WhatsApp</option></select></div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Customer Name *</label>
                      <CustomerSelect value={newForm.customer_name} agentValue={newForm.agent_name} onChange={(name, agentName, customerId) => setNewForm({ ...newForm, customer_name: name, customer_id: customerId, agent_name: agentName || newForm.agent_name })} customers={customers} loading={customersLoading} required />
                      {newForm.customer_name && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>✓ Selected: <b>{newForm.customer_name}</b></div>}
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Agent Name</label>
                      <AgentSelect value={newForm.agent_name} onChange={name => setNewForm({ ...newForm, agent_name: name })} agents={agents} loading={agentsLoading} />
                      {newForm.agent_name && <div style={{ fontSize: 11, color: '#15803d', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Icon.User />Agent: <b>{newForm.agent_name}</b></div>}
                    </div>
                  </div>
                </div>
                <div style={s.formSection}>
                  <div style={s.formSectionLabel}>Fabric Details</div>
                  <div style={s.grid2} className="sr-grid2">
                    <div style={s.fieldGroup}><label style={s.label}>Fabric Code</label><input style={s.input} placeholder="e.g. FB-001" value={newForm.fabric_code} onChange={e => setNewForm({ ...newForm, fabric_code: e.target.value })} /></div>
                    <div style={s.fieldGroup}><label style={s.label}>Fabric Quality</label><input style={s.input} placeholder="e.g. 100% Cotton" value={newForm.fabric_quality} onChange={e => setNewForm({ ...newForm, fabric_quality: e.target.value })} /></div>
                    <div style={s.fieldGroup}><label style={s.label}>Color</label><input style={s.input} placeholder="e.g. Navy Blue" value={newForm.color} onChange={e => setNewForm({ ...newForm, color: e.target.value })} /></div>
                    <div style={s.fieldGroup}><label style={s.label}>Quantity (Meters)</label><input style={s.input} type="number" placeholder="e.g. 50" value={newForm.quantity_meters} onChange={e => setNewForm({ ...newForm, quantity_meters: e.target.value })} /></div>
                  </div>
                </div>
                <div style={s.formSection}>
                  <div style={s.formSectionLabel}>Status & Notes</div>
                  <div style={s.fieldGroup}><label style={s.label}>Status</label><select style={s.input} value={newForm.status} onChange={e => setNewForm({ ...newForm, status: e.target.value })}>{Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select></div>
                  <div style={{ ...s.fieldGroup, marginTop: 14 }}><label style={s.label}>Customer Comments</label><textarea style={s.textarea} placeholder="Customer requirements or comments..." value={newForm.customer_comments} onChange={e => setNewForm({ ...newForm, customer_comments: e.target.value })} /></div>
                </div>
                <div style={s.formSection}>
                  <div style={s.formSectionLabel}>Fabric Image</div>
                  {newImagePreview ? (
                    <div style={s.previewWrap}>
                      <img src={newImagePreview} alt="preview" style={s.preview} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label style={s.changeBtn}>Change<input type="file" hidden onChange={handleNewImageChange} /></label>
                        <button type="button" style={s.removeBtn} onClick={() => { setNewImageFile(null); setNewImagePreview(null); }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label style={s.dropzone}>
                      <input type="file" hidden onChange={handleNewImageChange} />
                      <div style={{ color: '#6366f1' }}><Icon.Image /></div>
                      <div style={{ fontWeight: 600, marginTop: 8 }}>Click to Upload Fabric Image</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>JPG, PNG, WEBP or GIF · Max 5MB</div>
                    </label>
                  )}
                </div>
                <div style={s.modalFooter}>
                  <button type="button" style={s.cancelBtn} onClick={() => setNewModalOpen(false)}>Cancel</button>
                  <button type="submit" style={s.submitBtn} disabled={submitting}>{submitting ? 'Creating…' : '✓ Create Request'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══ CONVERT TO ORDER CONFIRMATION MODAL ══ */}
        {orderBookingOpen && orderBookingRecord && (
          <OrderBookingModal
            record={orderBookingRecord}
            onClose={() => {
              if (!orderBookingSaving) {
                setOrderBookingOpen(false);
                setOrderBookingRecord(null);
                setOrderBookingError('');
              }
            }}
            onConfirm={handleConfirmOrderBooking}
            saving={orderBookingSaving}
            error={orderBookingError}
          />
        )}

        {/* ══ ORDER CONVERSION SUCCESS POPUP ══ */}
        {orderBookingSuccess && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1600, padding: 20, backdropFilter: 'blur(5px)',
          }}>
            <div style={{
              background: '#fff', borderRadius: 22, width: '100%', maxWidth: 460,
              overflow: 'hidden', boxShadow: '0 28px 80px rgba(0,0,0,0.28)',
              animation: 'orderSlideIn .3s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '32px 28px 24px', textAlign: 'center', borderBottom: '1px solid #bbf7d0' }}>
                <div className="success-icon-bounce" style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 8px 28px rgba(34,197,94,0.4)', fontSize: 34, color: '#fff', fontWeight: 800 }}>✓</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#14532d' }}>Order Converted Successfully!</h3>
                <p style={{ margin: 0, fontSize: 14, color: '#166534', lineHeight: 1.6 }}>The sample request has been saved as a conversion record.<br />A bell notification is now waiting on the Customer Orders page.</p>
              </div>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🧵</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Converted Request</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d' }}>{convertedRecord?.request_code}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>{convertedRecord?.customer_name}</span>
                      {convertedRecord?.fabric_code && <><span style={{ color: '#cbd5e1' }}>·</span><span>{convertedRecord.fabric_code}</span></>}
                      {convertedRecord?.color && <><span style={{ color: '#cbd5e1' }}>·</span><span>{convertedRecord.color}</span></>}
                      {convertedRecord?.quantity_meters && <><span style={{ color: '#cbd5e1' }}>·</span><span>{convertedRecord.quantity_meters}m</span></>}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 24px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>💡</span>
                <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>Click <strong>"Go to Customer Orders"</strong> to open the pre-filled order form and complete the booking.</p>
              </div>
              <div style={{ display: 'flex', gap: 10, padding: '18px 24px 22px' }}>
                <button className="success-stay-btn" style={{ flex: 1, padding: '12px 16px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: 11, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#475569', fontFamily: 'inherit', transition: 'background .15s' }} onClick={() => { setOrderBookingSuccess(false); setConvertedRecord(null); }}>Stay Here</button>
                <button className="success-go-btn" style={{ flex: 2, padding: '12px 18px', border: 'none', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(22,163,74,0.4)', transition: 'opacity .15s, transform .15s' }} onClick={() => { setOrderBookingSuccess(false); setConvertedRecord(null); navigate('/admin/customer-orders'); }}>
                  <Icon.ShoppingCart /> Go to Customer Orders
                </button>
              </div>
            </div>
          </div>
        )}

        <SampleReportModal record={reportRecord} onClose={() => setReportRecord(null)} baseUrl="http://localhost:5000" />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// EDIT DEVELOPMENT PROCESS PAGE
// ─────────────────────────────────────────────

export function EditDevelopmentProcess() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [form, setForm]       = useState<SampleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios.get(`/development-process/${id}`)
      .then(res => setForm(res.data.sampleRequest || res.data))
      .catch(() => setError('Failed to load record.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!form || !id) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await axios.put(`/development-process/${id}/request-info`, form);
      setSaved(true);
      addNotification('success', 'Request Updated', `"${form.request_code}" updated.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Save failed';
      setError(msg);
      addNotification('error', 'Save Failed', msg);
    } finally { setSaving(false); }
  };

  const field = (label: string, key: keyof SampleRecord, type: string = 'text') => (
    <div style={s.fieldGroup}>
      <label style={s.label}>{label}</label>
      <input style={s.input} type={type} value={(form as any)?.[key] ?? ''} onChange={e => setForm(prev => prev ? { ...prev, [key]: e.target.value } : prev)} />
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: '#6366f1', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}><Icon.Loader /></div>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Loading request…</span>
    </div>
  );

  if (!form) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontFamily: "'Inter', sans-serif" }}>
      {error || 'Record not found.'}
      <br />
      <button style={{ ...s.cancelBtn, marginTop: 16 }} onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ ...s.page, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <button style={{ ...s.cancelBtn, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate(-1)}>
            <Icon.ChevronLeft /> Back
          </button>
          <div>
            <div style={s.topLabel}>Development Process</div>
            <h1 style={{ ...s.topTitle, fontSize: 24 }}>Edit: {form.request_code}</h1>
          </div>
        </div>
        {saved  && <div style={{ ...s.successMsg, marginBottom: 16 }}><Icon.CheckCircle /> Saved successfully!</div>}
        {error  && <div style={{ ...s.errorMsg,   marginBottom: 16 }}><Icon.AlertCircle /> {error}</div>}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' }}><div style={s.formSectionLabel}>Request Info</div></div>
          <div style={{ padding: 24 }}>
            <div style={{ ...s.grid2, marginBottom: 14 }} className="sr-grid2">
              {field('Request Code *', 'request_code')}
              {field('Customer Name *', 'customer_name')}
              {field('Agent Name', 'agent_name')}
              <div style={s.fieldGroup}><label style={s.label}>Sample Type</label><select style={s.input} value={form.sample_type} onChange={e => setForm({ ...form, sample_type: e.target.value as any })}><option value="parcel">📦 Parcel</option><option value="whatsapp">💬 WhatsApp</option></select></div>
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' }}><div style={s.formSectionLabel}>Fabric Details</div></div>
          <div style={{ padding: 24 }}>
            <div style={s.grid2} className="sr-grid2">
              {field('Fabric Code', 'fabric_code')}
              {field('Fabric Quality', 'fabric_quality')}
              {field('Color', 'color')}
              {field('Quantity (Meters)', 'quantity_meters', 'number')}
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' }}><div style={s.formSectionLabel}>Status & Notes</div></div>
          <div style={{ padding: 24 }}>
            <div style={{ ...s.fieldGroup, marginBottom: 14 }}><label style={s.label}>Status</label><select style={s.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select></div>
            <div style={s.fieldGroup}><label style={s.label}>Customer Comments</label><textarea style={s.textarea} placeholder="Customer requirements or comments…" value={form.customer_comments || ''} onChange={e => setForm({ ...form, customer_comments: e.target.value })} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button style={s.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
          <button style={{ ...s.submitBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : '↻ Save Changes'}</button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// ORDER BOOKING MODAL STYLES
// ─────────────────────────────────────────────

const OB: Record<string, React.CSSProperties> = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 1500, backdropFilter: 'blur(4px)' },
  modal:      { background: '#fff', width: '100%', maxWidth: 520, borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', animation: 'orderSlideIn .25s cubic-bezier(0.34,1.56,0.64,1)' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 22px 16px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)' },
  headerIcon: { width: 44, height: 44, borderRadius: 12, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' },
  fromBadge:  { display: 'inline-block', fontSize: 11, background: '#ede9fe', color: '#7c3aed', padding: '2px 10px', borderRadius: 99, fontWeight: 700, marginTop: 5 },
  closeBtn:   { border: 'none', background: 'rgba(124,58,237,0.1)', width: 34, height: 34, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0, alignSelf: 'flex-start' },
  body:       { padding: '20px 22px 16px' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  grid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field:      { background: '#f8fafc', borderRadius: 9, padding: '10px 13px', border: '1px solid #f1f5f9' },
  fieldLabel: { fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldVal:   { fontSize: 13, fontWeight: 600, color: '#1e293b' },
  statusPill: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 },
  divider:    { height: 1, background: '#f1f5f9', margin: '16px 0' },
  infoBox:    { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fffbeb', borderRadius: 10, padding: '12px 14px', border: '1px solid #fde68a' },
  footer:     { display: 'flex', gap: 10, padding: '14px 22px 20px' },
  cancelBtn:  { flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#475569', transition: 'background .15s', fontFamily: 'inherit' },
  confirmBtn: { flex: 2, padding: '11px 18px', border: 'none', background: '#2563eb', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(37,99,235,0.3)', transition: 'background .15s', fontFamily: 'inherit' },
};

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  successMsg:       { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', margin: '0 28px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  errorMsg:         { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', margin: '0 28px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  page:             { padding: 28, background: '#f1f5f9', minHeight: '100vh', fontFamily: "'Inter', sans-serif" },
  topBar:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  topLabel:         { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 },
  topTitle:         { margin: 0, fontSize: 28, fontWeight: 700, color: '#0f172a', fontFamily: "'DM Sans', sans-serif" },
  newBtn:           { display: 'flex', alignItems: 'center', gap: 8, background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 14px rgba(99,102,241,0.35)' },
  processBar:       { display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 14, padding: '16px 24px', marginBottom: 24, border: '1px solid #e2e8f0', gap: 8, flexWrap: 'wrap' },
  processStep:      { display: 'flex', alignItems: 'center', gap: 12 },
  processIcon:      { width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  processNum:       { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 },
  processLabel:     { fontSize: 14, fontWeight: 700, color: '#1e293b' },
  processArrow:     { color: '#cbd5e1', margin: '0 4px', display: 'flex', alignItems: 'center' },
  loadingBox:       { textAlign: 'center', padding: 60 },
  thumb:            { width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' },
  noImg:            { width: 52, height: 52, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' },
  code:             { fontWeight: 700, fontSize: 13, color: '#1e293b' },
  name:             { fontWeight: 600, color: '#1e293b' },
  sub:              { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  qty:              { fontWeight: 700, fontSize: 15, color: '#1e293b' },
  unit:             { fontSize: 12, color: '#94a3b8', fontWeight: 400 },
  typeBadge:        { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  typePart:         { background: '#ede9fe', color: '#7c3aed' },
  typeWA:           { background: '#dcfce7', color: '#16a34a' },
  statusBadge:      { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  unreadDot:        { position: 'absolute', top: -5, right: -5, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1 },
  panelOverlay:     { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 1100 },
  panel:            { width: '100%', maxWidth: 640, background: '#fff', height: '100vh', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' },
  panelHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 28px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbff', position: 'sticky', top: 0, zIndex: 10 },
  panelSub:         { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 },
  panelTitle:       { fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 },
  panelCode:        { fontSize: 12, color: '#64748b', marginTop: 4 },
  panelClose:       { border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' },
  editModal:        { background: '#fff', width: '100%', minWidth: 780, maxWidth: 900, borderRadius: 16, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.22)' },
  editModalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff', flexShrink: 0 },
  editTabBar:       { display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0, flexWrap: 'nowrap', overflowX: 'auto' },
  editTabBtn:       { padding: '8px 14px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', transition: 'all .15s', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 },
  panelBody:        { padding: '24px 28px' },
  sectionTitle:     { fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  existsBadge:      { fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700 },
  fabricInfo:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e2e8f0' },
  fabricInfoItem:   { display: 'flex', flexDirection: 'column', gap: 2 },
  fiLabel:          { fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 },
  fiValue:          { fontSize: 14, fontWeight: 700, color: '#1e293b' },
  daSection:        { background: '#f8fafc', borderRadius: 10, padding: '16px 18px', marginBottom: 16, border: '1px solid #e2e8f0' },
  daSectionLabel:   { fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  infoRow:          { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  infoChip:         { background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#475569' },
  conversionCard:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 20, marginTop: 16 },
  convRow:          { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 },
  convItem:         { textAlign: 'center' },
  convLabel:        { fontSize: 11, color: '#92400e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  convValue:        { fontSize: 22, fontWeight: 800, color: '#78350f', marginTop: 2 },
  convArrow:        { fontSize: 20, color: '#d97706' },
  priceFormBox:     { background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' },
  priceFormTitle:   { fontSize: 13, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  calcPreview:      { background: '#fff', borderRadius: 8, padding: '10px 16px', border: '1px solid #e2e8f0', fontSize: 13, color: '#475569', marginTop: 12 },
  addRowBtn:        { marginTop: 14, padding: '10px 18px', background: '#f1f5f9', border: '1.5px dashed #94a3b8', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#475569', width: '100%' },
  priceTable:       { borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 20 },
  priceTableHeader: { padding: '12px 16px', background: '#f8fafc', fontWeight: 700, fontSize: 13, borderBottom: '1px solid #e2e8f0', color: '#374151' },
  pth:              { padding: '10px 12px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: .5, whiteSpace: 'nowrap' },
  ptd:              { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' },
  listTypeBadge:    { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
  saveProcess:      { width: '100%', padding: '13px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15, marginTop: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.3)' },
  overlay:          { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 1000 },
  modal:            { background: '#fff', width: '100%', maxWidth: 680, borderRadius: 16, padding: 0, maxHeight: '95vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 28px 16px', borderBottom: '1px solid #f1f5f9' },
  closeBtn:         { border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' },
  errorBox:         { background: '#fee2e2', color: '#dc2626', padding: '12px 28px', fontSize: 13 },
  formSection:      { padding: '16px 28px', borderBottom: '1px solid #f8fafc' },
  formSectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase', marginBottom: 14 },
  grid2:            { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  fieldGroup:       { display: 'flex', flexDirection: 'column', gap: 5 },
  label:            { fontSize: 12, fontWeight: 600, color: '#374151' },
  input:            { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' },
  textarea:         { padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, minHeight: 80, resize: 'vertical', fontFamily: 'Inter', outline: 'none' },
  dropzone:         { border: '2px dashed #c7d2fe', borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', background: '#fafbff', color: '#6366f1', textAlign: 'center' },
  previewWrap:      { display: 'flex', gap: 16, alignItems: 'center', padding: '4px 0' },
  preview:          { width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' },
  changeBtn:        { display: 'inline-block', background: '#6366f1', color: '#fff', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  removeBtn:        { padding: '7px 14px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  modalFooter:      { display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '20px 28px' },
  cancelBtn:        { padding: '11px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 },
  submitBtn:        { padding: '11px 22px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 800, boxShadow: '0 4px 14px rgba(99,102,241,0.3)' },
  inlineEditBtn:    { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
};