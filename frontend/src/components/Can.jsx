import React from 'react';
import { useAuth } from './AuthContext';

export default function Can({ module, action, children }) {
  const { hasPermission } = useAuth();

  if (hasPermission(module, action)) {
    return <>{children}</>;
  }

  return null;
  
}