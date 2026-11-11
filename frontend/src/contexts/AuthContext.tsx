import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType, RegisterRequest } from '../types';
import { authService } from '../services/auth';
import { getCookie } from '../services/api';
import { SessionUtils } from '../utils';
import { AUTH_EXPIRED_EVENT } from '../services/tokenRefresh';

/** Readable text from a FastAPI error: `detail` may be a string, an object, or a
 *  422 list like [{msg: 'value is not a valid email address'}]. */
function apiErrorMessage(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d: any) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : null)).filter(Boolean);
    if (msgs.length) return msgs.join('. ');
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message;
  return fallback;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);


  // Check if the auth cookie is valid on mount (no token in JS to inspect).
  useEffect(() => {
    const initAuth = async () => {
      // Guests have no session: the non-httpOnly pf_csrf cookie is issued with
      // the refresh token (same lifetime) and cleared on logout, so its absence
      // means there is nothing to check. Skipping the call matters: /auth/* is
      // rate limited (10/min per client IP) and behind the Render/Vercel proxy
      // many visitors share one IP, so a /auth/me (+ /auth/refresh) on every
      // guest page load exhausted the limit and logged real users out (429).
      if (!getCookie('pf_csrf')) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } catch {
        setUser(null);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      // Backend sets httpOnly cookies and returns the user record.
      const userData = await authService.login(email, password);
      setUser(userData);
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Login failed'));
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      await authService.register(data);
      // Auto-login after registration
      await login(data.email, data.password);
    } catch (error: any) {
      throw new Error(apiErrorMessage(error, 'Registration failed'));
    }
  };

  const logout = async () => {
    await authService.logout(SessionUtils.getSessionId());
    setUser(null);
  };

  // The refresh token was rejected (expired / revoked): treat as signed out.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Keep the browser's image session in step with who is signed in (no
  // sharing between accounts on one browser). Waits until the initial auth
  // check is done so a page load doesn't look like a sign-out.
  useEffect(() => {
    if (loading) return;
    SessionUtils.syncWithUser(user ? user.id : null);
  }, [user, loading]);

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
