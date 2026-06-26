import React, {
  useEffect,
  useState,
} from 'react';

import axios from '../../api/axios';

import {
  getSampleRequests,
  deleteSampleRequest,
} from '../../api/services';

// ── ADD THIS IMPORT ──────────────────────────
import { useNotification } from './NotificationContext';
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

const BASE_URL = 'http://localhost:5000';

const emptyForm = {
  request_code: '',
  customer_name: '',
  agent_name: '',
  sample_type: 'whatsapp',
  fabric_code: '',
  fabric_quality: '',
  color: '',
  quantity_meters: '',
  customer_comments: '',
  status: 'pending',
};

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export default function SampleRequests() {
  // ── ADD THIS LINE ────────────────────────────
  const { addNotification } = useNotification();
  // ─────────────────────────────────────────────

  const [records, setRecords] = useState<
    SampleRecord[]
  >([]);
  const [form, setForm] =
    useState<any>(emptyForm);
  const [imageFile, setImageFile] =
    useState<File | null>(null);
  const [imagePreview, setImagePreview] =
    useState<string | null>(null);
  const [removeImage, setRemoveImage] =
    useState(false);
  const [showModal, setShowModal] =
    useState(false);
  const [editId, setEditId] =
    useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const [searchQuery, setSearchQuery] =
    useState('');
  const [currentPage, setCurrentPage] =
    useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* =========================
     LOAD DATA
  ========================= */

  const loadData = () => {
    setLoading(true);

    getSampleRequests()
      .then((d: any) => {
        const rows = Array.isArray(d.data)
          ? d.data
          : Array.isArray(d)
          ? d
          : [];
        setRecords(rows);
        setCurrentPage(1);
        setSearchQuery('');
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  /* =========================
     SEARCH + PAGINATION
  ========================= */

  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.request_code?.toLowerCase().includes(q) ||
      r.customer_name
        ?.toLowerCase()
        .includes(q) ||
      r.agent_name?.toLowerCase().includes(q) ||
      r.sample_type?.toLowerCase().includes(q) ||
      r.fabric_code?.toLowerCase().includes(q) ||
      r.fabric_quality
        ?.toLowerCase()
        .includes(q) ||
      r.color?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q) ||
      String(r.quantity_meters ?? '').includes(q)
    );
  });

  const totalRecords = filteredRecords.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalRecords / pageSize)
  );

  const paginatedRecords =
    filteredRecords.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++)
        pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(
        2,
        currentPage - 1
      );
      const end = Math.min(
        totalPages - 1,
        currentPage + 1
      );
      for (let i = start; i <= end; i++)
        pages.push(i);
      if (currentPage < totalPages - 2)
        pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  /* =========================
     IMAGE
  ========================= */

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowed.includes(file.type)) {
      setError('Only JPG, PNG, WEBP or GIF allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setError(null);
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  };

  /* =========================
     SUBMIT (add / edit)
  ========================= */

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append(
        'request_code',
        form.request_code
      );
      formData.append(
        'customer_name',
        form.customer_name
      );
      formData.append(
        'agent_name',
        form.agent_name
      );
      formData.append(
        'sample_type',
        form.sample_type
      );
      formData.append(
        'fabric_code',
        form.fabric_code
      );
      formData.append(
        'fabric_quality',
        form.fabric_quality
      );
      formData.append('color', form.color);
      formData.append(
        'quantity_meters',
        form.quantity_meters
      );
      formData.append(
        'customer_comments',
        form.customer_comments
      );
      formData.append('status', form.status);

      if (imageFile)
        formData.append('image', imageFile);
      if (removeImage)
        formData.append('remove_image', 'true');

      if (editId) {
        await axios.put(
          `/sample-requests/${editId}`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        // ── NOTIFICATION: edit ────────────────────
        addNotification(
          'success',
          'Sample Request Updated',
          `"${form.request_code}" has been updated successfully.`
        );
        // ─────────────────────────────────────────
      } else {
        await axios.post(
          '/sample-requests',
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        // ── NOTIFICATION: add ─────────────────────
        addNotification(
          'success',
          'Sample Request Added',
          `New request "${form.request_code}" created for ${form.customer_name}.`
        );
        // ─────────────────────────────────────────
      }

      closeModal();
      loadData();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        'Save failed';
      setError(msg);

      // ── NOTIFICATION: error ───────────────────
      addNotification('error', 'Save Failed', msg);
      // ─────────────────────────────────────────
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================
     OPEN / CLOSE MODAL
  ========================= */

  const openModal = (r?: SampleRecord) => {
    setError(null);
    setImageFile(null);
    setRemoveImage(false);

    if (r) {
      setEditId(r.id);
      setForm({
        request_code: r.request_code || '',
        customer_name: r.customer_name || '',
        agent_name: r.agent_name || '',
        sample_type:
          r.sample_type || 'whatsapp',
        fabric_code: r.fabric_code || '',
        fabric_quality:
          r.fabric_quality || '',
        color: r.color || '',
        quantity_meters:
          r.quantity_meters || '',
        customer_comments:
          r.customer_comments || '',
        status: r.status || 'pending',
      });
      setImagePreview(
        r.image_url
          ? `${BASE_URL}${r.image_url}`
          : null
      );
    } else {
      setEditId(null);
      setForm(emptyForm);
      setImagePreview(null);
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setError(null);
  };

  /* =========================
     DELETE
  ========================= */

  const handleDelete = async (
    r: SampleRecord
  ) => {
    if (
      !window.confirm(
        `Delete request "${r.request_code}"?`
      )
    )
      return;

    try {
      await deleteSampleRequest(r.id);

      // ── NOTIFICATION: delete ──────────────────
      addNotification(
        'warning',
        'Sample Request Deleted',
        `Request "${r.request_code}" for ${r.customer_name} has been deleted.`
      );
      // ─────────────────────────────────────────

      loadData();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Delete failed';
      alert(msg);

      // ── NOTIFICATION: delete error ────────────
      addNotification(
        'error',
        'Delete Failed',
        msg
      );
      // ─────────────────────────────────────────
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div style={s.container}>

      {/* HEADER */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>
            Sample Requests
          </h2>
          <p style={s.subtitle}>
            Fabric sample management
          </p>
        </div>
        <button
          style={s.addBtn}
          onClick={() => openModal()}
        >
          + New Request
        </button>
      </div>

      {/* TABLE */}
      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : (
        <div style={s.tableCard}>

          {/* Toolbar */}
          <div style={s.tableToolbar}>
            <div style={s.searchWrap}>
              <span style={s.searchIcon}>
                🔍
              </span>
              <input
                style={s.searchInput}
                type="text"
                placeholder="Search by code, customer, agent, fabric, color, status..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(
                    e.target.value
                  );
                  setCurrentPage(1);
                }}
              />
              {searchQuery && (
                <button
                  style={s.searchClear}
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div style={s.toolbarRight}>
              <div style={s.totalCount}>
                {searchQuery ? (
                  <>
                    <strong>
                      {totalRecords}
                    </strong>{' '}
                    of{' '}
                    <strong>
                      {records.length}
                    </strong>{' '}
                    records
                  </>
                ) : (
                  <>
                    <strong>
                      {totalRecords}
                    </strong>{' '}
                    records
                  </>
                )}
              </div>

              <div style={s.pageSizeWrap}>
                <span style={s.pageSizeLabel}>
                  Rows per page:
                </span>
                <select
                  style={s.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(
                      Number(e.target.value)
                    );
                    setCurrentPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TABLE */}
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>IMAGE</th>
                <th style={s.th}>CODE</th>
                <th style={s.th}>CUSTOMER</th>
                <th style={s.th}>AGENT</th>
                <th style={s.th}>TYPE</th>
                <th style={s.th}>FABRIC</th>
                <th style={s.th}>COLOR</th>
                <th style={s.th}>QTY</th>
                <th style={s.th}>STATUS</th>
                <th style={s.th}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={s.empty}
                  >
                    {searchQuery
                      ? `No results for "${searchQuery}"`
                      : 'No sample requests'}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r) => (
                  <tr
                    key={r.id}
                    style={s.tableRow}
                  >
                    <td style={s.td}>
                      {r.image_url ? (
                        <img
                          src={
                            r.image_url?.startsWith(
                              'http'
                            )
                              ? r.image_url
                              : `${BASE_URL}${r.image_url}`
                          }
                          alt="fabric"
                          style={s.thumb}
                        />
                      ) : (
                        <div style={s.noImg}>
                          No Img
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      {r.request_code}
                    </td>
                    <td style={s.td}>
                      {r.customer_name}
                    </td>
                    <td style={s.td}>
                      {r.agent_name}
                    </td>
                    <td style={s.td}>
                      {r.sample_type}
                    </td>
                    <td style={s.td}>
                      <div>{r.fabric_code}</div>
                      <small>
                        {r.fabric_quality}
                      </small>
                    </td>
                    <td style={s.td}>
                      {r.color}
                    </td>
                    <td style={s.td}>
                      {r.quantity_meters}
                    </td>
                    <td style={s.td}>
                      <span style={s.badge}>
                        {r.status}
                      </span>
                    </td>
                    <td style={s.td}>
                      <button
                        style={s.editBtn}
                        onClick={() =>
                          openModal(r)
                        }
                      >
                        Edit
                      </button>
                      <button
                        style={s.deleteBtn}
                        onClick={() =>
                          handleDelete(r)
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* PAGINATION FOOTER */}
          <div style={s.paginationBar}>
            <span style={s.pageInfo}>
              Showing{' '}
              <strong>
                {totalRecords === 0
                  ? 0
                  : (currentPage - 1) *
                      pageSize +
                    1}
              </strong>
              {' '}–{' '}
              <strong>
                {Math.min(
                  currentPage * pageSize,
                  totalRecords
                )}
              </strong>
              {' '}of{' '}
              <strong>{totalRecords}</strong>
            </span>

            <div style={s.pageControls}>
              <button
                style={{
                  ...s.pageBtn,
                  ...(currentPage === 1
                    ? s.pageBtnDisabled
                    : {}),
                }}
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                title="First page"
              >
                «
              </button>

              <button
                style={{
                  ...s.pageBtn,
                  ...(currentPage === 1
                    ? s.pageBtnDisabled
                    : {}),
                }}
                onClick={() =>
                  goToPage(currentPage - 1)
                }
                disabled={currentPage === 1}
                title="Previous page"
              >
                ‹
              </button>

              {getPageNumbers().map(
                (p, idx) =>
                  p === '...' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      style={s.ellipsis}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      style={{
                        ...s.pageBtn,
                        ...(p === currentPage
                          ? s.pageBtnActive
                          : {}),
                      }}
                      onClick={() =>
                        goToPage(p as number)
                      }
                    >
                      {p}
                    </button>
                  )
              )}

              <button
                style={{
                  ...s.pageBtn,
                  ...(currentPage === totalPages
                    ? s.pageBtnDisabled
                    : {}),
                }}
                onClick={() =>
                  goToPage(currentPage + 1)
                }
                disabled={
                  currentPage === totalPages
                }
                title="Next page"
              >
                ›
              </button>

              <button
                style={{
                  ...s.pageBtn,
                  ...(currentPage === totalPages
                    ? s.pageBtnDisabled
                    : {}),
                }}
                onClick={() =>
                  goToPage(totalPages)
                }
                disabled={
                  currentPage === totalPages
                }
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3>
                {editId
                  ? 'Edit Sample Request'
                  : 'New Sample Request'}
              </h3>
              <button
                style={s.closeBtn}
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            {error && (
              <div style={s.error}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={s.grid}>
                <input
                  style={s.input}
                  placeholder="Request Code"
                  value={form.request_code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      request_code:
                        e.target.value,
                    })
                  }
                  required
                />
                <input
                  style={s.input}
                  placeholder="Customer Name"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customer_name:
                        e.target.value,
                    })
                  }
                  required
                />
                <input
                  style={s.input}
                  placeholder="Agent Name"
                  value={form.agent_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      agent_name: e.target.value,
                    })
                  }
                />
                <select
                  style={s.input}
                  value={form.sample_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sample_type: e.target.value,
                    })
                  }
                >
                  <option value="parcel">
                    Parcel
                  </option>
                  <option value="whatsapp">
                    WhatsApp
                  </option>
                </select>
                <input
                  style={s.input}
                  placeholder="Fabric Code"
                  value={form.fabric_code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fabric_code: e.target.value,
                    })
                  }
                />
                <input
                  style={s.input}
                  placeholder="Fabric Quality"
                  value={form.fabric_quality}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fabric_quality:
                        e.target.value,
                    })
                  }
                />
                <input
                  style={s.input}
                  placeholder="Color"
                  value={form.color}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      color: e.target.value,
                    })
                  }
                />
                <input
                  style={s.input}
                  type="number"
                  placeholder="Quantity Meters"
                  value={form.quantity_meters}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quantity_meters:
                        e.target.value,
                    })
                  }
                />
                <select
                  style={s.input}
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value,
                    })
                  }
                >
                  <option value="pending">
                    Pending
                  </option>
                  <option value="development_analysis">
                    Development Analysis
                  </option>
                  <option value="submitted">
                    Submitted
                  </option>
                  <option value="approved">
                    Approved
                  </option>
                  <option value="rejected">
                    Rejected
                  </option>
                  <option value="rework">
                    Rework
                  </option>
                  <option value="collected">
                    Collected
                  </option>
                </select>
              </div>

              <textarea
                style={s.textarea}
                placeholder="Customer Comments"
                value={form.customer_comments}
                onChange={(e) =>
                  setForm({
                    ...form,
                    customer_comments:
                      e.target.value,
                  })
                }
              />

              {/* IMAGE */}
              <div style={s.uploadBox}>
                <div>Upload Fabric Image</div>
                {imagePreview ? (
                  <div style={s.previewWrap}>
                    <img
                      src={imagePreview}
                      alt="preview"
                      style={s.preview}
                    />
                    <div>
                      <label style={s.changeBtn}>
                        Change
                        <input
                          type="file"
                          hidden
                          onChange={
                            handleImageChange
                          }
                        />
                      </label>
                      <button
                        type="button"
                        style={s.removeBtn}
                        onClick={handleRemoveImage}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label style={s.dropzone}>
                    <input
                      type="file"
                      hidden
                      onChange={handleImageChange}
                    />
                    Click to Upload Image
                  </label>
                )}
              </div>

              {/* FOOTER */}
              <div style={s.footer}>
                <button
                  type="button"
                  style={s.cancelBtn}
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={s.saveBtn}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Saving...'
                    : editId
                    ? 'Update'
                    : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   STYLES  (unchanged)
========================= */

const s: Record<
  string,
  React.CSSProperties
> = {
  container: {
    padding: 24,
    background: '#f8fafc',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  subtitle: {
    color: '#64748b',
    marginTop: 4,
  },
  addBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  tableCard: {
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
  },
  tableToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative' as const,
    flex: 1,
    minWidth: 200,
    maxWidth: 420,
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0 10px',
    gap: 6,
  },
  searchIcon: {
    fontSize: 14,
    flexShrink: 0,
    userSelect: 'none' as const,
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 13,
    padding: '8px 0',
    background: 'transparent',
    color: '#374151',
  },
  searchClear: {
    border: 'none',
    background: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#94a3b8',
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  totalCount: {
    fontSize: 13,
    color: '#475569',
    whiteSpace: 'nowrap' as const,
  },
  pageSizeWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  pageSizeLabel: {
    fontSize: 13,
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
  },
  pageSizeSelect: {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    fontSize: 13,
    cursor: 'pointer',
    background: '#fff',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: 14,
    background: '#f8fafc',
    textAlign: 'left',
    fontSize: 12,
    borderBottom: '1px solid #e2e8f0',
  },
  td: {
    padding: 14,
    borderBottom: '1px solid #f1f5f9',
    fontSize: 14,
  },
  tableRow: {
    transition: 'background 0.15s',
  },
  thumb: {
    width: 55,
    height: 55,
    objectFit: 'cover',
    borderRadius: 8,
  },
  noImg: {
    width: 55,
    height: 55,
    background: '#e2e8f0',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 11,
  },
  badge: {
    background: '#dbeafe',
    color: '#1d4ed8',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
  },
  editBtn: {
    marginRight: 8,
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: '#f1f5f9',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    cursor: 'pointer',
  },
  paginationBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderTop: '1px solid #e2e8f0',
    background: '#f8fafc',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  pageInfo: {
    fontSize: 13,
    color: '#475569',
  },
  pageControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  pageBtn: {
    minWidth: 34,
    height: 34,
    padding: '0 8px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    background: '#fff',
    color: '#374151',
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  pageBtnActive: {
    background: '#2563eb',
    color: '#fff',
    border: '1px solid #2563eb',
    fontWeight: 700,
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  ellipsis: {
    padding: '0 4px',
    color: '#94a3b8',
    fontSize: 14,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    width: '100%',
    maxWidth: 750,
    borderRadius: 12,
    padding: 24,
    maxHeight: '95vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    fontSize: 24,
    cursor: 'pointer',
  },
  error: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 15,
  },
  input: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 14,
  },
  textarea: {
    width: '100%',
    marginTop: 15,
    minHeight: 90,
    borderRadius: 8,
    border: '1px solid #d1d5db',
    padding: 12,
    fontSize: 14,
  },
  uploadBox: {
    marginTop: 20,
  },
  dropzone: {
    border: '2px dashed #cbd5e1',
    borderRadius: 10,
    padding: 30,
    display: 'flex',
    justifyContent: 'center',
    cursor: 'pointer',
    background: '#f8fafc',
  },
  previewWrap: {
    display: 'flex',
    gap: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  preview: {
    width: 90,
    height: 90,
    objectFit: 'cover',
    borderRadius: 10,
  },
  changeBtn: {
    display: 'inline-block',
    background: '#2563eb',
    color: '#fff',
    padding: '7px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    marginRight: 10,
  },
  removeBtn: {
    padding: '7px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    cursor: 'pointer',
  },
  footer: {
    marginTop: 24,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  loading: {
    padding: 50,
    textAlign: 'center',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#94a3b8',
  },
};