import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nb_token'));
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('nb_user')); } catch { return null; }
  });

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

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
