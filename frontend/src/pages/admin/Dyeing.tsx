import React, { useEffect, useState } from 'react';
import { getDyeing, createDyeing, updateDyeing, deleteDyeing } from '../../api/services';

interface DyeingRecord { 
  id: number; 
  inward_id: number; 
  color: string; 
  process: string; 
  start_date: string; 
  end_date: string; 
  status: string; 
}

const emptyForm = { 
  inward_id: '', 
  color: '', 
  process: 'Dyeing & Processing', 
  start_date: '', 
  end_date: '', 
  status: 'In-Process' 
};

export default function Dyeing() {
  const [records, setRecords] = useState<DyeingRecord[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    getDyeing()
      .then((d: any) => setRecords(d.data || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await updateDyeing(editId, form);
    } else {
      await createDyeing(form);
    }
    closeModal();
    loadData();
  };

  const openModal = (r?: DyeingRecord) => {
    if (r) {
      setEditId(r.id);
      setForm({ ...r });
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
    if (window.confirm('Are you sure you want to delete this record?')) {
      await deleteDyeing(id);
      loadData();
    }
  };

  return (
    <div style={s.container}>
      {/* Header Section */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Dyeing & Process</h2>
          <p style={s.subtitle}>Manage fabric dyeing and processing stages</p>
        </div>
        <button style={s.addBtn} onClick={() => openModal()}>+ New Dyeing Record</button>
      </div>

      {/* Table Section */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              {['ID', 'INWARD ID', 'COLOR', 'PROCESS', 'START DATE', 'END DATE', 'STATUS', 'ACTIONS'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && !loading ? (
              <tr><td colSpan={8} style={s.emptyMsg}>No dyeing records yet.</td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={s.td}>#{r.id}</td>
                  <td style={s.td}>{r.inward_id}</td>
                  <td style={s.td}>{r.color}</td>
                  <td style={s.td}>{r.process}</td>
                  <td style={s.td}>{r.start_date?.slice(0, 10)}</td>
                  <td style={s.td}>{r.end_date?.slice(0, 10)}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.badge, 
                      background: r.status.toLowerCase() === 'completed' ? '#d1fae5' : '#fef3c7', 
                      color: r.status.toLowerCase() === 'completed' ? '#065f46' : '#92400e'
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
              <h3 style={s.modalTitle}>{editId ? 'Edit Dyeing Record' : 'New Dyeing Record'}</h3>
              <button style={s.closeX} onClick={closeModal}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={s.formGrid}>
                <label style={s.label}>Inward ID *
                  <input style={s.input} type="number" value={form.inward_id} onChange={e => setForm({...form, inward_id: e.target.value})} required />
                </label>

                <label style={s.label}>Color *
                  <input style={s.input} type="text" placeholder="e.g. Navy Blue" value={form.color} onChange={e => setForm({...form, color: e.target.value})} required />
                </label>

                <label style={s.label}>Process
                  <input style={s.input} type="text" value={form.process} onChange={e => setForm({...form, process: e.target.value})} />
                </label>

                <label style={s.label}>Status
                  <select style={s.input} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="In-Process">In-Process</option>
                    <option value="Completed">Completed</option>
                    <option value="Hold">Hold</option>
                  </select>
                </label>

                <label style={s.label}>Start Date *
                  <input style={s.input} type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} required />
                </label>

                <label style={s.label}>End Date
                  <input style={s.input} type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
                </label>
              </div>

              <div style={s.modalFooter}>
                <button type="button" style={s.cancelBtn} onClick={closeModal}>Cancel</button>
                <button type="submit" style={s.createBtn}>{editId ? 'Update' : 'Add Record'}</button>
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
  th: { padding: '16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  td: { padding: '16px', fontSize: 14, color: '#334155', borderBottom: '1px solid #f1f5f9' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  emptyMsg: { padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 15 },
  
  badge: { padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' },
  actBtn: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, marginRight: 8 },
  del: { background: '#fee2e2', color: '#dc2626' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: '650px', borderRadius: 12, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
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