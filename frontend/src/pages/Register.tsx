import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerApi } from '../api/services';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await registerApi({ name: form.name, email: form.email, password: form.password, role: 'admin' });
      setSuccess('Admin account created! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1800);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6)  s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#16a34a'][strength];

  return (
    <div style={styles.page}>
      <div style={styles.bgPattern} />

    

      {/* Right form panel */}
      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardTop}>
            <div style={styles.adminBadge}>🔐 Admin Registration</div>
            <h2 style={styles.cardTitle}>Create Admin Account</h2>
            <p style={styles.cardSub}>Full access to manage customers, orders, and reports</p>
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={styles.successBox}>
              <span>✅</span> {success}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Full Name */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Full Name</label>
              <div style={styles.inputWrap} id="wrap-name">
                <span style={styles.inputIcon}>👤</span>
                <input
                  type="text" required placeholder="John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={styles.input}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
              </div>
            </div>

            {/* Email */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email Address</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>✉</span>
                <input
                  type="email" required placeholder="admin@yourcompany.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={styles.input}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
              </div>
            </div>

            {/* Password */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  type={showPwd ? 'text' : 'password'} required placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ ...styles.input, paddingRight: 44 }}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)} style={styles.eyeBtn}>
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
              {/* Strength bar */}
              {form.password && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3,4].map((i) => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 3,
                        background: i <= strength ? strengthColor : '#e2e8f0',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600, marginTop: 3, display: 'inline-block' }}>
                    {strengthLabel}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div style={{ ...styles.fieldGroup, marginBottom: 8 }}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>🔑</span>
                <input
                  type={showConfirm ? 'text' : 'password'} required placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  style={{ ...styles.input, paddingRight: 44 }}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
                  {showConfirm ? '🙈' : '👁'}
                </button>
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 4, display: 'block' }}>
                  ✗ Passwords don't match
                </span>
              )}
              {form.confirmPassword && form.password === form.confirmPassword && form.password && (
                <span style={{ fontSize: 11, color: '#16a34a', marginTop: 4, display: 'block' }}>
                  ✓ Passwords match
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}
            >
              {loading
                ? <span style={styles.spinnerRow}><span style={styles.spinner} /> Creating account…</span>
                : '🔐 Create Admin Account'}
            </button>
          </form>

          <p style={styles.loginHint}>
            Already have an account?{' '}
            <Link to="/login" style={styles.link}>Sign In</Link>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex',
    fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden',
  },
  bgPattern: {
    position: 'fixed', inset: 0, zIndex: 0,
    backgroundImage: `
      repeating-linear-gradient(45deg, transparent, transparent 18px, rgba(79,70,229,0.04) 18px, rgba(79,70,229,0.04) 19px),
      repeating-linear-gradient(-45deg, transparent, transparent 18px, rgba(79,70,229,0.04) 18px, rgba(79,70,229,0.04) 19px)
    `,
    backgroundSize: '26px 26px',
  },

  left: {
    flex: '0 0 420px', background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '48px 36px', position: 'relative', zIndex: 1, overflowY: 'auto',
  },
  brandArea: { animation: 'fadeUp 0.6s ease both', width: '100%' },
  brandIcon: { fontSize: 48, marginBottom: 14 },
  brandName: {
    margin: '0 0 8px', fontSize: 30, fontWeight: 800,
    color: '#fff', letterSpacing: '-0.02em',
  },
  brandTagline: { margin: '0 0 28px', fontSize: 14, color: '#a5b4fc', lineHeight: 1.65 },

  infoCard: {
    display: 'flex', gap: 12, background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: '14px 16px', marginBottom: 20,
  },
  infoIcon: { fontSize: 20, flexShrink: 0, marginTop: 1 },
  infoTitle: { fontSize: 13, fontWeight: 700, color: '#e0e7ff', marginBottom: 4 },
  infoDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.55 },

  stepsBox: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '14px 16px',
  },
  stepsTitle: { fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: '50%',
    background: '#4338ca', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
  },
  stepText: { fontSize: 13, color: '#c7d2fe', lineHeight: 1.5 },

  right: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 24px', background: '#f7f8fc', position: 'relative', zIndex: 1, overflowY: 'auto',
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '34px 38px',
    width: '100%', maxWidth: 460,
    boxShadow: '0 4px 40px rgba(30,27,75,0.10)',
    animation: 'fadeUp 0.55s 0.1s ease both', opacity: 0,
  },
  cardTop: { marginBottom: 20 },
  adminBadge: {
    display: 'inline-block', background: '#ede9fe', color: '#6d28d9',
    fontSize: 11, fontWeight: 700, padding: '3px 10px',
    borderRadius: 20, marginBottom: 10, letterSpacing: '0.03em',
  },
  cardTitle: {
    margin: '0 0 5px', fontSize: 24, fontWeight: 800,
    color: '#1e1b4b', letterSpacing: '-0.02em',
  },
  cardSub: { margin: 0, fontSize: 13, color: '#64748b' },

  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 10,
    color: '#dc2626', padding: '10px 14px', marginBottom: 18, fontSize: 13,
  },
  successBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
    color: '#16a34a', padding: '10px 14px', marginBottom: 18, fontSize: 13,
  },

  fieldGroup: { marginBottom: 14 },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  inputWrap: {
    display: 'flex', alignItems: 'center', position: 'relative',
    border: '1.5px solid #e0e4ef', borderRadius: 10, overflow: 'visible',
    background: '#fff', transition: 'border-color 0.15s',
  },
  inputIcon: {
    position: 'absolute', left: 13, fontSize: 14, pointerEvents: 'none',
    zIndex: 1, lineHeight: 1,
  },
  input: {
    flex: 1, border: 'none', outline: 'none', padding: '11px 14px 11px 38px',
    fontSize: 14, color: '#1e293b', borderRadius: 10, background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
  },
  eyeBtn: {
    position: 'absolute', right: 10, background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 14, padding: '4px', lineHeight: 1, color: '#94a3b8',
  },

  submitBtn: {
    width: '100%', padding: '13px', background: 'linear-gradient(135deg, #1e1b4b, #4338ca)',
    color: '#fff', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', marginTop: 18, letterSpacing: '0.01em',
    boxShadow: '0 4px 16px rgba(30,27,75,0.28)', transition: 'opacity 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
  submitBtnDisabled: { opacity: 0.7, cursor: 'not-allowed' },
  spinnerRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  spinner: {
    display: 'inline-block', width: 16, height: 16,
    border: '2.5px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  loginHint: { textAlign: 'center', fontSize: 13, color: '#64748b', margin: '16px 0 0' },
  link: { color: '#4f46e5', fontWeight: 700, textDecoration: 'none' },
};