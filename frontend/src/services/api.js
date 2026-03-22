import axios from 'axios';

// GOVERNANÇA: Base URL dinâmica. Usa a variável da Vercel em produção, ou localhost em dev local.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL, 
});

// Anexa o token de login em cada requisição automaticamente
api.interceptors.request.use((config) => {
  // SINCRONIZAÇÃO: Lemos do sessionStorage conforme o AuthContext
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;