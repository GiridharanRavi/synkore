import React, { useEffect, useState } from 'react';
import { getInwardProcessed, createInwardProcessed, updateInwardProcessed, deleteInwardProcessed } from '../../api/services';

interface IPRecord { 
  id: number; 
  dyeing_id: number;
  process_type: string; 
  received_date: string; 
  quantity_received: number;
  quality_check: 'pass' | 'fail' | 'conditional';
  qc_notes: string;
  received_by: string;
  remarks: string;
}

const emptyForm = { 
  dyeing_id: '', 
  process_type: '', 
  received_date: new Date().toISOString().split('T')[0], 
  quantity_received: '',
  quality_check: 'pass',
  qc_notes: '',
  received_by: '',
  remarks: '' 
};

export default function InwardProcessed() {
  const [records, setRecords] = useState<IPRecord[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getInwardProcessed()
      .then((d: any) => setRecords(d.data || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await updateInwardProcessed(editId, form);
    } else {
      await createInwardProcessed(form);
    }
    closeModal();
    loadData();
  };

  const openModal = (r?: IPRecord) => {
    if (r) {
      setEditId(r.id);
      setForm({ ...r, received_date: r.received_date?.slice(0, 10) });
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
    if (window.confirm('Delete this processed inward record?')) {
      await deleteInwardProcessed(id);
      loadData();
    }
  };

  const qcColor = { pass: '#d1fae5', fail: '#fee2e2', conditional: '#fef3c7' };
  const qcText = { pass: '#065f46', fail: '#b91c1c', conditional: '#92400e' };

  return (
    <div style={s.container}>
      {/* Header Section */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Inward Processed</h2>
          <p style={s.subtitle}>Record items received back from dyeing/processing</p>
        </div>
        <button style={s.addBtn} onClick={() => openModal()}>+ New Entry</button>
      </div>

      {/* Table Section */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              {['ID', 'DYEING ID', 'PROCESS', 'QTY (M)', 'DATE', 'QC STATUS', 'ACTIONS'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading ? (
              <tr><td colSpan={7} style={s.emptyMsg}>No processed records found.</td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={s.td}>#{r.id}</td>
                  <td style={s.td}>{r.dyeing_id}</td>
                  <td style={s.td}>{r.process_type}</td>
                  <td style={s.td}>{r.quantity_received}</td>
                  <td style={s.td}>{r.received_date?.slice(0, 10)}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.badge, 
                      background: qcColor[r.quality_check] || '#f3f4f6', 
                      color: qcText[r.quality_check] || '#374151'
                    }}>
                      {r.quality_check}
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
              <h3 style={s.modalTitle}>{editId ? 'Edit Processed Entry' : 'New Processed Entry'}</h3>
              <button style={s.closeX} onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={s.formGrid}>
                <label style={s.label}>Dyeing ID *
                  <input style={s.input} type="number" value={form.dyeing_id} onChange={e => setForm({...form, dyeing_id: e.target.value})} required />
                </label>

                <label style={s.label}>Process Type
                  <input style={s.input} placeholder="e.g. Dyeing, Printing" value={form.process_type} onChange={e => setForm({...form, process_type: e.target.value})} />
                </label>

                <label style={s.label}>Quantity Received *
                  <input style={s.input} type="number" step="0.01" value={form.quantity_received} onChange={e => setForm({...form, quantity_received: e.target.value})} required />
                </label>

                <label style={s.label}>Received Date *
                  <input style={s.input} type="date" value={form.received_date} onChange={e => setForm({...form, received_date: e.target.value})} required />
                </label>

                <label style={s.label}>Received By
                  <input style={s.input} value={form.received_by} onChange={e => setForm({...form, received_by: e.target.value})} />
                </label>

                <label style={s.label}>Quality Check
                  <select style={s.input} value={form.quality_check} onChange={e => setForm({...form, quality_check: e.target.value})}>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="conditional">Conditional</option>
                  </select>
                </label>
              </div>

              <div style={s.gridFull}>
                <label style={s.label}>QC Notes
                  <textarea style={{...s.input, height: 60, resize: 'none'}} value={form.qc_notes} onChange={e => setForm({...form, qc_notes: e.target.value})} />
                </label>

                <label style={{...s.label, marginTop: 12}}>General Remarks
                  <textarea style={{...s.input, height: 60, resize: 'none'}} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} />
                </label>
              </div>

              <div style={s.modalFooter}>
                <button type="button" style={s.cancelBtn} onClick={closeModal}>Cancel</button>
                <button type="submit" style={s.createBtn}>{editId ? 'Update' : 'Save Entry'}</button>
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
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: '650px', borderRadius: 12, padding: 32 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#1e293b' },
  closeX: { background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  gridFull: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569' },
  input: { padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' },
  modalFooter: { marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' },
  createBtn: { padding: '10px 24px', borderRadius: 8, border: 'none', backgroundColor: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }
};