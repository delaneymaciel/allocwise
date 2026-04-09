import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, Plus, Edit2, Trash2, X, Save, 
  ShieldAlert, ShieldCheck, Lock, CheckSquare, Square,
  AlertTriangle, Copy
} from 'lucide-react';
import api from '../services/api'; // Conector com o backend configurado com interceptadores

// Estrutura Declarativa de Domínio (Bounded Contexts)
const MODULES = [
  { id: 'admin_users', label: 'Gerenciar Usuários', category: 'Administrativo', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'admin_groups', label: 'Grupos de Permissões', category: 'Administrativo', actions: ['view', 'create', 'edit', 'delete'] },
  
  { id: 'op_teams', label: 'Equipes', category: 'Operacional', actions: ['view', 'create', 'edit', 'delete', 'deactivate'] },
  { id: 'op_workitems', label: 'Work Items (Gantt)', category: 'Operacional', actions: ['view', 'edit'] },
  { id: 'op_vacations', label: 'Férias', category: 'Operacional', actions: ['view', 'create', 'edit', 'delete'] },
  
  { id: 'data_import', label: 'Importar CSV', category: 'Integração/Dados', actions: ['view', 'import'] },
  { id: 'data_azure', label: 'Ingestão Azure', category: 'Integração/Dados', actions: ['view', 'import'] },
  { id: 'data_db', label: 'Banco de Dados', category: 'Integração/Dados', actions: ['view', 'delete'], isSensitive: true },
  
  { id: 'dash_financial', label: 'Indicadores Financeiros', category: 'Dashboard', actions: ['view'] },
];

const ACTION_LABELS = {
  view: 'Acessar / Ver', create: 'Cadastrar', 
  edit: 'Editar', delete: 'Excluir', deactivate: 'Inativar', import: 'Importar'
};

const GroupManagement = () => {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // --- Ciclo de Vida: Busca de Dados Reais ---
  const fetchGroups = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/groups');
      setGroups(response.data);
    } catch (error) {
      console.error("Erro ao carregar grupos:", error);
      alert("Falha ao comunicar com o servidor. Verifique a sua ligação.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  // --- Integração CRUD ---
  const handleSaveGroup = async () => {
    try {
      if (editingGroup.id) {
        // Atualização (Wipe & Replace de permissões ocorre no backend)
        await api.put(`/api/groups/${editingGroup.id}`, editingGroup);
      } else {
        // Criação
        await api.post('/api/groups', editingGroup);
      }
      setHasUnsavedChanges(false);
      setIsModalOpen(false);
      setEditingGroup(null);
      fetchGroups(); // Recarrega a grelha para garantir consistência com a BD
    } catch (error) {
      console.error("Erro ao salvar grupo:", error);
      alert("Falha ao salvar as permissões. Consulte os logs do servidor.");
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm("Deseja realmente excluir este grupo de permissões? Os utilizadores associados perderão estes acessos.")) return;
    try {
      await api.delete(`/api/groups/${id}`);
      fetchGroups();
    } catch (error) {
      console.error("Erro ao excluir grupo:", error);
      alert("Não foi possível excluir o grupo. Ele pode estar bloqueado ou em uso.");
    }
  };

  // --- Contadores e Helpers de UX ---
  const activePermissionsCount = useMemo(() => {
    if (!editingGroup) return 0;
    if (editingGroup.isSuperAdmin) return MODULES.reduce((acc, mod) => acc + mod.actions.length, 0);
    return Object.values(editingGroup.permissions).reduce((acc, perms) => acc + perms.length, 0);
  }, [editingGroup]);

  const handleOpenModal = (group = null) => {
    if (group) {
      setEditingGroup({ ...group, permissions: JSON.parse(JSON.stringify(group.permissions)) });
    } else {
      setEditingGroup({ 
        name: '', description: '', is_active: true, 
        isSystem: false, isSuperAdmin: false, permissions: {} 
      });
    }
    setHasUnsavedChanges(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (hasUnsavedChanges && !window.confirm("Existem alterações não salvas. Deseja realmente sair e perder as mudanças?")) {
      return;
    }
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  // --- Motor de Regras: Cascata de Permissões ---
  const togglePermission = (moduleId, action) => {
    if (editingGroup.isSystem || editingGroup.isSuperAdmin) return;
    setHasUnsavedChanges(true);

    const currentModulePerms = editingGroup.permissions[moduleId] || [];
    let newModulePerms = [...currentModulePerms];

    if (action === 'view') {
      if (newModulePerms.includes('view')) {
        newModulePerms = [];
      } else {
        newModulePerms = ['view'];
      }
    } else {
      if (newModulePerms.includes(action)) {
        newModulePerms = newModulePerms.filter(a => a !== action);
      } else {
        newModulePerms.push(action);
        if (!newModulePerms.includes('view')) newModulePerms.push('view');
      }
    }

    setEditingGroup(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [moduleId]: newModulePerms }
    }));
  };

  const handleToggleSuperAdmin = () => {
    if (editingGroup.isSystem) return;
    
    if (!editingGroup.isSuperAdmin) {
      const confirmMsg = "ATENÇÃO Risco de Segurança:\n\nAtivar 'Administrador Total' concede acesso irrestrito a todos os dados e ignora as restrições da matriz de acessos.\n\nConfirma esta ação?";
      if (!window.confirm(confirmMsg)) return;
    }

    setHasUnsavedChanges(true);
    setEditingGroup(prev => ({
      ...prev,
      isSuperAdmin: !prev.isSuperAdmin,
      permissions: !prev.isSuperAdmin ? {} : prev.permissions
    }));
  };

  const isPermitted = (moduleId, action) => {
    if (editingGroup?.isSuperAdmin) return true;
    return editingGroup?.permissions[moduleId]?.includes(action) || false;
  };

  // --- Operações em Massa (Ações Rápidas) ---
  const toggleModuleAll = (moduleId) => {
    if (editingGroup.isSystem || editingGroup.isSuperAdmin) return;
    setHasUnsavedChanges(true);
    
    const moduleDef = MODULES.find(m => m.id === moduleId);
    const currentPerms = editingGroup.permissions[moduleId] || [];
    const hasAll = currentPerms.length === moduleDef.actions.length;
    
    setEditingGroup(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [moduleId]: hasAll ? [] : [...moduleDef.actions] }
    }));
  };

  const toggleColumnAll = (action) => {
    if (editingGroup.isSystem || editingGroup.isSuperAdmin) return;
    setHasUnsavedChanges(true);

    const modulesWithAction = MODULES.filter(m => m.actions.includes(action));
    const allChecked = modulesWithAction.every(m => isPermitted(m.id, action));
    const newPermissions = { ...editingGroup.permissions };

    modulesWithAction.forEach(mod => {
      const currentModPerms = newPermissions[mod.id] || [];
      if (allChecked) {
        newPermissions[mod.id] = currentModPerms.filter(a => a !== action);
        if (action === 'view') newPermissions[mod.id] = [];
      } else {
        if (!currentModPerms.includes(action)) {
            newPermissions[mod.id] = [...currentModPerms, action];
            if (action !== 'view' && !newPermissions[mod.id].includes('view')) {
                newPermissions[mod.id].push('view');
            }
        }
      }
    });

    setEditingGroup(prev => ({ ...prev, permissions: newPermissions }));
  };

  const isModuleAllChecked = (moduleId) => {
    const moduleDef = MODULES.find(m => m.id === moduleId);
    if (editingGroup?.isSuperAdmin) return true;
    const currentPerms = editingGroup?.permissions[moduleId] || [];
    return currentPerms.length === moduleDef.actions.length && currentPerms.length > 0;
  };

  const isColumnAllChecked = (action) => {
    if (editingGroup?.isSuperAdmin) return true;
    const modulesWithAction = MODULES.filter(m => m.actions.includes(action));
    if (modulesWithAction.length === 0) return false;
    return modulesWithAction.every(m => isPermitted(m.id, action));
  };


  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans animate-in fade-in">
      <div className="max-w-7xl mx-auto">
        
        {/* Cabeçalho da Tela de Listagem */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-3 tracking-tight">
              <Settings className="w-7 h-7 text-blue-600" />
              Gestão de Grupos e Permissões (RBAC)
            </h1>
            <p className="text-gray-500 font-medium mt-1">Defina quais módulos cada grupo pode acessar e quais ações pode executar.</p>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-200 transition-all"
          >
            <Plus className="w-5 h-5" /> Novo Grupo
          </button>
        </div>

        {/* Tabela de Listagem com Estado de Carregamento */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
              <p className="text-sm font-bold text-gray-400">Carregando permissões...</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Nome do Grupo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Descrição</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-center">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-gray-50/50 transition-colors group/row">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">{group.name}</span>
                        {group.isSuperAdmin && <ShieldCheck className="w-4 h-4 text-blue-600" title="Administrador Total" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{group.description}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${group.isSystem ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {group.isSystem ? 'Sistema' : 'Personalizado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${group.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {group.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenModal(group)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                          {group.isSystem ? <Lock className="w-4 h-4 text-gray-400" /> : <Edit2 className="w-4 h-4" />}
                        </button>
                        {!group.isSystem && (
                          <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal CRUD: Matriz de Permissões */}
      {isModalOpen && editingGroup && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl my-8 animate-in zoom-in duration-200 flex flex-col max-h-[95vh]">
            
            <header className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-[32px] shrink-0 sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                  {editingGroup.id ? 'Editar Grupo de Acesso' : 'Novo Grupo de Acesso'}
                  {hasUnsavedChanges && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded uppercase tracking-wider font-bold animate-pulse">Não Salvo</span>}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${editingGroup.isSystem ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'}`}>
                    {editingGroup.isSystem ? 'Grupo de Sistema' : 'Grupo Personalizado'}
                  </span>
                  <span className="text-xs font-bold text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                    {activePermissionsCount} Permissões Ativas
                  </span>
                </div>
              </div>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm transition-colors" title="Fechar">
                <X className="w-6 h-6" />
              </button>
            </header>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
              {/* Nível de Informação Superior: Metadados */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Nome do Grupo</label>
                    <input 
                      type="text" 
                      value={editingGroup.name}
                      onChange={(e) => { setEditingGroup({...editingGroup, name: e.target.value}); setHasUnsavedChanges(true); }}
                      disabled={editingGroup.isSystem}
                      className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Ex: Auditores Financeiros"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Descrição</label>
                    <textarea 
                      value={editingGroup.description}
                      onChange={(e) => { setEditingGroup({...editingGroup, description: e.target.value}); setHasUnsavedChanges(true); }}
                      disabled={editingGroup.isSystem}
                      className="w-full p-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      rows="2"
                      placeholder="Propósito e escopo deste grupo..."
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 flex flex-col justify-center space-y-6">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">Políticas Globais</label>
                  
                  <label className="flex items-center gap-4 cursor-pointer group">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={editingGroup.is_active} onChange={e => { setEditingGroup({...editingGroup, is_active: e.target.checked}); setHasUnsavedChanges(true); }} disabled={editingGroup.isSystem} />
                      <div className={`block w-12 h-7 rounded-full transition-colors ${editingGroup.is_active ? 'bg-green-500' : 'bg-gray-300'} ${editingGroup.isSystem ? 'opacity-60' : ''}`}></div>
                      <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${editingGroup.is_active ? 'translate-x-5' : ''}`}></div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-800 block group-hover:text-blue-600 transition-colors">Status do Grupo (Ativo)</span>
                      <span className="text-xs font-medium text-gray-500 block mt-0.5">Controla se os usuários associados podem fazer login no AllocWise.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-4 cursor-pointer group pt-6 border-t border-gray-200">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={editingGroup.isSuperAdmin} onChange={handleToggleSuperAdmin} disabled={editingGroup.isSystem} />
                      <div className={`block w-12 h-7 rounded-full transition-colors ${editingGroup.isSuperAdmin ? 'bg-blue-600' : 'bg-gray-300'} ${editingGroup.isSystem ? 'opacity-60' : ''}`}></div>
                      <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${editingGroup.isSuperAdmin ? 'translate-x-5' : ''}`}></div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-gray-800 flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                        Administrador Total (Superuser) <ShieldCheck className="w-5 h-5 text-blue-600"/>
                      </span>
                      <span className="text-xs font-medium text-gray-500 block mt-0.5">Sobrescreve todas as permissões concedendo acesso irrestrito a todos os dados.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Nível de Informação Inferior: Matriz de Permissões */}
              <div className={`transition-all duration-300 ${editingGroup.isSuperAdmin ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                      Matriz Operacional
                      {editingGroup.isSuperAdmin && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border border-blue-200"><AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5"/>Inativa (Acesso Irrestrito Ativo)</span>}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">Defina granularmente as ações permitidas por módulo. Células hachuradas indicam ações não aplicáveis.</p>
                  </div>
                </div>
                
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[850px]">
                      <thead className="bg-gray-800 text-white sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="px-5 py-4 text-xs font-black uppercase tracking-widest w-[25%] border-r border-gray-700 bg-gray-800">
                            Módulo
                          </th>
                          <th className="px-3 py-4 text-center border-r border-gray-700 bg-gray-800 w-[70px]">
                            <div className="flex flex-col items-center gap-2" title="Marcar todas as permissões aplicáveis do módulo">
                              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Todas</span>
                            </div>
                          </th>
                          {/* Cabeçalho de Ações Rápidas (Checkboxes Mestre por Coluna) */}
                          {Object.entries(ACTION_LABELS).map(([key, label]) => (
                            <th key={key} className="px-2 py-4 text-center border-r border-gray-700 bg-gray-800">
                              <div className="flex flex-col items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 whitespace-nowrap">{label}</span>
                                <button 
                                  type="button"
                                  onClick={() => toggleColumnAll(key)}
                                  disabled={editingGroup.isSystem || editingGroup.isSuperAdmin}
                                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                                  title={`Marcar/Desmarcar todos para ${label}`}
                                >
                                  {isColumnAllChecked(key) ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {['Administrativo', 'Operacional', 'Integração/Dados', 'Dashboard'].map(category => (
                          <React.Fragment key={category}>
                            {/* Linha de Seção (Categoria) */}
                            <tr className="bg-gray-100/80">
                              <td colSpan={9} className="px-5 py-3 text-[11px] font-black uppercase tracking-widest text-gray-800 border-y border-gray-200">
                                {category}
                              </td>
                            </tr>
                            
                            {/* Linhas de Módulos */}
                            {MODULES.filter(m => m.category === category).map(module => (
                              <tr key={module.id} className={`hover:bg-blue-50/40 transition-colors group/row ${module.isSensitive ? 'bg-red-50/20' : ''}`}>
                                <td className="px-5 py-4 border-r border-gray-100 flex items-center gap-3">
                                  <span className={`text-sm font-bold ${module.isSensitive ? 'text-red-600' : 'text-gray-800'}`}>
                                    {module.label}
                                  </span>
                                  {module.isSensitive && (
                                    <div className="relative group/tooltip">
                                      <ShieldAlert className="w-4 h-4 text-red-500 cursor-help" />
                                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/tooltip:block w-48 bg-gray-900 text-white text-[10px] font-bold p-2 rounded-lg text-center z-50">
                                        Módulo Sensível. Ações aqui têm alto impacto.
                                      </div>
                                    </div>
                                  )}
                                </td>
                                
                                {/* Ação Rápida: Checkbox Mestre da Linha */}
                                <td className="px-3 py-4 border-r border-gray-100 text-center bg-gray-50/50">
                                  <button 
                                    type="button"
                                    onClick={() => toggleModuleAll(module.id)}
                                    disabled={editingGroup.isSystem || editingGroup.isSuperAdmin}
                                    className="text-gray-300 hover:text-blue-600 transition-colors disabled:opacity-50"
                                    title="Marcar/Desmarcar todas as permissões deste módulo"
                                  >
                                    {isModuleAllChecked(module.id) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                                  </button>
                                </td>

                                {/* Checkboxes de Permissões */}
                                {Object.keys(ACTION_LABELS).map(action => {
                                  const isAvailable = module.actions.includes(action);
                                  const isChecked = isPermitted(module.id, action);
                                  
                                  return (
                                    <td key={action} className={`px-2 py-4 border-r border-gray-100 text-center transition-colors ${isAvailable ? 'bg-white group-hover/row:bg-transparent' : 'bg-gray-100/50'}`}>
                                      {isAvailable ? (
                                        <input 
                                          type="checkbox" 
                                          checked={isChecked}
                                          onChange={() => togglePermission(module.id, action)}
                                          disabled={editingGroup.isSystem || editingGroup.isSuperAdmin}
                                          className={`w-5 h-5 rounded cursor-pointer transition-all ${action === 'delete' || module.isSensitive ? 'accent-red-500 hover:accent-red-600' : 'accent-blue-600 hover:accent-blue-700'} disabled:opacity-40 disabled:cursor-not-allowed shadow-sm`}
                                          title={`${ACTION_LABELS[action]} em ${module.label}`}
                                        />
                                      ) : (
                                        // Estado "Não Aplicável" com padrão visual hachurado
                                        <div className="w-full h-full flex items-center justify-center opacity-30" title="Ação não aplicável a este módulo" aria-hidden="true">
                                          <div className="w-6 h-1 rounded bg-gray-300 rotate-45"></div>
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <footer className="px-8 py-5 bg-gray-50 rounded-b-[32px] flex justify-between items-center shrink-0 border-t border-gray-200">
              <div className="flex gap-2">
                {!editingGroup.isSystem && editingGroup.id && (
                  <button 
                    type="button"
                    onClick={() => {/* Lógica de Duplicar Grupo no futuro */}}
                    className="px-5 py-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2"
                    title="Criar um novo grupo usando este como modelo"
                  >
                    <Copy className="w-4 h-4"/> Duplicar
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={handleCloseModal} 
                  className="px-6 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleSaveGroup}
                  disabled={editingGroup.isSystem || !hasUnsavedChanges}
                  className={`px-8 py-3 rounded-xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all ${hasUnsavedChanges ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                >
                  <Save className="w-4 h-4" /> Salvar Configuração
                </button>
              </div>
            </footer>

          </div>
        </div>
      )}
    </div>
  );
};

export default GroupManagement;