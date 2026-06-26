import React, { useEffect, useState } from 'react';
import { getOutward, createOutward, updateOutward, deleteOutward } from '../../api/services';

interface OutwardRecord { 
  id: number; 
  job_work_order_id: number;
  job_code?: string; // From JOIN
  vendor_name: string; 
  outward_date: string; 
  quantity_sent: number;
  challan_number: string;
  remarks: string;
}

const emptyForm = { 
  job_work_order_id: '', 
  vendor_name: '', 
  outward_date: new Date().toISOString().split('T')[0], 
  quantity_sent: '', 
  challan_number: '',
  remarks: ''
};

export default function Outward() {
  const [records, setRecords] = useState<OutwardRecord[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getOutward()
      .then((d: any) => setRecords(d.data || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await updateOutward(editId, form);
    } else {
      await createOutward(form);
    }
    closeModal();
    loadData();
  };

  const openModal = (r?: OutwardRecord) => {
    if (r) {
      setEditId(r.id);
      setForm({ ...r, outward_date: r.outward_date?.slice(0, 10) });
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
    if (window.confirm('Are you sure you want to delete this outward entry?')) {
      await deleteOutward(id);
      loadData();
    }
  };

  return (
    <div style={s.container}>
      {/* Header Section */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Outward Entries</h2>
          <p style={s.subtitle}>Track materials sent out for job work or delivery</p>
        </div>
        <button style={s.addBtn} onClick={() => openModal()}>+ New Outward</button>
      </div>

      {/* Table Section */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              {['ID', 'JOB ORDER', 'VENDOR', 'CHALLAN #', 'QTY (M)', 'DATE', 'ACTIONS'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading ? (
              <tr><td colSpan={7} style={s.emptyMsg}>No outward entries recorded.</td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={s.td}>#{r.id}</td>
                  <td style={{...s.td, fontWeight: 600}}>{r.job_code || `ID: ${r.job_work_order_id}`}</td>
                  <td style={s.td}>{r.vendor_name}</td>
                  <td style={s.td}>{r.challan_number || '-'}</td>
                  <td style={s.td}>{r.quantity_sent}</td>
                  <td style={s.td}>{r.outward_date?.slice(0, 10)}</td>
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
              <h3 style={s.modalTitle}>{editId ? 'Edit Outward' : 'New Outward Entry'}</h3>
              <button style={s.closeX} onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={s.formGrid}>
                <label style={s.label}>Job Work Order ID *
                  <input style={s.input} type="number" placeholder="Enter Job Order ID" value={form.job_work_order_id} onChange={e => setForm({...form, job_work_order_id: e.target.value})} required />
                </label>

                <label style={s.label}>Vendor Name *
                  <input style={s.input} placeholder="Recipient / Vendor" value={form.vendor_name} onChange={e => setForm({...form, vendor_name: e.target.value})} required />
                </label>

                <label style={s.label}>Outward Date *
                  <input style={s.input} type="date" value={form.outward_date} onChange={e => setForm({...form, outward_date: e.target.value})} required />
                </label>

                <label style={s.label}>Quantity Sent (m) *
                  <input style={s.input} type="number" step="0.01" placeholder="0.00" value={form.quantity_sent} onChange={e => setForm({...form, quantity_sent: e.target.value})} required />
                </label>

                <label style={s.label}>Challan Number
                  <input style={s.input} placeholder="e.g. CH-9901" value={form.challan_number} onChange={e => setForm({...form, challan_number: e.target.value})} />
                </label>
              </div>

              <label style={{...s.label, marginTop: 12}}>Remarks
                <textarea style={{...s.input, height: 80, resize: 'none'}} placeholder="Shipping details, vehicle info, etc." value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} />
              </label>

              <div style={s.modalFooter}>
                <button type="button" style={s.cancelBtn} onClick={closeModal}>Cancel</button>
                <button type="submit" style={s.createBtn}>{editId ? 'Update Entry' : 'Create Outward'}</button>
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
  emptyMsg: { padding: '40px', textAlign: 'center', color: '#94a3b8' },
  actBtn: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, marginRight: 8 },
  del: { color: '#dc2626' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: '650px', borderRadius: 12, padding: 32 },
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