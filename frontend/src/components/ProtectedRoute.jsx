import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { jwtDecode } from 'jwt-decode';

const ProtectedRoute = ({ children, requiredPermission }) => {
  // Agora desestruturamos o 'token' que adicionámos ao AuthContext
  const { user, token, hasPermission } = useAuth();

  // Função de validação em tempo real
  const isTokenValid = (tokenStr) => {
    if (!tokenStr) return false;
    try {
      const { exp } = jwtDecode(tokenStr);
      // exp está em segundos (Unix), Date.now() em milissegundos
      return Date.now() < exp * 1000;
    } catch (e) {
      return false;
    }
  };

  // Blindagem: Se não houver user OU o token no sessionStorage expirou, expulsa para o login
  if (!user || !isTokenValid(token)) {
    return <Navigate to="/login" />;
  }
  
  // Verificação de RBAC (Controle de Acesso Baseado em Regras)
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="p-10 text-red-500 font-black uppercase text-xs tracking-widest text-center">
        ⚠️ Acesso Negado: Você não tem a permissão '{requiredPermission}'.
      </div>
    );
  }

  return children;
};

export const RenderIf = ({ permission, children }) => {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : null;
};

export default ProtectedRoute;