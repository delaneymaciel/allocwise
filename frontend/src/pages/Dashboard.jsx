import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../services/api'; 
import { useAuth } from '../components/AuthContext';
import GanttView from '../components/GanttView';
import VacationsView from '../components/VacationsView';
import AdminView from '../components/AdminView';
import SecurityView from '../components/SecurityView';




const DEFAULT_STATUS_FILTER = [
  "Em Andamento", "Em Code Review", "Em Correção", "Em Desenvolvimento",
  "Em Garantia", "Em Homologação", "Em QA", "Em RDM", 
  "Em Refinamento", "Impedido", "Paralisado", "Refinamento com TI"
];

export default function Dashboard() {
  const { logout } = useAuth();
  const fileInputRef = useRef(null); 
  const [data, setData] = useState([]);
  const [resources, setResources] = useState([]); 
  const [holidays, setHolidays] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]); 
  
  const [filterText, setFilterText] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");

  const [columnFilters, setColumnFilters] = useState({});
  const [viewMode, setViewMode] = useState('list'); 
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [loading, setLoading] = useState(true);
 
  const [selectedItem, setSelectedItem] = useState(null);
  const [targetPhase, setTargetPhase] = useState('Dev');
  const [assignments, setAssignments] = useState({ Dev: [], QA: [], HML: [] });
  const [allocationConflict, setAllocationConflict] = useState(null);
  
  const [editingResource, setEditingResource] = useState(null);
  const [resourceForm, setResourceForm] = useState({ name: '', role: 'Desenvolvedor', color_code: '#3b82f6', squad: 'Salesforce' });

  const [userPreferences, setUserPreferences] = useState({ ganttStrictDates: true, ganttStatusFilter: DEFAULT_STATUS_FILTER, selectedSystems: [], ganttShowTeamNames: true });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false); 
  const [settingsForm, setSettingsForm] = useState({ ganttStrictDates: true, ganttStatusFilter: DEFAULT_STATUS_FILTER, selectedSystems: [], ganttShowTeamNames: true });

  const [editingMetadata, setEditingMetadata] = useState(null);
  const [metadataForm, setMetadataForm] = useState({ area: '', diretor: '', frente: '' });

  const [listScrollTop, setListScrollTop] = useState(0);
  const listRowHeight = 36; 
  const listVisibleRows = 25;
  const listOverscan = 10;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filterText), 50);
    return () => clearTimeout(t);
  }, [filterText]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const safeGet = async (url) => {
        try { return await api.get(url); } 
        catch (error) {
          if (error.response?.status === 401) { logout(); throw new Error("Sessão Expirada"); }
          return null;
        }
      };

      const [resItems, resStaff, resHolidays, resAbsences, resAllAssign, resPrefs] = await Promise.all([
        safeGet('/api/workitems'), safeGet('/api/resources'), safeGet('/api/holidays'),
        safeGet('/api/absences'), safeGet('/api/assignments/all'), safeGet('/api/users/me/preferences')
      ]);

      const extract = (res) => Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);

      setData(extract(resItems));
      setResources(extract(resStaff));
      setHolidays(extract(resHolidays));
      setAbsences(extract(resAbsences));
      setAllAssignments(extract(resAllAssign));
      
      const uPref = resPrefs?.data || {};

      const prefs = { 
        ganttStrictDates: uPref.ganttStrictDates !== undefined ? uPref.ganttStrictDates : true, 
        ganttStatusFilter: uPref.ganttStatusFilter?.length > 0 ? uPref.ganttStatusFilter : DEFAULT_STATUS_FILTER,
        selectedSystems: uPref.selectedSystems || [],
        ganttScrollPosition: uPref.ganttScrollPosition || null,
        vacationsScrollPosition: uPref.vacationsScrollPosition || null,
        ganttShowTeamNames: uPref.ganttShowTeamNames !== undefined ? uPref.ganttShowTeamNames : true
      };

      setUserPreferences(prefs);
      setSettingsForm(prefs);
      
    } catch (err) { 
      if (err.message !== "Sessão Expirada") console.error(err); 
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveScrollPosition = (view, pos) => {
    setUserPreferences(prev => {
      const key = view === 'gantt' ? 'ganttScrollPosition' : 'vacationsScrollPosition';
      if (prev[key]?.top === pos.top && prev[key]?.left === pos.left) return prev;
      const newPrefs = { ...prev, [key]: pos };
      api.put('/api/users/me/preferences', newPrefs).catch(()=>{});
      return newPrefs;
    });
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/users/me/preferences', {
          ...userPreferences,
          ganttStrictDates: settingsForm.ganttStrictDates,
          ganttStatusFilter: settingsForm.ganttStatusFilter,
          selectedSystems: settingsForm.selectedSystems,
          ganttShowTeamNames: settingsForm.ganttShowTeamNames
      });

      setUserPreferences(prev => ({ 
        ...prev,
        ganttStrictDates: settingsForm.ganttStrictDates, 
        ganttStatusFilter: settingsForm.ganttStatusFilter,
        selectedSystems: settingsForm.selectedSystems,
        ganttShowTeamNames: settingsForm.ganttShowTeamNames
      }));
      
      setIsSettingsModalOpen(false);
      setIsSettingsMenuOpen(false);
    } catch(err) { alert("Erro ao salvar configurações."); }
  };

  const handleSaveResource = async (e) => {
    e.preventDefault();
    try {
      if (editingResource) await api.put(`/api/resources/${editingResource.id}`, resourceForm);
      else await api.post('/api/resources', resourceForm);
      setEditingResource(null);
      setResourceForm({ name: '', role: 'Desenvolvedor', color_code: '#3b82f6', squad: 'Salesforce' });
      fetchData();
    } catch (err) { alert("Erro ao salvar integrante."); }
  };

  const handleDeleteResource = async (id) => {
    if (!window.confirm("Deseja realmente excluir este integrante?")) return;
    try { await api.delete(`/api/resources/${id}`); fetchData(); } 
    catch (err) { alert("Erro ao excluir."); }
  };

  const handleToggleStatus = async (id) => {
    try { 
      await api.patch(`/api/resources/${id}/status`); 
      setResources(prev => prev.map(r => 
        r.id === id ? { ...r, is_active: !r.is_active } : r
      ));
    } catch (err) { alert("Erro ao alterar status."); }
  };

  const getWorkItemIcon = (type) => {
    const defaultClasses = "w-[16px] h-[16px] flex-shrink-0 mr-2";
    const t = type?.toLowerCase() || "";
    switch (t) {
      case 'feature': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><path d="M2 13h12v1H2v-1zm12-9l-2.5 4L8 3 4.5 8 2 4v8h12V4z" fill="#f1c40f"/></svg>;
      case 'historia': case 'história': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><rect width="16" height="16" rx="2" fill="#5cb85c"/><path d="M4.5 8.5L7 11l4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
      case 'ponto de controle': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><path d="M8 1c-3 0-5 2-5 5 0 3.5 5 8 5 8s5-4.5 5-8c0-3-2-5-5-5z" fill="#7b2cbf"/><path d="M7 15h2v1H7v-1z" fill="#9d4edd"/></svg>;
      case 'tarefa': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="11" rx="1" fill="#5bc0de"/><rect x="6" y="1" width="4" height="3" rx="1" fill="#2f3542"/><path d="M6 9l1.5 1.5L10.5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>;
      case 'bug': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="9" r="5" fill="#e74c3c"/><path d="M8 4V2M5 5L4 3M11 5l1-2" stroke="#2f3542" strokeWidth="1.2"/><circle cx="6.5" cy="7.5" r="1" fill="#2f3542"/><circle cx="9.5" cy="10.5" r="1" fill="#2f3542"/></svg>;
      case 'test plan': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><path d="M3 1h7l3 3v11H3V1z" fill="#dfe4ea"/><path d="M7 7h2l1 4H6l1-4z" fill="#7b2cbf"/><rect x="6.5" y="6" width="3" height="1" fill="#2f3542"/></svg>;
      case 'test case': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><path d="M3 1h7l3 3v11H3V1z" fill="#dfe4ea"/><path d="M6 7l1 1 5-5" stroke="#2f3542" strokeWidth="1.5"/><path d="M6 10h4v2H6v-2z" fill="#7b2cbf"/></svg>;
      case 'mudanca': case 'mudança': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><rect width="16" height="16" rx="2" fill="#57606f"/><path d="M4 5h8M4 8h8M4 11h5" stroke="white" strokeWidth="1.5"/></svg>;
      case 'bugfix': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><path d="M8 2l5 11H3L8 2z" fill="#ff9f43"/><path d="M2 13h12v2H2v-2z" fill="#ee5253"/></svg>;
      case 'projeto': return <svg className={defaultClasses} viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="9" fill="#7b2cbf"/><path d="M2 5l6 3 6-3V3l-6 3-6-3v2z" fill="#9d4edd"/><rect x="7" y="3" width="2" height="11" fill="#5d2091"/></svg>;
      default: return <div className="w-[16px] h-[16px] mr-2 rounded-full bg-gray-300"></div>;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    // 1. Inicia o loading visual IMEDIATAMENTE
    setUploading(true);
    setIsSettingsMenuOpen(false); 
    setUploadMessage("Lendo arquivo selecionado..."); 
  
    // HACK ARQUITETURAL: Libera a Main Thread por 50ms para o navegador renderizar o Spinner
    await new Promise(resolve => setTimeout(resolve, 50));
  
    const formData = new FormData();
    formData.append('file', file);
  
    try {
      // 2. Alinha a expectativa sobre a latência da nuvem
      setUploadMessage("Processando no servidor. Isso pode levar alguns segundos...");
      
      await api.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      
      // 3. Feedback de sucesso antes do recarregamento
      setUploadMessage("Importação concluída! Atualizando Gantt...");
      fetchData(); 
    } catch (err) {
      setUploadMessage("Erro no upload do CSV. Verifique o formato do arquivo.");
      // Pausa para o utilizador conseguir ler a mensagem de erro antes do loading fechar
      await new Promise(resolve => setTimeout(resolve, 3000)); 
    } finally {
      setUploading(false);
      setUploadMessage(""); 
      e.target.value = ""; 
    }
  };

  const openEditModal = async (item, phase = null) => {
    setSelectedItem(item);
    setTargetPhase(phase || 'Dev');
    try {
      const res = await api.get(`/api/workitems/${item.id}/assignments`);
      const mapped = { Dev: [], QA: [], HML: [] };
      if (res.data && res.data.length > 0) res.data.forEach(a => mapped[a.phase].push(a.resource_id));
      setAssignments(mapped);
    } catch (e) { console.error(e); }
  };

  const openMetadataModal = (item) => {
    setEditingMetadata(item);
    setMetadataForm({
      area: item.custom_metadata?.area || '',
      diretor: item.custom_metadata?.diretor || '',
      frente: item.custom_metadata?.frente || ''
    });
  };

  const handleSaveMetadata = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/api/workitems/${editingMetadata.id}/metadata`, metadataForm);
      setData(prev => prev.map(item => 
        item.id === editingMetadata.id 
          ? { ...item, custom_metadata: metadataForm } 
          : item
      ));
      setEditingMetadata(null);
    } catch (err) {
      alert("Erro ao salvar dados manuais.");
    }
  };

  const handleSaveAssignments = async () => {
    try { 
      await api.post(`/api/workitems/${selectedItem.id}/assignments`, assignments); 
      setSelectedItem(null); 
      setTargetPhase('Dev');
      const res = await api.get('/api/assignments/all');
      setAllAssignments(res.data);
    } catch (e) { alert("Erro ao salvar alocação"); }
  };

  const toggleResource = (phase, resId) => {
    const current = [...assignments[phase]];
    const index = current.indexOf(resId);
    
    if (index === -1) {
      const startStr = selectedItem[`ini_${phase.toLowerCase()}`];
      const endStr = selectedItem[`fim_${phase.toLowerCase()}`];
      
      if (startStr && endStr && startStr !== '-' && endStr !== '-') {
        const taskStart = new Date(startStr).getTime();
        const taskEnd = new Date(endStr).getTime();
        
        const conflict = absences.find(a => {
          if (a.resource_id !== resId) return false;
          const absStart = new Date(a.start_date).getTime();
          const absEnd = new Date(a.end_date).getTime();
          return taskStart <= absEnd && taskEnd >= absStart;
        });
        
        if (conflict) {
          const resObj = resources.find(r => r.id === resId);
          setAllocationConflict({ phase, resId, conflict, resObj });
          return; 
        }
      }
      current.push(resId);
    } else {
      current.splice(index, 1);
    }
    
    setAssignments({ ...assignments, [phase]: current });
  };

  const confirmAllocationConflict = () => {
    if (!allocationConflict) return;
    const { phase, resId } = allocationConflict;
    const current = [...assignments[phase]];
    current.push(resId);
    setAssignments({ ...assignments, [phase]: current });
    setAllocationConflict(null);
  };

  const normalizeText = (str) => !str ? "" : str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === '-') return "-";
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? "-" : new Date(date.getTime() + Math.abs(date.getTimezoneOffset() * 60000)).toLocaleDateString('pt-BR');
    } catch (e) { return "-"; }
  };

  const filterOptions = useMemo(() => {
    const opts = { area_path: new Set(), work_item_type: new Set(), tamanho_projeto: new Set(), state: new Set(), area: new Set(), diretor: new Set(), frente: new Set(), priority: new Set(), parent_id: new Set(), id: new Set(), title: new Set() };
    (data || []).forEach(item => {
      if (item.area_path) opts.area_path.add(item.area_path);
      if (item.work_item_type) opts.work_item_type.add(item.work_item_type);
      if (item.tamanho_projeto) opts.tamanho_projeto.add(item.tamanho_projeto);
      if (item.state) opts.state.add(item.state);
      if (item.custom_metadata?.area) opts.area.add(item.custom_metadata.area);
      if (item.custom_metadata?.diretor) opts.diretor.add(item.custom_metadata.diretor);
      if (item.custom_metadata?.frente) opts.frente.add(item.custom_metadata.frente);
      if (item.priority !== null && item.priority !== undefined) opts.priority.add(String(item.priority));
      if (item.parent_id !== null && item.parent_id !== undefined) opts.parent_id.add(String(item.parent_id));
      if (item.id !== null && item.id !== undefined) opts.id.add(String(item.id));
      if (item.title) opts.title.add(item.title);
    });
    return {
      area_path: Array.from(opts.area_path).sort(),
      work_item_type: Array.from(opts.work_item_type).sort(),
      tamanho_projeto: Array.from(opts.tamanho_projeto).sort(),
      state: Array.from(opts.state).sort(),
      area: Array.from(opts.area).sort(),
      diretor: Array.from(opts.diretor).sort(),
      frente: Array.from(opts.frente).sort(),
      priority: Array.from(opts.priority).sort((a,b) => Number(a) - Number(b)),
      parent_id: Array.from(opts.parent_id).sort((a,b) => Number(a) - Number(b)),
      id: Array.from(opts.id).sort((a,b) => Number(a) - Number(b)),
      title: Array.from(opts.title).sort(),
    };
  }, [data]);

  const handleColumnFilterChange = (col, val) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
  };

  const availableSystems = useMemo(() => {
    const systems = new Set();
    (data || []).forEach(item => { if (item.area_path) systems.add(item.area_path); });
    return Array.from(systems).sort();
  }, [data]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set();
    (data || []).forEach(item => { if (item.state) statuses.add(item.state); });
    return Array.from(statuses).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    let result = data || [];
    
    if (userPreferences.selectedSystems?.length > 0) {
      result = result.filter(item => userPreferences.selectedSystems.includes(item.area_path));
    }

    if (Object.keys(columnFilters).length > 0) {
      result = result.filter(item => {
        for (const [key, val] of Object.entries(columnFilters)) {
          if (!val) continue; 
          if (key === 'area' || key === 'diretor' || key === 'frente') {
            if ((item.custom_metadata?.[key] || "") !== val) return false;
          } else {
            if (String(item[key] ?? "") !== String(val)) return false;
          }
        }
        return true;
      });
    }

    if (!debouncedFilter) return result;
    const terms = debouncedFilter.split(',').map(t => normalizeText(t.trim())).filter(t => t !== "");
    return result.filter(item => {
      const azureContent = normalizeText([item.area_path, item.priority, item.id, item.parent_id, item.title, item.work_item_type, item.state, item.atribuido].join(' '));
      const assignedToItem = (allAssignments || []).filter(a => String(a.work_item_id) === String(item.id));
      const resourceNames = assignedToItem.map(a => {
        const res = (resources || []).find(r => String(r.id) === String(a.resource_id));
        return res ? normalizeText(res.name) : "";
      }).join(' ');
      
      return terms.every(t => {
        if (t.includes(':')) {
          const [field, ...valueParts] = t.split(':');
          const value = valueParts.join(':').trim();
          const target = {
            'id': item.id, 'pai': item.parent_id, 'titulo': item.title,
            'tipo': item.work_item_type, 'status': item.state, 'sistema': item.area_path,
            'atribuido': item.atribuido, 'responsavel': item.atribuido, 'recurso': resourceNames,
            'prioridade': item.priority 
          }[field.trim()];
          
          if (target !== undefined) return normalizeText(target).includes(value);
        }
        return azureContent.includes(t) || resourceNames.includes(t);
      });
    });
  }, [data, debouncedFilter, allAssignments, resources, userPreferences.selectedSystems, columnFilters]);

  const flattenedRows = useMemo(() => {
    const result = [];
    const allIdsInFilter = new Set((filteredData || []).map(item => item.id));
    
    const traverse = (parentId = 'ROOT', depth = 0) => {
      const nodes = (filteredData || []).filter(item => parentId === 'ROOT' ? (!item.parent_id || !allIdsInFilter.has(item.parent_id)) : item.parent_id === parentId);
      for (const node of nodes) {
        result.push({ node, depth });
        if (expandedRows.has(node.id)) {
          traverse(node.id, depth + 1);
        }
      }
    };
    traverse();
    return result;
  }, [filteredData, expandedRows]);

  const listStartIndex = Math.max(0, Math.floor(listScrollTop / listRowHeight) - listOverscan);
  const listEndIndex = Math.min(flattenedRows.length, Math.floor(listScrollTop / listRowHeight) + listVisibleRows + listOverscan);
  const visibleListRows = flattenedRows.slice(listStartIndex, listEndIndex);
  const listTopSpacerHeight = listStartIndex * listRowHeight;
  const listBottomSpacerHeight = (flattenedRows.length - listEndIndex) * listRowHeight;

  const filteredResources = useMemo(() => {
    if (!filterText) return resources || [];
    const term = normalizeText(filterText);
    return (resources || []).filter(res => normalizeText(res.name).includes(term) || normalizeText(res.role).includes(term));
  }, [resources, filterText]);

  const ganttFilteredData = useMemo(() => {
    return (filteredData || []).filter(item => {
      if (!['feature', 'bugfix', 'projeto'].includes(item.work_item_type?.toLowerCase())) return false;
      if (userPreferences.ganttStatusFilter?.length > 0 && !userPreferences.ganttStatusFilter.includes(item.state)) return false;
      if (userPreferences.ganttStrictDates && (!item.ini_dev || item.ini_dev === '-' || !item.fim_dev || item.fim_dev === '-')) return false;
      return true;
    });
  }, [filteredData, userPreferences]);

  const renderFilterSelect = (columnKey) => (
    <select className="block mt-1 w-full bg-transparent text-[9px] font-black text-blue-600 border-b border-gray-200 outline-none cursor-pointer" value={columnFilters[columnKey] || ""} onChange={e => handleColumnFilterChange(columnKey, e.target.value)}>
      <option value=""></option>
      {filterOptions[columnKey].map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );

  return (
    <div className="p-4 bg-gray-100 min-h-screen font-sans relative" onClick={() => isSettingsMenuOpen && setIsSettingsMenuOpen(false)}>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">AllocWise</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                {['list', 'gantt', 'vacations'].map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${viewMode === mode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
                    {mode === 'list' ? 'Lista' : mode === 'gantt' ? 'Gantt' : 'Férias'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="relative w-full max-w-2xl">
            <input type="text" placeholder="Filtre tudo aqui..." className="w-full pl-6 pr-12 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm outline-none focus:border-blue-500 font-semibold" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
          </div>
          <div className="flex gap-3 items-center relative">
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setIsSettingsMenuOpen(!isSettingsMenuOpen); }} className={`p-3 rounded-xl transition-all text-xl ${isSettingsMenuOpen ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                ⚙️
              </button>
              {isSettingsMenuOpen && (
                <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <button onClick={() => fileInputRef.current.click()} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-gray-600 hover:bg-gray-50 transition-colors">
                    <span>📤</span> {uploading ? 'Processando...' : 'Importar CSV'}
                  </button>
                  <button onClick={() => { setIsSettingsModalOpen(true); setIsSettingsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-gray-600 hover:bg-gray-50 transition-colors">
                    <span>🛠️</span> Configuração do Sistema
                  </button>
                  <button onClick={() => { setViewMode('team'); setIsSettingsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-50">
                    <span>👥</span> Equipe
                  </button>
                  <button onClick={() => { setViewMode('security'); setIsSettingsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-50">
                    <span>🔐</span> Usuários
                  </button>
                  <button onClick={() => { setViewMode('admin'); setIsSettingsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-50">
                    <span>💾</span> Banco de Dados
                  </button>
                  <button onClick={() => { setIsAboutModalOpen(true); setIsSettingsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-50">
                    <span>ℹ️</span> Sobre o Sistema
                  </button>
                  <div className="px-4 py-3 text-[11px] font-black text-gray-300 border-t border-gray-50"><span>_______</span></div>
                  <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black text-red-500 hover:bg-red-50 transition-colors border-t border-gray-50">
                    <span>🚪</span> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-40"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div></div>
      ) : uploading ? (
        <div className="text-center py-40 animate-in fade-in">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-6 shadow-sm"></div>
          <p className="text-xl font-black text-blue-900 tracking-tight">{uploadMessage || "Processando arquivo..."}</p>
          <p className="mt-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
            Aguarde. Isso pode levar alguns segundos devido ao limite do servidor.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200">
          <div className="overflow-x-auto overflow-y-auto max-h-[75vh]" onScroll={(e) => setListScrollTop(e.target.scrollTop)}>
            <table className="min-w-full divide-y divide-gray-100 relative">
              <thead className="bg-gray-50 text-[9px] font-black text-gray-400 tracking-tighter sticky top-0 z-30 shadow-sm border-b border-gray-200">
                <tr>
                  <th className="px-3 py-4 text-left border-r w-[100px]">Sistema {renderFilterSelect('area_path')}</th>
                  <th className="px-2 py-4 text-center border-r w-[40px]" title="Prioridade">Pri {renderFilterSelect('priority')}</th>
                  <th className="px-2 py-4 text-center border-r">Pai {renderFilterSelect('parent_id')}</th>
                  <th className="px-2 py-4 text-center border-r">ID {renderFilterSelect('id')}</th>
                  <th className="px-3 py-4 text-left border-r min-w-[300px]">Título da Demanda {renderFilterSelect('title')}</th>
                  <th className="px-3 py-4 text-left border-r">Tipo {renderFilterSelect('work_item_type')}</th>
                  <th className="px-2 py-4 text-center border-r">Tam {renderFilterSelect('tamanho_projeto')}</th>
                  <th className="px-3 py-4 text-left border-r">Status {renderFilterSelect('state')}</th>
                  <th className="px-3 py-4 text-left border-r w-[100px]">Área {renderFilterSelect('area')}</th>
                  <th className="px-3 py-4 text-left border-r w-[100px]">Diretor(a) {renderFilterSelect('diretor')}</th>
                  <th className="px-3 py-4 text-left border-r w-[100px]">Frente {renderFilterSelect('frente')}</th>
                  <th className="px-2 py-4 text-center border-r">Horas</th>
                  <th className="px-3 py-4 text-left border-r">Responsável</th>
                  <th colSpan="2" className="px-2 py-2 text-center border-r bg-yellow-50/50 text-yellow-700">Dev</th>
                  <th colSpan="2" className="px-2 py-2 text-center border-r bg-green-50/50 text-green-700">QA</th>
                  <th colSpan="2" className="px-2 py-2 text-center border-r bg-orange-50/50 text-orange-700">HML</th>
                  <th className="px-3 py-4 text-center bg-blue-600 text-white">Est. Prod</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listTopSpacerHeight > 0 && <tr style={{ height: listTopSpacerHeight, border: 'none' }} className="border-none"></tr>}
                {visibleListRows.map(({ node, depth }) => {
                  const isExpanded = expandedRows.has(node.id);
                  const hasChildren = (filteredData || []).some(item => item.parent_id === node.id);
                  const isFeature = ['feature', 'bugfix', 'projeto'].includes(node.work_item_type?.toLowerCase());
                  return (
                    <tr key={node.id} className={`border-b text-[10px] ${isFeature ? 'bg-blue-50/50 font-bold' : 'hover:bg-gray-50'} group/row`}>
                      <td className="px-3 py-2 border-r truncate max-w-[100px]">{node.area_path}</td>
                      <td className="px-2 py-2 text-center border-r font-black text-red-400">{node.priority ?? "-"}</td>
                      <td className="px-2 py-2 text-center border-r text-gray-400 font-mono">{node.parent_id ?? "-"}</td>
                      <td className="px-2 py-2 text-center border-r font-mono font-bold text-blue-600">{node.id}</td>
                      <td className="px-3 py-2 border-r flex items-center" style={{ paddingLeft: `${(depth * 24) + 10}px` }}>
                        {hasChildren ? <button onClick={() => {const n = new Set(expandedRows); isExpanded ? n.delete(node.id) : n.add(node.id); setExpandedRows(n);}} className="w-4 h-4 mr-2 bg-blue-600 text-white rounded text-[10px] flex items-center justify-center font-black">{isExpanded ? '−' : '+'}</button> : <span className="w-6" />}
                        {getWorkItemIcon(node.work_item_type)}<span className="truncate">{node.title}</span>
                        <button onClick={() => openMetadataModal(node)} className="ml-auto opacity-0 group-hover/row:opacity-100 p-1 text-blue-600 hover:bg-blue-100 rounded transition-all">✎</button>
                      </td>
                      <td className="px-3 py-2 border-r italic text-gray-500">{node.work_item_type}</td>
                      <td className="px-2 py-2 text-center border-r font-black text-orange-600">{node.tamanho_projeto || "-"}</td>
                      <td className="px-3 py-2 border-r uppercase font-black text-[9px] text-blue-800">{node.state}</td>
                      <td className="px-3 py-2 border-r truncate max-w-[100px] text-gray-600">{node.custom_metadata?.area || "-"}</td>
                      <td className="px-3 py-2 border-r truncate max-w-[100px] text-gray-600">{node.custom_metadata?.diretor || "-"}</td>
                      <td className="px-3 py-2 border-r truncate max-w-[100px] text-gray-600">{node.custom_metadata?.frente || "-"}</td>
                      <td className="px-2 py-2 text-center border-r font-bold">{node.tempo_gasto || 0}h</td>
                      <td className="px-3 py-2 border-r truncate max-w-[100px] text-gray-500">{node.atribuido?.split('<')[0]}</td>
                      <td className="px-2 py-2 text-center border-r bg-yellow-50/30 font-mono">{formatDate(node.ini_dev)}</td>
                      <td className="px-2 py-2 text-center border-r bg-yellow-50/30 font-mono font-bold">{formatDate(node.fim_dev)}</td>
                      <td className="px-2 py-2 text-center border-r bg-green-50/30 font-mono">{formatDate(node.ini_qa)}</td>
                      <td className="px-2 py-2 text-center border-r bg-green-50/30 font-mono font-bold">{formatDate(node.fim_qa)}</td>
                      <td className="px-2 py-2 text-center border-r bg-orange-50/30 font-mono">{formatDate(node.ini_hml)}</td>
                      <td className="px-2 py-2 text-center border-r bg-orange-50/30 font-mono font-bold">{formatDate(node.fim_hml)}</td>
                      <td className="px-3 py-2 text-center font-black bg-blue-100/50 text-blue-900 font-mono">{formatDate(node.est_prod)}</td>
                    </tr>
                  );
                })}
                {listBottomSpacerHeight > 0 && <tr style={{ height: listBottomSpacerHeight, border: 'none' }} className="border-none"></tr>}
              </tbody>
            </table>
          </div>
          
          {/* NOVO: Footer discreto com a contagem de registos na Lista */}
          <div className="bg-gray-50/50 border-t border-gray-100 px-4 py-2 flex justify-end items-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total: {flattenedRows.length} registo(s)</span>
          </div>
        </div>
      ) : viewMode === 'team' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in">
          <div className="lg:col-span-1 bg-white p-5 rounded-3xl shadow-sm border border-gray-200 h-fit">
            <h2 className="text-sm font-black mb-4 text-gray-800 tracking-tight">{editingResource ? 'Editar Integrante' : 'Novo Integrante'}</h2>
            <form onSubmit={handleSaveResource} className="space-y-3">
              <input type="text" placeholder="Nome Completo" className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none focus:border-blue-500" value={resourceForm.name} onChange={e => setResourceForm({...resourceForm, name: e.target.value})} required />
              <select className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none appearance-none" value={resourceForm.role} onChange={e => setResourceForm({...resourceForm, role: e.target.value})}><option value="Desenvolvedor">Desenvolvedor</option><option value="QA">QA</option><option value="Homologador">Homologador</option><option value="Product Manager">Product Manager</option></select>
              <select className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-bold outline-none appearance-none" value={resourceForm.squad || 'Salesforce'} onChange={e => setResourceForm({...resourceForm, squad: e.target.value})}><option value="Salesforce">Salesforce</option><option value="Protheus">Protheus</option><option value="Fluig">Fluig</option><option value="Protheus/Fluig">Protheus/Fluig</option></select>
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100"><span className="text-[10px] font-black text-gray-400 tracking-tighter">Cor Identificadora</span><input type="color" className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" value={resourceForm.color_code} onChange={e => setResourceForm({...resourceForm, color_code: e.target.value})} /></div>
              <div className="flex gap-2 mt-4"><button type="submit" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-[11px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">{editingResource ? 'Salvar Alterações' : 'Adicionar Integrante'}</button>{editingResource && <button type="button" onClick={() => {setEditingResource(null); setResourceForm({name:'', role:'Desenvolvedor', color_code:'#3b82f6', squad: 'Salesforce'});}} className="bg-gray-100 text-gray-500 px-5 py-2.5 rounded-xl font-black text-[11px] hover:bg-gray-200 transition-all">Cancelar</button>}</div>
            </form>
          </div>
          <div className="lg:col-span-3 bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 tracking-tighter"><tr className="border-b"><th className="p-3 text-left">Membro</th><th className="p-3 text-left">Cargo</th><th className="p-3 text-left">Squad</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filteredResources.map(res => (
                  <tr key={res.id} className="hover:bg-gray-50 group transition-colors">
                    <td className="p-3 flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: res.color_code}}></div><span className="text-[11px] font-bold text-gray-700">{res.name}</span></td>
                    <td className="p-3"><span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{res.role}</span></td>
                    <td className="p-3"><span className="text-[9px] font-bold text-gray-500">{res.squad || '-'}</span></td>
                    <td className="p-3 text-center"><button onClick={() => handleToggleStatus(res.id)} className={`px-3 py-0.5 rounded-full text-[8px] font-black ${res.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{res.is_active ? 'Ativo' : 'Inativo'}</button></td>
                    <td className="p-3 text-right space-x-1"><button onClick={() => {setEditingResource(res); setResourceForm({name: res.name, role: res.role, color_code: res.color_code, squad: res.squad || 'Salesforce'});}} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all text-[12px]">✎</button><button onClick={() => handleDeleteResource(res.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all text-[12px]">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>      
      ) : viewMode === 'vacations' ? (
        <VacationsView filteredResources={filteredResources} resources={resources} absences={absences} holidays={holidays} fetchData={() => fetchData(true)} savedScrollPosition={userPreferences.vacationsScrollPosition} onSaveScrollPosition={handleSaveScrollPosition} />
      ) : viewMode === 'security' ? (
        <SecurityView />
      ) : viewMode === 'admin' ? (
        <AdminView />
      ) : (
        <GanttView data={ganttFilteredData} getWorkItemIcon={getWorkItemIcon} onOpenAllocationModal={openEditModal} savedScrollPosition={userPreferences.ganttScrollPosition} onSaveScrollPosition={handleSaveScrollPosition} showTeamNames={userPreferences.ganttShowTeamNames} />
      )}

      {selectedItem && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
            <header className="bg-gray-800 p-8 pb-6 text-white flex justify-between items-start sticky top-0 z-10 border-b border-gray-700">
              <div><span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Alocação</span><h2 className="text-xl font-black mb-5">{selectedItem.id} - {selectedItem.title}</h2>
                <div className="flex items-center gap-3"><span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Alocando para:</span>
                  <div className="flex bg-gray-900 rounded-lg p-1">{['Dev', 'QA', 'HML'].map(p => (
                    <button key={p} onClick={() => setTargetPhase(p)} className={`px-5 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${targetPhase === p ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{p}</button>))}</div>
                </div>
              </div>
              <button onClick={() => { setSelectedItem(null); setTargetPhase('Dev'); }} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </header>
            <div className="p-8 space-y-6">
              {['Desenvolvedor', 'QA', 'Homologador'].map(roleRequired => (
                <div key={roleRequired}><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">{roleRequired === 'Desenvolvedor' ? 'DEV' : roleRequired === 'QA' ? 'QA' : 'HML'} <span className="lowercase font-normal italic opacity-60">(equipa de origem)</span></label>
                  <div className="flex flex-wrap gap-2.5 p-5 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                    {resources.filter(r => r.role === roleRequired && r.is_active).map(res => {
                      const isSelected = assignments[targetPhase].includes(res.id);
                      return (<button key={res.id} onClick={() => toggleResource(targetPhase, res.id)} className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all flex items-center gap-2.5 border-2 ${isSelected ? 'bg-blue-600 border-transparent text-white shadow-md scale-105' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'}`}><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: res.color_code }} /> {res.name}</button>);
                    })}
                  </div>
                </div>
              ))}
            </div>
            <footer className="p-8 bg-gray-50 flex gap-4 sticky bottom-0 z-10 border-t border-gray-100"><button onClick={handleSaveAssignments} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-colors">Salvar Alocação</button></footer>
          </div>
        </div>
      )}

      {allocationConflict && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <header className="bg-yellow-500 p-6 text-white flex justify-between items-center"><div className="flex items-center gap-3"><span>⚠️</span><div><span className="text-[10px] font-black uppercase tracking-widest text-yellow-100">Alerta</span><h2 className="text-lg font-black leading-tight">Conflito de Agenda</h2></div></div><button onClick={() => setAllocationConflict(null)} className="text-yellow-100 hover:text-white text-2xl">✕</button></header>
            <div className="p-6 space-y-4"><p className="text-sm text-gray-700 font-medium"><strong>{allocationConflict.resObj?.name || 'Este integrante'}</strong> possui uma ausência (<span className="uppercase text-xs font-bold text-gray-500">{allocationConflict.conflict.category}</span>) agendada entre:</p>
              <div className="flex items-center justify-center gap-4 bg-yellow-50 p-4 rounded-2xl border border-yellow-100"><span className="text-sm font-black text-yellow-800">{formatDate(allocationConflict.conflict.start_date)}</span><span className="text-gray-400 font-black text-xs uppercase">Até</span><span className="text-sm font-black text-yellow-800">{formatDate(allocationConflict.conflict.end_date)}</span></div>
              <p className="text-[11px] text-gray-500 font-medium text-center">Conflita com a fase de <strong className="uppercase">{allocationConflict.phase}</strong> da demanda.</p>
            </div>
            <footer className="p-6 bg-gray-50 flex gap-3 border-t border-gray-100"><button onClick={() => setAllocationConflict(null)} className="flex-1 bg-gray-200 text-gray-600 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-300 transition-colors">Cancelar</button><button onClick={confirmAllocationConflict} className="flex-1 bg-yellow-500 text-white py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-yellow-200 hover:bg-yellow-600 transition-colors">Alocar Mesmo Assim</button></footer>
          </div>
        </div>
      )}

      {isAboutModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setIsAboutModalOpen(false)}>
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in duration-200 border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm">💎</div>
            <h2 className="text-xl font-black text-gray-800 mb-2 tracking-tight">AllocWise • Intelligence in Resource Management</h2>
            <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest inline-block mb-6">Versão 1.0</span>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">Gestão inteligente e integrada de squads multifuncionais conectada ao Azure DevOps. Projetado para máxima performance e visibilidade estratégica no fluxo de entrega.</p>
            <button onClick={() => setIsAboutModalOpen(false)} className="mt-8 w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all">Fechar</button>
          </div>
        </div>
      )}

      {editingMetadata && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <header className="bg-gray-800 p-8 text-white flex justify-between items-center"><div><span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Metadados</span><h2 className="text-xl font-black line-clamp-1">{editingMetadata.id} - {editingMetadata.title}</h2></div><button onClick={() => setEditingMetadata(null)} className="text-gray-400 hover:text-white text-2xl">✕</button></header>
            <form onSubmit={handleSaveMetadata}><div className="p-8 space-y-4">
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Área</label><input type="text" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={metadataForm.area} onChange={e => setMetadataForm({...metadataForm, area: e.target.value})} placeholder="Ex: Financeiro, TI, RH" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Diretor(a)</label><input type="text" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={metadataForm.diretor} onChange={e => setMetadataForm({...metadataForm, diretor: e.target.value})} placeholder="Ex: João Silva" /></div>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Frente</label><input type="text" className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500" value={metadataForm.frente} onChange={e => setMetadataForm({...metadataForm, frente: e.target.value})} placeholder="Ex: Operacional, Estratégico" /></div>
              </div><footer className="p-8 bg-gray-50 flex gap-4 border-t border-gray-100"><button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-colors">Salvar Dados</button></footer></form>
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in duration-200"><h2 className="text-xl font-black text-gray-800 mb-4">Configurações do Sistema</h2>
            <form onSubmit={handleSaveSettings}>
              <div className="mt-6 border-t border-gray-100 pt-4"><h3 className="text-[12px] font-black text-gray-800 uppercase tracking-widest mb-4">Sistemas (Area Path)</h3>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Filtrar por Sistema</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 custom-scrollbar">
                    {availableSystems.map(sys => {
                      const isSelected = settingsForm.selectedSystems.includes(sys);
                      return (<button key={sys} type="button" onClick={() => { const newFilter = isSelected ? settingsForm.selectedSystems.filter(s => s !== sys) : [...settingsForm.selectedSystems, sys]; setSettingsForm({...settingsForm, selectedSystems: newFilter}); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}>{sys}</button>);
                    })}
                  </div><span className="text-[9px] font-bold text-gray-400 mt-1 block">* Se nenhum selecionado, exibe todos.</span>
                </div>
              </div>
              <div className="mt-6 border-t border-gray-100 pt-4"><h3 className="text-[12px] font-black text-gray-800 uppercase tracking-widest mb-4">Gantt</h3>
                <label className="flex items-center gap-3 cursor-pointer mb-4"><div className="relative"><input type="checkbox" className="sr-only" checked={settingsForm.ganttStrictDates} onChange={e => setSettingsForm({...settingsForm, ganttStrictDates: e.target.checked})} /><div className={`block w-10 h-6 rounded-full transition-colors ${settingsForm.ganttStrictDates ? 'bg-blue-600' : 'bg-gray-200'}`}></div><div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settingsForm.ganttStrictDates ? 'translate-x-4' : ''}`}></div></div><div><span className="text-xs font-black text-gray-800 block">Exigir Datas de Dev</span><span className="text-[10px] font-bold text-gray-500 block">Oculta demandas sem Início/Fim de Dev.</span></div></label>
                <label className="flex items-center gap-3 cursor-pointer mb-4"><div className="relative"><input type="checkbox" className="sr-only" checked={settingsForm.ganttShowTeamNames} onChange={e => setSettingsForm({...settingsForm, ganttShowTeamNames: e.target.checked})} /><div className={`block w-10 h-6 rounded-full transition-colors ${settingsForm.ganttShowTeamNames ? 'bg-blue-600' : 'bg-gray-200'}`}></div><div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settingsForm.ganttShowTeamNames ? 'translate-x-4' : ''}`}></div></div><div><span className="text-xs font-black text-gray-800 block">Mostrar Equipa no Gantt</span><span className="text-[10px] font-bold text-gray-500 block">Exibe nomes das pessoas alocadas.</span></div></label>
                <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Filtrar por Status</label>
                  <div className="flex flex-wrap gap-2">{availableStatuses.map(status => (<button key={status} type="button" onClick={() => { const newFilter = settingsForm.ganttStatusFilter.includes(status) ? settingsForm.ganttStatusFilter.filter(s => s !== status) : [...settingsForm.ganttStatusFilter, status]; setSettingsForm({...settingsForm, ganttStatusFilter: newFilter}); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${settingsForm.ganttStatusFilter.includes(status) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}>{status}</button>))}</div>
                </div>
              </div>
              <div className="flex gap-3 mt-6"><button type="button" onClick={() => setIsSettingsModalOpen(false)} className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black text-xs hover:bg-gray-200 transition-all">Cancelar</button><button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Salvar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}