import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nb_token'));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nb_user')); } catch { return null; }
  });

  // Sync user state when another tab calls updateUser (e.g. email verification)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'nb_user') {
        try { setUser(e.newValue ? JSON.parse(e.newValue) : null); } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  function login(newToken, newUser) {
    localStorage.setItem('nb_token', newToken);
    localStorage.setItem('nb_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem('nb_token');
    localStorage.removeItem('nb_user');
    setToken(null);
    setUser(null);
  }

  function updateUser(updates) {
    const updated = { ...user, ...updates };
    localStorage.setItem('nb_user', JSON.stringify(updated));
    setUser(updated);
  }

  async function refreshPlan() {
    if (!token) return;
    try {
      const res = await fetch('/api/stripe/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.plan) updateUser({ plan: data.plan });
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser, refreshPlan, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
