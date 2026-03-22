import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', 
});

// Anexa o token de login em cada requisição automaticamente
api.interceptors.request.use((config) => {
  // SINCRONIZAÇÃO: Agora lemos do sessionStorage conforme o AuthContext
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;