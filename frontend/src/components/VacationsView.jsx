import React, { useState, useMemo, useEffect, useRef } from 'react';
import { format, isWithinInterval, startOfDay, parseISO, addDays, subDays } from 'date-fns';
import CalendarHeader from './CalendarHeader';
import { useCalendar } from '../hooks/useCalendar';
import api from '../services/api';

export default function VacationsView({ filteredResources, resources, absences, holidays, fetchData }) {
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState(null);
  const [absenceToDelete, setAbsenceToDelete] = useState(null); 

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  // FIX: Estado expandido para suportar 'description'
  const [vacationForm, setVacationForm] = useState({ resource_id: '', start_date: '', end_date: '', category: '', description: '' });

  const [dragState, setDragState] = useState({
    isDragging: false,
    resourceId: null,
    startDate: null,
    endDate: null
  });

  // NOVO: Ref para manipular o scroll do calendário
  const scrollContainerRef = useRef(null);
  const initialScrollDone = useRef(false); // NOVO: Flag para evitar scroll repetitivo

  const { days: vacationDays, monthGroups: vacationMonthGroups, getDayBgColor } = useCalendar(
    new Date(2026, 0, 1), new Date(2027, 11, 31), holidays
  );

  const availableYears = useMemo(() => {
    if (!absences || absences.length === 0) return [new Date().getFullYear().toString()];
    const years = new Set();
    absences.forEach(abs => {
      if (abs.start_date) years.add(abs.start_date.substring(0, 4));
      if (abs.end_date) years.add(abs.end_date.substring(0, 4));
    });
    return Array.from(years).sort().reverse(); 
  }, [absences]);

  const filteredAbsencesByYear = useMemo(() => {
    if (!selectedYear) return absences;
    return absences.filter(abs => {
      const startYear = abs.start_date ? abs.start_date.substring(0, 4) : '';
      const endYear = abs.end_date ? abs.end_date.substring(0, 4) : '';
      return startYear === selectedYear || endYear === selectedYear;
    });
  }, [absences, selectedYear]);

  // NOVO: Pegando a string do dia de hoje
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // NOVO: Efeito que executa o auto-scroll quando o calendário renderiza com trava
  useEffect(() => {
    if (scrollContainerRef.current && vacationDays.length > 0 && !initialScrollDone.current) {
      setTimeout(() => {
        const container = scrollContainerRef.current;
        const todayEl = container.querySelector('.today-indicator');
        if (todayEl) {
          // Descontamos 350px das colunas fixas + 50px de "respiro" para não colar na borda
          container.scrollLeft = Math.max(0, todayEl.offsetLeft - 400);
          initialScrollDone.current = true; // NOVO: Trava o scroll após a primeira vez
        }
      }, 150); // Timeout levemente maior para garantir que a tabela gerou as larguras dinâmicas
    }
  }, [vacationDays]);

  const handleSaveVacation = async (e) => {
    e.preventDefault();
    try { 
      if (editingAbsence) {
        await api.put(`/api/absences/${editingAbsence.id}`, vacationForm);
      } else {
        await api.post('/api/absences', vacationForm); 
      }
      setShowVacationModal(false); 
      setEditingAbsence(null);
      setVacationForm({ resource_id: '', start_date: '', end_date: '', category: '', description: '' }); 
      fetchData(); 
    } catch (err) { alert("Erro ao salvar lançamento."); }
  };

  const handleRemoveDays = async () => {
    if (!editingAbsence) return;
    
    const selStart = parseISO(vacationForm.start_date);
    const selEnd = parseISO(vacationForm.end_date);
    const origStart = parseISO(editingAbsence.start_date);
    const origEnd = parseISO(editingAbsence.end_date);

    try {
      if (selStart.getTime() <= origStart.getTime() && selEnd.getTime() >= origEnd.getTime()) {
        await api.delete(`/api/absences/${editingAbsence.id}`);
      } else if (selStart.getTime() <= origStart.getTime()) {
        await api.put(`/api/absences/${editingAbsence.id}`, {
          ...editingAbsence,
          start_date: format(addDays(selEnd, 1), 'yyyy-MM-dd')
        });
      } else if (selEnd.getTime() >= origEnd.getTime()) {
        await api.put(`/api/absences/${editingAbsence.id}`, {
          ...editingAbsence,
          end_date: format(subDays(selStart, 1), 'yyyy-MM-dd')
        });
      } else {
        await api.put(`/api/absences/${editingAbsence.id}`, {
          ...editingAbsence,
          end_date: format(subDays(selStart, 1), 'yyyy-MM-dd')
        });
        await api.post('/api/absences', {
          resource_id: editingAbsence.resource_id,
          start_date: format(addDays(selEnd, 1), 'yyyy-MM-dd'),
          end_date: format(origEnd, 'yyyy-MM-dd'),
          category: editingAbsence.category,
          description: editingAbsence.description
        });
      }
      
      setShowVacationModal(false);
      setEditingAbsence(null);
      fetchData();
    } catch (err) { alert("Erro ao tentar remover ou particionar os dias."); }
  };

  const executeDeleteAbsence = async () => {
    if (!absenceToDelete) return;
    try {
      await api.delete(`/api/absences/${absenceToDelete.id}`);
      setAbsenceToDelete(null);
      fetchData(); 
    } catch (err) { alert("Erro ao excluir lançamento."); }
  };

  const openEditModal = (abs) => {
    setEditingAbsence(abs);
    setVacationForm({
      resource_id: abs.resource_id,
      start_date: abs.start_date,
      end_date: abs.end_date,
      category: abs.category,
      description: abs.description || ''
    });
    setShowVacationModal(true); 
  };

  const openNewModal = () => {
    setEditingAbsence(null);
    setVacationForm({ resource_id: '', start_date: '', end_date: '', category: '', description: '' });
    setShowVacationModal(true);
  };

  const handleMouseDown = (resourceId, date) => {
    setDragState({ isDragging: true, resourceId, startDate: date, endDate: date });
  };

  const handleMouseEnter = (resourceId, date) => {
    if (dragState.isDragging && dragState.resourceId === resourceId) {
      setDragState(prev => ({ ...prev, endDate: date }));
    }
  };

  const handleMouseUp = () => {
    if (dragState.isDragging && dragState.startDate && dragState.endDate) {
      const start = dragState.startDate < dragState.endDate ? dragState.startDate : dragState.endDate;
      const end = dragState.startDate > dragState.endDate ? dragState.startDate : dragState.endDate;

      const existingAbsence = absences.find(abs => 
        abs.resource_id === dragState.resourceId && 
        isWithinInterval(startOfDay(dragState.startDate), { 
          start: startOfDay(parseISO(abs.start_date)), 
          end: startOfDay(parseISO(abs.end_date)) 
        })
      );

      if (existingAbsence) {
        setEditingAbsence(existingAbsence);
        setVacationForm({
          resource_id: existingAbsence.resource_id,
          start_date: format(start, 'yyyy-MM-dd'),
          end_date: format(end, 'yyyy-MM-dd'),
          category: existingAbsence.category,
          description: existingAbsence.description || ''
        });
      } else {
        setEditingAbsence(null);
        setVacationForm({
          resource_id: dragState.resourceId,
          start_date: format(start, 'yyyy-MM-dd'),
          end_date: format(end, 'yyyy-MM-dd'),
          category: '',
          description: ''
        });
      }

      setShowVacationModal(true); 
    }
    setDragState({ isDragging: false, resourceId: null, startDate: null, endDate: null });
  };

  const getAbsenceColor = (category) => {
    switch(category) {
      case 'Feriado': return 'bg-red-200 border-red-300';
      case 'Suspensão/Férias': return 'bg-blue-700 border-blue-800';
      case 'Previsão': return 'bg-pink-100 border-pink-200';
      case 'Suspensão compulsória': return 'bg-yellow-200 border-yellow-300';
      case 'Folga': return 'bg-green-500 border-green-600'; 
      case 'Dia trabalhado': return 'bg-red-600 border-red-700'; 
      default: return 'bg-blue-500 border-blue-600';
    }
  };

  const getResourceName = (id) => {
    const res = resources.find(r => r.id === id);
    return res ? res.name : 'Integrante Removido';
  };

  return (
    <div className="animate-in fade-in" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 px-2 gap-4">
        <h2 className="text-xl font-black text-gray-800 tracking-tight">Gestão de Ausências</h2>
        
        <div className="flex flex-wrap gap-4 text-[10px] font-black text-gray-500 items-center bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-red-200 border border-red-300 shadow-sm"></span> Feriado</div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-blue-700 shadow-sm"></span> Suspensão/Férias</div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-pink-100 border border-pink-200 shadow-sm"></span> Previsão</div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-yellow-200 border border-yellow-300 shadow-sm"></span> Suspensão compulsória</div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-green-500 shadow-sm"></span> Folga</div>
          <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-md bg-red-600 shadow-sm"></span> Dia trabalhado</div>
        </div>

        <div className="flex gap-2 w-full xl:w-auto">
          <button onClick={() => setShowManageModal(true)} className="flex-1 xl:flex-none bg-white text-gray-600 border border-gray-200 px-5 py-2.5 rounded-xl text-[11px] font-black tracking-widest hover:bg-gray-50 shadow-sm transition-all whitespace-nowrap">
            Gerenciar Lançamentos
          </button>
          <button onClick={openNewModal} className="flex-1 xl:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[11px] font-black tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all whitespace-nowrap">
            + Nova Ausência
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[70vh] cursor-crosshair">
        {/* NOVO: ref injetado no container de overflow e classe scroll-smooth adicionada */}
        <div ref={scrollContainerRef} className="overflow-auto relative flex-1 scroll-smooth">
          <table className="border-collapse min-w-max select-none">
            <CalendarHeader 
              monthGroups={vacationMonthGroups} 
              days={vacationDays} 
              leftHeaderContent={{ 
                topRow: <th colSpan="3" className="bg-gray-100 border-r border-gray-200 sticky left-0 z-40 w-[350px]"></th>, 
                bottomRow: (
                  <>
                    <th className="p-3 text-left sticky left-0 z-40 bg-white border-r border-gray-200 min-w-[150px] text-gray-500 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.1)] text-[10px] font-black">Integrante</th>
                    <th className="p-3 text-left border-r border-gray-200 text-gray-500 text-[10px] font-black bg-white min-w-[100px]">Squad</th>
                    <th className="p-3 text-left border-r border-gray-200 text-gray-500 text-[10px] font-black bg-white min-w-[100px]">Cargo</th>
                  </>
                ) 
              }} 
            />
            <tbody className="divide-y divide-gray-50">
              {filteredResources.map(res => (
                <tr key={res.id} className="hover:bg-blue-50/50 h-10 group transition-colors">
                  <td className="p-2 pl-4 text-[11px] font-bold text-gray-700 border-r sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.1)] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: res.color_code}}></div>
                    {res.name}
                  </td>
                  <td className="p-2 text-[9px] font-bold text-gray-500 border-r bg-white group-hover:bg-blue-50/50">{res.squad || '-'}</td>
                  <td className="p-2 text-[9px] font-black text-blue-500 border-r bg-white group-hover:bg-blue-50/50">{res.role}</td>
                  
                  {vacationDays.map(day => {
                    const absence = absences.find(abs => abs.resource_id === res.id && isWithinInterval(startOfDay(day), { start: startOfDay(parseISO(abs.start_date)), end: startOfDay(parseISO(abs.end_date)) }));
                    
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const dayInfo = holidays.find(h => h.date === dayStr);
                    
                    const isToday = dayStr === todayStr;

                    const isBeingDragged = dragState.isDragging && 
                                           dragState.resourceId === res.id && 
                                           day >= (dragState.startDate < dragState.endDate ? dragState.startDate : dragState.endDate) && 
                                           day <= (dragState.startDate > dragState.endDate ? dragState.startDate : dragState.endDate);

                    return (
                      <td 
                        key={dayStr} 
                        title={dayInfo ? dayInfo.description : ''}
                        // NOVO: 'today-indicator' injetado quando for dia atual para guiar o auto-scroll
                        className={`h-full p-0.5 transition-colors ${getDayBgColor(day)} ${isBeingDragged ? 'bg-blue-200' : ''} ${isToday ? 'today-indicator border-l-2 border-l-red-500 bg-red-50/20 relative z-10' : 'border-r border-gray-50'}`}
                        onMouseDown={() => handleMouseDown(res.id, day)}
                        onMouseEnter={() => handleMouseEnter(res.id, day)}
                      >
                        {absence && <div className={`w-full h-6 rounded shadow-sm border ${getAbsenceColor(absence.category)}`} title={absence.description ? `${absence.category} - ${absence.description}` : absence.category} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showManageModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-4xl shadow-2xl animate-in zoom-in max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-black text-gray-800 tracking-tight">Gerenciar Lançamentos</h2>
                <select 
                  className="bg-gray-50 border border-gray-200 text-gray-600 font-black text-xs px-3 py-1.5 rounded-lg outline-none focus:border-blue-500 cursor-pointer"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  <option value="">Todos os Anos</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => setShowManageModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-black transition-colors">✕</button>
            </div>
            
            <div className="overflow-y-auto flex-1 pr-2 border border-gray-100 rounded-3xl">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 tracking-tighter sticky top-0 z-10">
                  <tr>
                    <th className="p-4 text-left">Integrante</th>
                    <th className="p-4 text-left">Tipo de Ausência</th>
                    <th className="p-4 text-center">Início</th>
                    <th className="p-4 text-center">Fim</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {filteredAbsencesByYear.map(abs => (
                    <tr key={abs.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="p-4 text-[11px] font-bold text-gray-700">{getResourceName(abs.resource_id)}</td>
                      <td className="p-4 flex items-center gap-2">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-md text-gray-700 border ${getAbsenceColor(abs.category).replace('bg-', 'bg-opacity-20 bg-')}`}>
                          {abs.category}
                        </span>
                        {/* Indicador visual se houver observação */}
                        {abs.description && <span title={abs.description} className="text-gray-400 cursor-help">💬</span>}
                      </td>
                      <td className="p-4 text-center text-[11px] font-mono text-gray-600">{format(parseISO(abs.start_date), 'dd/MM/yyyy')}</td>
                      <td className="p-4 text-center text-[11px] font-mono text-gray-600">{format(parseISO(abs.end_date), 'dd/MM/yyyy')}</td>
                      <td className="p-4 text-right space-x-1 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(abs)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all text-[12px]" title="Editar">✎</button>
                        <button onClick={() => setAbsenceToDelete(abs)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all text-[12px]" title="Excluir">✕</button>
                      </td>
                    </tr>
                  ))}
                  {filteredAbsencesByYear.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-sm text-gray-400 font-bold">Nenhum lançamento de ausência encontrado para o ano {selectedYear || 'selecionado'}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showVacationModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <form onSubmit={handleSaveVacation} className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl animate-in zoom-in flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-black mb-6 text-gray-800 tracking-tight flex-shrink-0">
              {editingAbsence ? 'Editar Lançamento' : 'Agendar Lançamento'}
            </h2>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {vacationForm.resource_id && (!editingAbsence || dragState.startDate) ? (
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-4">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Resumo da Seleção</p>
                  <p className="text-sm font-bold text-blue-900 mb-2">{getResourceName(vacationForm.resource_id)}</p>
                  
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Início</label>
                      <input type="date" required className="w-full p-2.5 mt-1 bg-white border border-blue-100 rounded-xl text-xs font-bold text-blue-800 outline-none focus:border-blue-400" value={vacationForm.start_date} onChange={e => setVacationForm({...vacationForm, start_date: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Fim</label>
                      <input type="date" required className="w-full p-2.5 mt-1 bg-white border border-blue-100 rounded-xl text-xs font-bold text-blue-800 outline-none focus:border-blue-400" value={vacationForm.end_date} onChange={e => setVacationForm({...vacationForm, end_date: e.target.value})} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <select required className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold" value={vacationForm.resource_id} onChange={e => setVacationForm({...vacationForm, resource_id: Number(e.target.value)})}>
                    <option value="" disabled>Selecionar Integrante</option>
                    {resources.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" required className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-600" value={vacationForm.start_date} onChange={e => setVacationForm({...vacationForm, start_date: e.target.value})} />
                    <input type="date" required className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-600" value={vacationForm.end_date} onChange={e => setVacationForm({...vacationForm, end_date: e.target.value})} />
                  </div>
                </>
              )}

              <select required className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold" value={vacationForm.category} onChange={e => setVacationForm({...vacationForm, category: e.target.value})}>
                <option value="" disabled>Selecionar Tipo de Registro</option>
                <option value="Suspensão/Férias">🔵 Suspensão/Férias</option>
                <option value="Previsão">💮 Previsão</option>
                <option value="Folga">🟩 Folga</option>
                <option value="Dia trabalhado">🔴 Dia trabalhado</option>
              </select>

              {/* FIX: Novo campo de Observação (até 4000 caracteres) */}
              <textarea 
                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 resize-none" 
                rows="3" 
                maxLength={4000} 
                placeholder="Observação (opcional, até 4000 caracteres)" 
                value={vacationForm.description} 
                onChange={e => setVacationForm({...vacationForm, description: e.target.value})}
              />
            </div>

            <div className="flex gap-2 mt-6 flex-wrap flex-shrink-0">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black tracking-widest text-[10px] shadow-lg shadow-blue-100 min-w-[120px]">
                {editingAbsence ? 'Salvar Alterações' : 'Confirmar'}
              </button>
              
              {editingAbsence && (
                <button type="button" onClick={handleRemoveDays} className="flex-1 bg-white border border-red-200 text-red-500 hover:bg-red-50 py-4 rounded-2xl font-black tracking-widest text-[10px] min-w-[120px] transition-colors">
                  Remover Período
                </button>
              )}

              <button type="button" onClick={() => setShowVacationModal(false)} className="px-6 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-[10px]">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {absenceToDelete && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ⚠️
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-2">Excluir Lançamento?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Você está prestes a remover o registro de <strong className="text-gray-700">{getResourceName(absenceToDelete.resource_id)}</strong>.<br/>Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setAbsenceToDelete(null)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-xs hover:bg-gray-200 transition-all">Cancelar</button>
              <button onClick={executeDeleteAbsence} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-xs hover:bg-red-700 shadow-lg shadow-red-100 transition-all">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}