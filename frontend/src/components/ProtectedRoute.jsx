import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Removemos o 'export' daqui para definir no final como default
const ProtectedRoute = ({ children, requiredPermission }) => {
  const { user, hasPermission } = useAuth();

  if (!user) return <Navigate to="/login" />;
  
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <div className="p-10 text-red-500 font-black uppercase text-xs">Acesso Negado: Você não tem permissão.</div>;
  }

  return children;
};

// Mantemos este como named export caso você precise em outros lugares
export const RenderIf = ({ permission, children }) => {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : null;
};

// ESSA LINHA RESOLVE O ERRO NO APP.JSX
export default ProtectedRoute;