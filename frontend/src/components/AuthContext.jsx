import { createContext, useContext, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken && savedToken.split('.').length === 3) {
      try {
        return jwtDecode(savedToken);
      } catch (e) {
        localStorage.removeItem('token');
        return null;
      }
    }
    return null;
  });

  // O login agora é uma função síncrona que recebe o token validado pelo Login.jsx
  const login = (newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData || jwtDecode(newToken));
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const hasPermission = (perm) => user?.permissions?.includes(perm);

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);