import { createContext, useContext, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Alteração estratégica: sessionStorage garante que o token não persista no disco (Segurança)
  const [token, setToken] = useState(sessionStorage.getItem('token'));
  
  const [user, setUser] = useState(() => {
    const savedToken = sessionStorage.getItem('token');
    if (savedToken && savedToken.split('.').length === 3) {
      try {
        const decoded = jwtDecode(savedToken);
        // Validação de expiração logo na inicialização
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

  const hasPermission = (perm) => user?.permissions?.includes(perm);

  // CRÍTICO: Agora o 'token' é exposto para que o ProtectedRoute e o api.js possam usá-lo
  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);