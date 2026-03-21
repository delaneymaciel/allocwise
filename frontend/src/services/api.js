import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', // Certifique-se que o seu backend está nesta porta
});

// Anexa o token de login em cada requisição automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;