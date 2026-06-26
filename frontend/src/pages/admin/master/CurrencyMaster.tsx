// frontend/src/pages/admin/CurrencyMaster.tsx
// Currency Master — Fully Responsive (Mobile → Tablet → Laptop → Desktop)

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, X, Loader2, AlertCircle,
  CheckCircle2, Info, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { currencyService } from '../../../api/services';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Currency {
  id?: number;
  rec_no?: string;
  currency_name: string;
  currency_code: string;
  currency_symbol: string;
  status: 'Active' | 'Inactive';
}

// ─── Predefined Currency List ────────────────────────────────────────────────

const CURRENCIES: { name: string; code: string; symbol: string }[] = [
  { name: 'Indian Rupee',         code: 'INR', symbol: '₹' },
  { name: 'US Dollar',            code: 'USD', symbol: '$' },
  { name: 'Euro',                 code: 'EUR', symbol: '€' },
  { name: 'British Pound',        code: 'GBP', symbol: '£' },
  { name: 'Japanese Yen',         code: 'JPY', symbol: '¥' },
  { name: 'Australian Dollar',    code: 'AUD', symbol: 'A$' },
  { name: 'Canadian Dollar',      code: 'CAD', symbol: 'C$' },
  { name: 'Swiss Franc',          code: 'CHF', symbol: 'Fr' },
  { name: 'Chinese Yuan',         code: 'CNY', symbol: '¥' },
  { name: 'Singapore Dollar',     code: 'SGD', symbol: 'S$' },
  { name: 'UAE Dirham',           code: 'AED', symbol: 'د.إ' },
  { name: 'Saudi Riyal',          code: 'SAR', symbol: '﷼' },
  { name: 'Hong Kong Dollar',     code: 'HKD', symbol: 'HK$' },
  { name: 'Malaysian Ringgit',    code: 'MYR', symbol: 'RM' },
  { name: 'Thai Baht',            code: 'THB', symbol: '฿' },
  { name: 'South Korean Won',     code: 'KRW', symbol: '₩' },
  { name: 'New Zealand Dollar',   code: 'NZD', symbol: 'NZ$' },
  { name: 'Norwegian Krone',      code: 'NOK', symbol: 'kr' },
  { name: 'Swedish Krona',        code: 'SEK', symbol: 'kr' },
  { name: 'Danish Krone',         code: 'DKK', symbol: 'kr' },
  { name: 'South African Rand',   code: 'ZAR', symbol: 'R' },
  { name: 'Brazilian Real',       code: 'BRL', symbol: 'R$' },
  { name: 'Mexican Peso',         code: 'MXN', symbol: '$' },
  { name: 'Turkish Lira',         code: 'TRY', symbol: '₺' },
  { name: 'Russian Ruble',        code: 'RUB', symbol: '₽' },
  { name: 'Bangladeshi Taka',     code: 'BDT', symbol: '৳' },
  { name: 'Pakistani Rupee',      code: 'PKR', symbol: '₨' },
  { name: 'Sri Lankan Rupee',     code: 'LKR', symbol: '₨' },
  { name: 'Nepali Rupee',         code: 'NPR', symbol: '₨' },
  { name: 'Kuwaiti Dinar',        code: 'KWD', symbol: 'د.ك' },
  { name: 'Qatari Riyal',         code: 'QAR', symbol: '﷼' },
  { name: 'Bahraini Dinar',       code: 'BHD', symbol: '.د.ب' },
  { name: 'Omani Rial',           code: 'OMR', symbol: '﷼' },
];

const BLANK: Currency = {
  currency_name: '',
  currency_code: '',
  currency_symbol: '',
  status: 'Active',
};

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── Toast ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _tid = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts((p) => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: 'calc(100vw - 40px)', pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn .25s ease-out', fontFamily: "'DM Sans',sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: .8, lineHeight: 1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: .6, display: 'flex', alignItems: 'center', marginTop: 1 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Responsive hook ─────────────────────────────────────────────────────────
function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Field ───────────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}</label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CurrencyMaster() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filterSt, setFilterSt]     = useState('');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<Currency>(BLANK);
  const [editId, setEditId]         = useState<number | null>(null);
  const [error, setError]           = useState('');

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load list ──────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const data = await currencyService.list({ search, page, limit: pageSize, status: filterSt });
      setCurrencies(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch currencies.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);

  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Currency name → auto-fill code & symbol ────────────────────────────────
  const handleCurrencyNameChange = (name: string) => {
    const found = CURRENCIES.find((c) => c.name === name);
    if (found) {
      setForm((f) => ({ ...f, currency_name: found.name, currency_code: found.code, currency_symbol: found.symbol }));
    } else {
      setForm((f) => ({ ...f, currency_name: name }));
    }
  };

  // ── Open form ──────────────────────────────────────────────────────────────
  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setShowForm(true); };
  const openEdit   = async (id: number) => {
    try {
      const data = await currencyService.get(id);
      setForm(data);
      setEditId(id); setError(''); setShowForm(true);
    } catch {
      pushToast('error', 'Load Failed', 'Could not load currency details.');
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.currency_name.trim()) { setError('Currency Name is required'); return; }
    if (!form.currency_code.trim()) { setError('Currency Code is required');  return; }
    setError(''); setSaving(true);
    try {
      if (editId) {
        await currencyService.update(editId, form);
        pushToast('success', 'Currency Updated', `${form.currency_name} updated successfully.`);
      } else {
        await currencyService.create(form);
        pushToast('success', 'Currency Created', `${form.currency_name} saved successfully.`);
      }
      setShowForm(false); load();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this currency?')) return;
    try {
      await currencyService.remove(id);
      pushToast('success', 'Currency Deleted', 'Currency record removed.');
      load();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete currency.');
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end  = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <style>{CSS}</style>
      <div className="cm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="cm-page-header">
          <div>
            <h1>💱 Currency Master</h1>
            <p>{total} currency{total !== 1 ? 'ies' : 'y'} registered</p>
          </div>
          <button className="cm-add-btn" onClick={openCreate}><Plus size={15} /> New Currency</button>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="cm-search" placeholder="Search name, code, symbol…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="cm-filters-row">
            <select className="cm-filter-sel" value={filterSt} onChange={(e) => setFilterSt(e.target.value)}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="cm-rec-count">{total} record(s)</span>}
          </div>
          <div className="cm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{total} record(s)</p>}

        {/* ── TABLE CARD ── */}
        <div className="cm-card">
          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rec No</th>
                  <th>Currency Name</th>
                  <th>Code</th>
                  <th>Symbol</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="cm-empty"><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /></td></tr>
                ) : currencies.length === 0 ? (
                  <tr><td colSpan={7} className="cm-empty">{search || filterSt ? 'No currencies match your search' : 'No currencies yet. Click "New Currency" to create one.'}</td></tr>
                ) : currencies.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="cm-rec-badge">{c.rec_no ?? '—'}</span></td>
                    <td style={{ fontWeight: 600 }}>{c.currency_name}</td>
                    <td><span className="cm-code-badge">{c.currency_code}</span></td>
                    <td style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{c.currency_symbol}</td>
                    <td><span className={`cm-chip ${c.status === 'Active' ? 'cm-chip-active' : 'cm-chip-inactive'}`}>{c.status}</span></td>
                    <td>
                      <div className="cm-action-group">
                        <button className="cm-btn-edit" onClick={() => openEdit(c.id!)}>✏️ {!isMobile && 'Edit'}</button>
                        <button className="cm-btn-del"  onClick={() => handleDelete(c.id!)}>🗑 {!isMobile && 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          {!loading && total > 0 && (
            <div className="cm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="cm-pag-btns">
                <button className="cm-pag-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="cm-pag-btn" onClick={() => setPage(page - 1)} disabled={page === 1}><ChevronLeft size={14} /></button>
                {pageNums.map((p) => (
                  <button key={p} className={`cm-pag-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="cm-pag-btn" onClick={() => setPage(page + 1)} disabled={page === totalPages}><ChevronRight size={14} /></button>
                <button className="cm-pag-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="cm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="cm-modal">

              {/* Header */}
              <div className="cm-modal-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                    {editId ? '✏️ Edit Currency' : '➕ New Currency'}
                  </h2>
                  {editId && form.rec_no && (
                    <span style={{ fontSize: 11, color: '#bfdbfe', fontFamily: 'DM Mono, monospace' }}>{form.rec_no}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Error banner */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="cm-modal-body">
                <div className="cm-form-grid">

                  {/* Rec No — read-only */}
                  <Field label='Rec No'>
                    <input
                      value={form.rec_no ?? '(Auto Generated)'}
                      readOnly
                      style={{ ...s.input, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}
                    />
                  </Field>

                  {/* Currency Name — dropdown */}
                  <Field label='Currency Name' required>
                    <select
                      value={form.currency_name}
                      onChange={(e) => handleCurrencyNameChange(e.target.value)}
                      style={s.input}
                    >
                      <option value=''>— Select Currency —</option>
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </Field>

                  {/* Currency Code — auto-filled or selectable */}
                  <Field label='Currency Code' required>
                    <select
                      value={form.currency_code}
                      onChange={(e) => {
                        const found = CURRENCIES.find((c) => c.code === e.target.value);
                        if (found) setForm((f) => ({ ...f, currency_name: found.name, currency_code: found.code, currency_symbol: found.symbol }));
                        else setForm((f) => ({ ...f, currency_code: e.target.value }));
                      }}
                      style={s.input}
                    >
                      <option value=''>— Select Code —</option>
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </Field>

                  {/* Currency Symbol — auto-filled */}
                  <Field label='Currency Symbol' required>
                    <select
                      value={form.currency_symbol}
                      onChange={(e) => setForm((f) => ({ ...f, currency_symbol: e.target.value }))}
                      style={s.input}
                    >
                      <option value=''>— Select Symbol —</option>
                      {[...new Map(CURRENCIES.map((c) => [c.symbol, c])).values()].map((c) => (
                        <option key={c.code} value={c.symbol}>{c.symbol} ({c.code})</option>
                      ))}
                    </select>
                  </Field>

                  {/* Status */}
                  <Field label='Status' required>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))} style={s.input}>
                      <option value='Active'>Active</option>
                      <option value='Inactive'>Inactive</option>
                    </select>
                  </Field>

                </div>

                {/* Preview card */}
                {form.currency_name && (
                  <div style={s.previewCard}>
                    <span style={s.previewSymbol}>{form.currency_symbol || '?'}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{form.currency_name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Code: <strong>{form.currency_code}</strong></p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="cm-modal-footer">
                <button className="cm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="cm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : (editId ? '✏️ Update' : '💾 Save Currency')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*, *::before, *::after { box-sizing: border-box; }
@keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

.cm-wrap { font-family: 'DM Sans', sans-serif; font-size: 14px; color: #1e293b; }
.cm-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.cm-page-header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1e293b; }
.cm-page-header p  { margin: 3px 0 0; font-size: 13px; color: #64748b; }
.cm-add-btn { display: flex; align-items: center; gap: 6px; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(37,99,235,0.3); white-space: nowrap; flex-shrink: 0; }
.cm-add-btn:hover { background: #1d4ed8; }
.cm-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cm-search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
.cm-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
.cm-search { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; outline: none; }
.cm-search:focus { border-color: #2563eb; }
.cm-filter-sel { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #374151; cursor: pointer; outline: none; }
.cm-filters-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cm-page-size { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; margin-left: auto; }
.cm-page-size select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; cursor: pointer; outline: none; }
.cm-rec-count { font-size: 12px; color: #64748b; white-space: nowrap; }
.cm-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.07); margin-bottom: 24px; }
.cm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.cm-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'DM Sans', sans-serif; min-width: 480px; }
.cm-table thead tr { background: #2563eb; }
.cm-table th { padding: 11px 12px; color: #fff; font-weight: 600; text-align: left; white-space: nowrap; font-size: 12px; }
.cm-table th.th-center { text-align: center; }
.cm-table tbody tr:nth-child(odd) td  { background: #fff; }
.cm-table tbody tr:nth-child(even) td { background: #f8fafc; }
.cm-table tbody tr:hover td { filter: brightness(0.97); }
.cm-table td { padding: 10px 12px; color: #374151; font-size: 13px; white-space: nowrap; }
.cm-rec-badge { display: inline-block; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 2px 7px; }
.cm-code-badge { display: inline-block; font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 600; color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 2px 8px; }
.cm-chip { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.cm-chip-active   { background: #dcfce7; color: #166534; }
.cm-chip-inactive { background: #fee2e2; color: #991b1b; }
.cm-action-group { display: flex; align-items: center; gap: 5px; justify-content: center; }
.cm-btn-edit { display: inline-flex; align-items: center; gap: 3px; background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.cm-btn-edit:hover { background: #dbeafe; }
.cm-btn-del { display: inline-flex; align-items: center; gap: 3px; background: #fff1f2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.cm-btn-del:hover { background: #fee2e2; }
.cm-empty { text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 13px; }
.cm-pagination { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-top: 1px solid #f1f5f9; background: #f8fafc; font-size: 12px; color: #64748b; flex-wrap: wrap; gap: 8px; font-family: 'DM Sans', sans-serif; }
.cm-pag-btns { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.cm-pag-btn { padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif; color: #1e293b; min-width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }
.cm-pag-btn:hover:not(:disabled) { background: #f1f5f9; }
.cm-pag-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; font-weight: 700; }
.cm-pag-btn:disabled { border-color: #e2e8f0; background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
.cm-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: flex-start; justify-content: center; z-index: 2000; overflow-y: auto; padding: 16px 8px; -webkit-overflow-scrolling: touch; }
.cm-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 560px; box-shadow: 0 8px 40px rgba(0,0,0,0.22); display: flex; flex-direction: column; max-height: calc(100vh - 32px); }
.cm-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #2563eb; border-radius: 14px 14px 0 0; flex-shrink: 0; }
.cm-modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.cm-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid #f1f5f9; background: #f8fafc; flex-shrink: 0; border-radius: 0 0 14px 14px; }
.cm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 480px) { .cm-form-grid { grid-template-columns: 1fr; } }
.cm-btn-cancel { padding: 9px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; font-family: 'DM Sans', sans-serif; }
.cm-btn-save { display: flex; align-items: center; gap: 6px; padding: 9px 20px; border: none; background: #16a34a; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(22,163,74,0.3); }
.cm-btn-save:disabled { opacity: 0.7; cursor: not-allowed; }
select, input, textarea { font-family: 'DM Sans', sans-serif; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: #f1f5f9; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  closeBtn: { background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0', fontSize: 13 },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#fff' },
  previewCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg,#eff6ff,#f5f3ff)', border: '1px solid #c7d2fe', borderRadius: 12, padding: '14px 18px', marginTop: 18 },
  previewSymbol: { fontSize: 36, fontWeight: 800, color: '#2563eb', lineHeight: 1 },
};