import { useEffect, useRef, useState } from 'react';
import axios from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

interface Profile {
  id?: number;
  user_id?: number;
  customer_id?: string;
  display_name?: string;
  phone?: string;
  alternate_email?: string;
  designation?: string;
  department?: string;
  company_name?: string;
  gst_number?: string;
  pan_number?: string;
  company_website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  language?: string;
  timezone?: string;
  notification_email?: boolean;
  notification_in_app?: boolean;
  notification_sms?: boolean;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
  _seeded?: boolean;
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

function getInitials(name?: string) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={SC.section}>
      <div style={SC.secHead}>
        <span style={SC.secIcon}>{icon}</span>
        <span style={SC.secTitle}>{title}</span>
      </div>
      <div style={SC.secBody}>{children}</div>
    </div>
  );
}

function Field({
  label, name, value, onChange, type = 'text', placeholder = '', readonly = false,
}: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  type?: string; placeholder?: string; readonly?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={SC.field}>
      <label style={SC.label}>{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readonly}
        placeholder={placeholder || label}
        onChange={e => onChange(name, e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          ...SC.input,
          borderColor: readonly ? '#f1f5f9' : focus ? '#6366f1' : '#e2e8f0',
          background:  readonly ? '#f8fafc' : '#fff',
          color:       readonly ? '#94a3b8' : '#0f172a',
          boxShadow:   focus && !readonly ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
        }}
      />
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={SC.toggleRow}>
      <div style={{ flex: 1 }}>
        <div style={SC.toggleLabel}>{label}</div>
        <div style={SC.toggleDesc}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{ ...SC.toggleBtn, background: checked ? '#6366f1' : '#e2e8f0' }}
        aria-checked={checked}
        role="switch"
      >
        <span style={{ ...SC.toggleThumb, transform: checked ? 'translateX(20px)' : 'translateX(2px)' }} />
      </button>
    </div>
  );
}

export default function ClientProfile() {
  const { user: authUser } = useAuth();
  const localUser = getUser();

  // ── Primary identifier: customer_id from JWT (most reliable) ──────────────
  // Falls back to localStorage customer_id, then authUser.id, then localUser.id
  const customerId = authUser?.customer_id || localUser?.customer_id;
  const userId     = authUser?.id          || localUser?.id;

  const [profile,       setProfile]       = useState<Profile>({});
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');
  const [isSeeded,      setIsSeeded]      = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load profile ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId && !userId) { setLoading(false); return; }

    // Always prefer customer_id for lookup — it's the stable identifier
    const query = customerId
      ? `customer_id=${encodeURIComponent(customerId)}`
      : `user_id=${userId}`;

    axios.get(`/client-profile?${query}`)
      .then(res => {
        const p: Profile = res.data || {};
        setProfile(p);
        if (p.avatar_url) setAvatarPreview(p.avatar_url);
        if (p._seeded)    setIsSeeded(true);
      })
      .catch(err => {
        console.error('Profile load error:', err?.response?.data);
      })
      .finally(() => setLoading(false));
  }, [customerId, userId]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    // Need at least customer_id to save (user_id in users table may not match)
    if (!customerId && !userId) {
      setError('No identifier found in session. Please log out and log back in.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const isBase64 = avatarPreview?.startsWith('data:');

      const payload = {
        ...profile,
        // Send customer_id as primary anchor — backend no longer requires user_id in users table
        customer_id: customerId || profile.customer_id || undefined,
        // Still send user_id if available (stored but not validated against users table)
        user_id:     userId ? Number(userId) : undefined,
        avatar_url:  isBase64 ? undefined : (profile.avatar_url || undefined),
        _seeded:     undefined,
      };

      const res = await axios.put('/client-profile', payload);

      setProfile(res.data || profile);
      if (res.data?.avatar_url) setAvatarPreview(res.data.avatar_url);

      setIsSeeded(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.error
        || err?.response?.data?.message
        || 'Failed to save profile. Please try again.';
      setError(msg);
      console.error('Save error:', err?.response?.data);
    } finally {
      setSaving(false);
    }
  };

  const handle = (name: string, value: string) =>
    setProfile(prev => ({ ...prev, [name]: value }));

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Avatar must be under 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setAvatarPreview(url);
      setProfile(prev => ({ ...prev, avatar_url: url }));
    };
    reader.readAsDataURL(file);
  };

  const displayName = profile.display_name || authUser?.name || localUser?.name || '';
  const email       = authUser?.email       || localUser?.email || '';

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={SC.spinner} />
      <p style={{ color: '#94a3b8', marginTop: 12 }}>Loading profile...</p>
    </div>
  );

  return (
    <div style={SC.page}>
      <style>{`
        @keyframes pr-spin    { to { transform: rotate(360deg); } }
        @keyframes pr-fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pr-slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        .pr-save-btn:hover:not(:disabled) { background:#4338ca !important; transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,0.35) !important; }
        .pr-avatar-btn:hover  { background:#ede9fe !important; }
        .pr-section           { animation: pr-fadeUp 0.35s ease both; }
        ::-webkit-scrollbar   { width:4px; }
        ::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px; }
      `}</style>

      <div style={SC.pageHead}>
        <div>
          <div style={SC.eyebrow}>CLIENT PORTAL</div>
          <h2 style={SC.pageTitle}>My Profile</h2>
          <p style={SC.pageSub}>Manage your personal info, company details and preferences</p>
        </div>
        <button
          className="pr-save-btn"
          style={{ ...SC.saveBtn, opacity: saving ? 0.7 : 1 }}
          onClick={save}
          disabled={saving}
        >
          {saving ? <><span style={SC.btnSpinner} /> Saving...</> : saved ? <>✅ Saved!</> : <>💾 Save Changes</>}
        </button>
      </div>

      {/* No identifier warning */}
      {!customerId && !userId && (
        <div style={SC.errorBanner}>
          ⚠️ No Customer ID or User ID found in session. Please log out and log back in.
        </div>
      )}

      {isSeeded && (
        <div style={SC.seededBanner}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span>
            We've pre-filled your profile from your customer record.
            Review the details and click <strong>Save Changes</strong> to confirm.
          </span>
          <button style={SC.seededClose} onClick={() => setIsSeeded(false)} title="Dismiss">✕</button>
        </div>
      )}

      {error && <div style={SC.errorBanner}>⚠️ {error}</div>}

      <div style={SC.layout}>
        <div style={SC.leftCol}>
          <div style={SC.avatarCard} className="pr-section">
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="Avatar" style={SC.avatarImg} />
                : <div style={SC.avatarPlaceholder}>{getInitials(displayName || email)}</div>
              }
              <button className="pr-avatar-btn" style={SC.avatarEditBtn}
                onClick={() => fileRef.current?.click()} title="Change photo">✏️</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />

            <div style={SC.avatarName}>{displayName || '—'}</div>
            <div style={SC.avatarEmail}>{email}</div>

            {customerId && <div style={SC.customerBadge}>🏷️ {customerId}</div>}

            <button style={SC.changePhotoBtn} onClick={() => fileRef.current?.click()}>
              Change Photo
            </button>
            {avatarPreview && (
              <button style={SC.removePhotoBtn}
                onClick={() => { setAvatarPreview(''); setProfile(p => ({ ...p, avatar_url: '' })); }}>
                Remove Photo
              </button>
            )}

            <div style={SC.statsList}>
              {[
                { icon: '🏢', label: 'Company',     value: profile.company_name || '—' },
                { icon: '💼', label: 'Designation', value: profile.designation  || '—' },
                { icon: '📍', label: 'City',        value: profile.city         || '—' },
                { icon: '🌐', label: 'Country',     value: profile.country      || 'India' },
              ].map(s => (
                <div key={s.label} style={SC.statRow}>
                  <span style={SC.statIcon}>{s.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={SC.statLabel}>{s.label}</div>
                    <div style={SC.statValue}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {isSeeded && (
              <div style={SC.seededCardBadge}>⚡ Pre-filled from customer record</div>
            )}

            {profile.updated_at && (
              <div style={SC.lastUpdated}>
                Last updated {new Date(profile.updated_at).toLocaleDateString('en-IN',
                  { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>

        <div style={SC.rightCol}>
          <div className="pr-section" style={{ animationDelay: '0.05s' }}>
            <Section title="Personal Information" icon="👤">
              <div style={SC.grid2}>
                <Field label="Full Name"       name="display_name"    value={profile.display_name    || ''} onChange={handle} />
                <Field label="Email"           name="email"           value={email}                         onChange={handle} readonly />
                <Field label="Phone"           name="phone"           value={profile.phone           || ''} onChange={handle} type="tel" />
                <Field label="Alternate Email" name="alternate_email" value={profile.alternate_email  || ''} onChange={handle} type="email" />
                <Field label="Designation"     name="designation"     value={profile.designation     || ''} onChange={handle} placeholder="e.g. Purchase Manager" />
                <Field label="Department"      name="department"      value={profile.department      || ''} onChange={handle} placeholder="e.g. Procurement" />
              </div>
            </Section>
          </div>

          <div className="pr-section" style={{ animationDelay: '0.1s' }}>
            <Section title="Company Details" icon="🏢">
              <div style={SC.grid2}>
                <Field label="Company Name"    name="company_name"    value={profile.company_name    || ''} onChange={handle} />
                <Field label="GST Number"      name="gst_number"      value={profile.gst_number      || ''} onChange={handle} />
                <Field label="PAN Number"      name="pan_number"      value={profile.pan_number      || ''} onChange={handle} />
                <Field label="Company Website" name="company_website" value={profile.company_website || ''} onChange={handle} type="url" placeholder="https://" />
              </div>
            </Section>
          </div>

          <div className="pr-section" style={{ animationDelay: '0.15s' }}>
            <Section title="Address" icon="📍">
              <div style={SC.grid1}>
                <Field label="Address Line 1" name="address_line1" value={profile.address_line1 || ''} onChange={handle} />
                <Field label="Address Line 2" name="address_line2" value={profile.address_line2 || ''} onChange={handle} />
              </div>
              <div style={{ ...SC.grid2, marginTop: 12 }}>
                <Field label="City"    name="city"    value={profile.city    || ''} onChange={handle} />
                <Field label="State"   name="state"   value={profile.state   || ''} onChange={handle} />
                <Field label="Pincode" name="pincode" value={profile.pincode || ''} onChange={handle} />
                <Field label="Country" name="country" value={profile.country || 'India'} onChange={handle} />
              </div>
            </Section>
          </div>

        

          <div className="pr-section" style={{ animationDelay: '0.25s' }}>
            <Section title="Account Information" icon="🔐">
              <div style={SC.grid2}>
                <Field label="Customer ID"   name="customer_id" value={customerId || '—'}          onChange={() => {}} readonly />
                <Field label="User ID"       name="user_id"     value={String(userId || '—')}       onChange={() => {}} readonly />
                <Field label="Account Role"  name="role"        value="Client"                      onChange={() => {}} readonly />
                <Field label="Account Since" name="created_at"
                  value={profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                  onChange={() => {}} readonly />
              </div>
            </Section>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 24 }}>
            <button className="pr-save-btn" style={{ ...SC.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={save} disabled={saving}>
              {saving ? '⏳ Saving...' : saved ? '✅ Saved!' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SC: Record<string, React.CSSProperties> = {
  page:      { fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: '100%', paddingBottom: 40 },
  pageHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' },
  eyebrow:   { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 },
  pageSub:   { fontSize: 13, color: '#64748b', marginTop: 3 },
  seededBanner: { display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600, animation: 'pr-slideIn 0.3s ease' },
  seededClose: { marginLeft: 'auto', background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 4px', lineHeight: 1 },
  seededCardBadge: { marginTop: 12, fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#dbeafe', borderRadius: 20, padding: '3px 10px', display: 'inline-block' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600 },
  saveBtn:    { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .18s', boxShadow: '0 2px 10px rgba(99,102,241,0.25)', fontFamily: 'inherit' },
  btnSpinner: { display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pr-spin 0.7s linear infinite' },
  spinner:    { display: 'inline-block', width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'pr-spin 0.8s linear infinite' },
  layout:  { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' },
  leftCol: { position: 'sticky', top: 80 },
  rightCol:{ display: 'flex', flexDirection: 'column', gap: 16 },
  avatarCard:        { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  avatarImg:         { width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0' },
  avatarPlaceholder: { width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' },
  avatarEditBtn:     { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', border: '2px solid #fff', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, transition: 'background .15s' },
  avatarName:        { marginTop: 14, fontSize: 16, fontWeight: 800, color: '#0f172a' },
  avatarEmail:       { fontSize: 12, color: '#64748b', marginTop: 3 },
  customerBadge:     { display: 'inline-block', marginTop: 8, background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 },
  changePhotoBtn:    { display: 'block', width: '100%', marginTop: 14, padding: '8px 0', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4f46e5', fontFamily: 'inherit', transition: 'background .15s' },
  removePhotoBtn:    { display: 'block', width: '100%', marginTop: 6, padding: '7px 0', borderRadius: 8, border: '1.5px solid #fee2e2', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626', fontFamily: 'inherit' },
  statsList:         { textAlign: 'left', marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 14 },
  statRow:           { display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 },
  statIcon:          { fontSize: 14, flexShrink: 0, marginTop: 1 },
  statLabel:         { fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue:         { fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 1, wordBreak: 'break-word' },
  lastUpdated:       { marginTop: 14, fontSize: 10.5, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 10 },
  section:  { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  secHead:  { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' },
  secIcon:  { fontSize: 16 },
  secTitle: { fontSize: 14, fontWeight: 800, color: '#0f172a' },
  secBody:  { padding: '16px 18px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  grid1: { display: 'grid', gridTemplateColumns: '1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif", transition: 'border .15s, box-shadow .15s', color: '#0f172a', width: '100%', boxSizing: 'border-box' },
  notifLabel:  { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 },
  toggleList:  { display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' },
  toggleRow:   { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #f1f5f9' },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: '#1e293b' },
  toggleDesc:  { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  toggleBtn:   { width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s', padding: 0 },
  toggleThumb: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'transform .2s' },
};