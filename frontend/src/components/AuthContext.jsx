import { createContext, useContext, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(sessionStorage.getItem('token'));
  
  const [user, setUser] = useState(() => {
    const savedToken = sessionStorage.getItem('token');
    if (savedToken && savedToken.split('.').length === 3) {
      try {
        const decoded = jwtDecode(savedToken);
        if (decoded.exp * 1000 < Date.now()) {
          sessionStorage.removeItem('token');
          return null;
        }
        return decoded;
      } catch (e) {
        sessionStorage.removeItem('token');
        return null;
      }
    }
    return null;
  });

  const login = (newToken, userData) => {
    sessionStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData || jwtDecode(newToken));
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const hasPermission = (module, action) => {
    if (user?.is_superadmin) return true;
    return user?.permissions?.includes(`${module}:${action}`);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);