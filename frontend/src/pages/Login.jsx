import React, { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function Login() {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/login', creds);
      login(res.data.access_token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.requirePasswordChange) {
        setRequirePasswordChange(true);
        // Blindagem: Limpa a senha provisória, mas mantém o username para o próximo passo
        setCreds({ ...creds, password: '' }); 
      } else {
        setError(err.response?.data?.detail || "Falha no login. Verifique as credenciais.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(newPassword)) {
      return setError('A senha deve ter no mínimo 8 caracteres, contendo maiúsculas, minúsculas, números e símbolos.');
    }

    setLoading(true);
    try {
      // SINCRONIZAÇÃO: Usamos o username do estado 'creds' para localizar o usuário no banco
      await api.post('/api/users/change-initial-password', { 
        username: creds.username, 
        newPassword 
      });
      setRequirePasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      alert('Senha atualizada com sucesso! Por favor, entre com sua nova senha.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao atualizar senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-800 tracking-tight">AllocWise</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Intelligence in Resource Management</p>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold text-center border border-red-100 animate-in fade-in">{error}</div>}

        {!requirePasswordChange ? (
          <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Usuário (Login)</label>
              <input type="text" className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-colors lowercase" value={creds.username} onChange={e => setCreds({...creds, username: e.target.value.replace(/\s+/g, '')})} required autoFocus />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Senha</label>
              <input type="password" className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-colors" value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 mt-2">
              {loading ? 'Autenticando...' : 'Entrar no Sistema'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-5 animate-in slide-in-from-right-4 fade-in">
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 mb-6">
              <span className="text-[10px] font-black text-yellow-800 uppercase tracking-widest block mb-1">Ação Requerida</span>
              <p className="text-xs text-yellow-700 font-medium">Por segurança, defina uma senha forte antes de acessar o Dashboard.</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nova Senha Forte</label>
              <input type="password" className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-colors" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Confirmar Nova Senha</label>
              <input type="password" className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-colors" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-yellow-500 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-yellow-100 hover:bg-yellow-600 transition-all disabled:opacity-50 mt-2">
              {loading ? 'Salvando...' : 'Definir Senha e Entrar'}
            </button>
            <button type="button" onClick={() => { setRequirePasswordChange(false); setCreds({...creds, password: ''}); setError(''); }} className="w-full bg-transparent text-gray-400 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:text-gray-600 transition-all mt-2">
              Voltar ao Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}