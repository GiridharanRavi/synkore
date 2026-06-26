// frontend/src/context/AuthContext.tsx

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee' | 'client';

  // employee-only fields
  employee_code?:      string;
  employee_category?:  string;
  module_access?:      string[];
  stage_access?:       string[];

  // client-only fields
  customer_id?: string;
}

interface AuthContextValue {
  user:    AuthUser | null;
  token:   string   | null;
  login:   (token: string) => void;
  logout:  () => void;
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeParseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') {
    try { return JSON.parse(val) || []; } catch { return []; }
  }
  return [];
}

function decodeToken(token: string): AuthUser | null {
  try {
    const raw = JSON.parse(atob(token.split('.')[1]));
    return {
      ...raw,
      module_access: safeParseArray(raw.module_access),
      stage_access:  safeParseArray(raw.stage_access),
    } as AuthUser;
  } catch {
    return null;
  }
}

/** Returns the correct landing path for each role */
function defaultPath(role: string): string {
  if (role === 'admin')    return '/admin/dashboard';
  if (role === 'employee') return '/employee/dashboard';
  return '/client/dashboard';
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: () => {}, logout: () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,   setToken]   = useState<string | null>(null);
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Rehydrate from localStorage on first render ───────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored) {
      const decoded = decodeToken(stored);
      if (decoded) {
        setToken(stored);
        setUser(decoded);
      } else {
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  // ── login: store token, decode user, navigate to role dashboard ───────────
  const login = useCallback((newToken: string) => {
    const decoded = decodeToken(newToken);
    if (!decoded) {
      console.error('[AuthContext] login() received an invalid token');
      return;
    }
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(decoded);
    window.location.href = defaultPath(decoded.role); // ← no useNavigate needed
  }, []);

  // ── logout: wipe everything, go to /login ─────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    window.location.href = '/login'; // ← no useNavigate needed
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}