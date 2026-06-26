import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loginApi } from '../api/services';

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { login }             = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi(form);
      login(res.data.token); // ← pass only the token; AuthContext handles navigation
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Background fabric pattern */}
      <div style={styles.bgPattern} />

      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardTop}>
            <h2 style={styles.cardTitle}>Welcome back</h2>
            <p style={styles.cardSub}>Sign in to your account to continue</p>
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="on">
            {/* Email */}
            <div style={styles.fieldGroup}>
              <label style={styles.label} htmlFor="email">Email address</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>✉</span>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={styles.input}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ ...styles.fieldGroup, marginBottom: 6 }}>
              <label style={styles.label} htmlFor="password">Password</label>
              <div style={styles.inputWrap}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ ...styles.input, paddingRight: 44 }}
                  onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = '#4f46e5')}
                  onBlur={(e)  => (e.currentTarget.parentElement!.style.borderColor = '#e0e4ef')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={styles.eyeBtn}
                  title={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}
            >
              {loading ? (
                <span style={styles.spinnerRow}>
                  <span style={styles.spinner} /> Signing in…
                </span>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <div style={styles.divider} />

          <p style={styles.clientNote}>
            💡 <strong>Clients:</strong> use the <em>Email Login</em> credentials set by your admin.
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
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
  right: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 24px', background: '#f7f8fc', position: 'relative', zIndex: 1,
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '36px 38px',
    width: '100%', maxWidth: 440,
    boxShadow: '0 4px 40px rgba(30,27,75,0.10)',
    animation: 'fadeUp 0.55s 0.1s ease both', opacity: 0,
  },
  cardTop: { marginBottom: 20 },
  cardTitle: {
    margin: '0 0 5px', fontSize: 26, fontWeight: 800,
    color: '#1e1b4b', letterSpacing: '-0.02em',
  },
  cardSub: { margin: 0, fontSize: 14, color: '#64748b' },
  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 10,
    color: '#dc2626', padding: '10px 14px', marginBottom: 18, fontSize: 13,
  },
  errorIcon: { fontSize: 15, flexShrink: 0 },
  fieldGroup: { marginBottom: 16 },
  label: {
    display: 'block', fontSize: 12, fontWeight: 700, color: '#475569',
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
    cursor: 'pointer', fontSize: 14, padding: '4px', lineHeight: 1,
    color: '#94a3b8',
  },
  submitBtn: {
    width: '100%', padding: '13px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', marginTop: 20, letterSpacing: '0.01em',
    boxShadow: '0 4px 16px rgba(79,70,229,0.35)', transition: 'opacity 0.2s',
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
  divider: {
    height: 1, background: '#e2e8f0', margin: '20px 0 16px',
  },
  clientNote: {
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
    padding: '10px 14px', fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.55,
  },
};