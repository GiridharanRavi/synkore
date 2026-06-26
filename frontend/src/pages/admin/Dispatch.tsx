import React, { useEffect, useState } from 'react';
import { getDispatch, createDispatch, updateDispatch, deleteDispatch } from '../../api/services';

interface DispatchRecord { 
  id: number; 
  dispatch_code: string;
  inward_processed_id: number;
  lot_no: string; 
  quantity: number; 
  dispatch_date: string; 
  dispatched_by: string;
  transporter_name: string;
  lr_number: string;
  destination: string; 
  status: string; 
  remarks: string;
}

const emptyForm = { 
  dispatch_code: '',
  inward_processed_id: '',
  lot_no: '', 
  quantity: '', 
  dispatch_date: new Date().toISOString().split('T')[0], 
  dispatched_by: '',
  transporter_name: '',
  lr_number: '',
  destination: '', 
  status: 'pending',
  remarks: ''
};

export default function Dispatch() {
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getDispatch()
      .then((d: any) => setRecords(d.data || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await updateDispatch(editId, form);
    } else {
      await createDispatch(form);
    }
    closeModal();
    loadData();
  };

  const openModal = (r?: DispatchRecord) => {
    if (r) {
      setEditId(r.id);
      setForm({ ...r, dispatch_date: r.dispatch_date?.slice(0, 10) });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this dispatch record?')) {
      await deleteDispatch(id);
      loadData();
    }
  };

  return (
    <div style={s.container}>
      {/* Header Section */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Dispatch Management</h2>
          <p style={s.subtitle}>Manage outgoing shipments and logistics tracking</p>
        </div>
        <button style={s.addBtn} onClick={() => openModal()}>+ New Dispatch</button>
      </div>

      {/* Table Section */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              {['CODE', 'LOT NO', 'QTY', 'DATE', 'DESTINATION', 'STATUS', 'ACTIONS'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading ? (
              <tr><td colSpan={7} style={s.emptyMsg}>No dispatch records found.</td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={{...s.td, fontWeight: 700}}>{r.dispatch_code}</td>
                  <td style={s.td}>{r.lot_no}</td>
                  <td style={s.td}>{r.quantity}</td>
                  <td style={s.td}>{r.dispatch_date?.slice(0, 10)}</td>
                  <td style={s.td}>{r.destination}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.badge, 
                      background: r.status === 'dispatched' ? '#d1fae5' : '#fef3c7', 
                      color: r.status === 'dispatched' ? '#065f46' : '#92400e'
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={s.td}>
                    <button style={s.actBtn} onClick={() => openModal(r)}>Edit</button>
                    <button style={{ ...s.actBtn, ...s.del }} onClick={() => handleDelete(r.id)}>Del</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Popup */}
      {showModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalContent}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{editId ? 'Edit Dispatch' : 'New Dispatch Record'}</h3>
              <button style={s.closeX} onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={s.formGrid}>
                <label style={s.label}>Dispatch Code *
                  <input style={s.input} placeholder="e.g. DISP-1001" value={form.dispatch_code} onChange={e => setForm({...form, dispatch_code: e.target.value})} required />
                </label>

                <label style={s.label}>Inward Processed ID *
                  <input style={s.input} type="number" value={form.inward_processed_id} onChange={e => setForm({...form, inward_processed_id: e.target.value})} required />
                </label>

                <label style={s.label}>Lot Number
                  <input style={s.input} value={form.lot_no} onChange={e => setForm({...form, lot_no: e.target.value})} />
                </label>

                <label style={s.label}>Quantity *
                  <input style={s.input} type="number" step="0.01" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} required />
                </label>

                <label style={s.label}>Dispatch Date *
                  <input style={s.input} type="date" value={form.dispatch_date} onChange={e => setForm({...form, dispatch_date: e.target.value})} required />
                </label>

                <label style={s.label}>Status
                  <select style={s.input} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="pending">Pending</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>

                <label style={s.label}>Transporter Name
                  <input style={s.input} value={form.transporter_name} onChange={e => setForm({...form, transporter_name: e.target.value})} />
                </label>

                <label style={s.label}>LR Number
                  <input style={s.input} placeholder="Lorry Receipt #" value={form.lr_number} onChange={e => setForm({...form, lr_number: e.target.value})} />
                </label>

                <label style={s.label}>Dispatched By
                  <input style={s.input} value={form.dispatched_by} onChange={e => setForm({...form, dispatched_by: e.target.value})} />
                </label>

                <label style={s.label}>Destination
                  <input style={s.input} value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} />
                </label>
              </div>

              <label style={{...s.label, marginTop: 12}}>Remarks
                <textarea style={{...s.input, height: 60, resize: 'none'}} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} />
              </label>

              <div style={s.modalFooter}>
                <button type="button" style={s.cancelBtn} onClick={closeModal}>Cancel</button>
                <button type="submit" style={s.createBtn}>{editId ? 'Update' : 'Confirm Dispatch'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: '24px 40px', backgroundColor: '#f8fafc', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  addBtn: { backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' },
  tableCard: { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '16px', textAlign: 'left', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  td: { padding: '16px', fontSize: 14, color: '#334155', borderBottom: '1px solid #f1f5f9' },
  tr: { transition: 'background 0.2s' },
  badge: { padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' },
  emptyMsg: { padding: '40px', textAlign: 'center', color: '#94a3b8' },
  actBtn: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, marginRight: 8 },
  del: { color: '#dc2626' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: '750px', borderRadius: 12, padding: 32 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#1e293b' },
  closeX: { background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569' },
  input: { padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' },
  modalFooter: { marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' },
  createBtn: { padding: '10px 24px', borderRadius: 8, border: 'none', backgroundColor: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }
};