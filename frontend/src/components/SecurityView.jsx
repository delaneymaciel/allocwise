import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function SecurityView() {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  
  const [form, setForm] = useState({ 
    name: '', 
    username: '', 
    email: '', 
    password: '', 
    role: 'Visualizador',
    must_change_password: true
  });
  
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) await api.put(`/api/users/${editingUser.id}`, form);
      else await api.post('/api/users', form);
      
      setEditingUser(null);
      setForm({ name: '', username: '', email: '', password: '', role: 'Visualizador', must_change_password: true });
      fetchUsers();
    } catch (err) {
      alert("Erro ao salvar utilizador. Verifique se o login já existe.");
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await api.patch(`/api/users/${id}/status`);
      fetchUsers();
    } catch (err) {
      alert("Erro ao alterar status.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja realmente excluir este acesso?")) return;
    try {
      await api.delete(`/api/users/${id}`);
      fetchUsers();
    } catch (err) {
      alert("Erro ao excluir.");
    }
  };

  if (loading) return <div className="text-center py-20"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in">
      <div className="lg:col-span-1 bg-white p-5 rounded-3xl shadow-sm border border-gray-200 h-fit">
        <h2 className="text-sm font-black mb-4 text-gray-800 tracking-tight">{editingUser ? 'Editar Acesso' : 'Novo Acesso'}</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <input type="text" placeholder="Nome Completo" className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none focus:border-blue-500" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
          <input type="text" placeholder="Login (Usuário)" className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none focus:border-blue-500 lowercase" value={form.username} onChange={e => setForm({...form, username: e.target.value.replace(/\s+/g, '')})} required />
          <input type="email" placeholder="E-mail (Opcional)" className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none focus:border-blue-500" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          <input type="password" placeholder={editingUser ? "Nova Senha (opcional)" : "Senha Provisória"} className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none focus:border-blue-500" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editingUser} />
          <select className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none appearance-none" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="Administrador">Administrador</option>
            <option value="Gerente">Gerente</option>
            <option value="Visualizador">Visualizador</option>
          </select>
          
          <label className="flex items-center gap-3 cursor-pointer mt-4 p-3 bg-yellow-50/50 rounded-xl border border-yellow-100">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={form.must_change_password} onChange={e => setForm({...form, must_change_password: e.target.checked})} />
              <div className={`block w-8 h-5 rounded-full transition-colors ${form.must_change_password ? 'bg-yellow-500' : 'bg-gray-200'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${form.must_change_password ? 'translate-x-3' : ''}`}></div>
            </div>
            <div>
              <span className="text-[10px] font-black text-yellow-800 block uppercase tracking-widest">Exigir Troca de Senha</span>
              <span className="text-[9px] font-bold text-yellow-600/70 block">Obriga nova senha no 1º login.</span>
            </div>
          </label>

          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-[11px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">{editingUser ? 'Atualizar' : 'Criar Acesso'}</button>
            {editingUser && <button type="button" onClick={() => {setEditingUser(null); setForm({name:'', username:'', email:'', password:'', role:'Visualizador', must_change_password: true});}} className="bg-gray-100 text-gray-500 px-5 py-2.5 rounded-xl font-black text-[11px] hover:bg-gray-200 transition-all">Cancelar</button>}
          </div>
        </form>
      </div>
      <div className="lg:col-span-3 bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 tracking-tighter">
            <tr className="border-b">
              <th className="p-3 text-left">Utilizador</th>
              <th className="p-3 text-left">Login</th>
              <th className="p-3 text-left">Perfil RBAC</th>
              <th className="p-3 text-center">Segurança</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 group transition-colors">
                <td className="p-3">
                  <span className="text-[11px] font-bold text-gray-700 block">{u.name}</span>
                  {u.email && <span className="text-[9px] font-bold text-gray-400">{u.email}</span>}
                </td>
                <td className="p-3 font-mono text-[10px] font-bold text-blue-600">{u.username}</td>
                <td className="p-3"><span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${u.role === 'Administrador' ? 'bg-purple-100 text-purple-700' : u.role === 'Gerente' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span></td>
                <td className="p-3 text-center">
                  {u.must_change_password ? <span className="text-[8px] font-black bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded uppercase tracking-widest" title="Troca de senha pendente">Pendente</span> : <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">OK</span>}
                </td>
                <td className="p-3 text-center"><button onClick={() => handleToggleStatus(u.id)} className={`px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${u.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{u.is_active ? 'Ativo' : 'Bloqueado'}</button></td>
                <td className="p-3 text-right space-x-1">
                  <button onClick={() => {setEditingUser(u); setForm({name: u.name, username: u.username, email: u.email || '', password: '', role: u.role, must_change_password: u.must_change_password});}} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all text-[12px]">✎</button>
                  <button onClick={() => handleDelete(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all text-[12px]">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}