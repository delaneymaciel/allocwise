import React, { useState, useEffect } from 'react';

export default function TreeFilterModal({ isOpen, onClose, onApply, currentFilter, availableTypes }) {
  const [idInput, setIdInput] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(currentFilter?.ids || []);
      setSelectedTypes(currentFilter?.types?.length > 0 ? currentFilter.types : availableTypes);
    }
  }, [isOpen, currentFilter, availableTypes]);

  if (!isOpen) return null;

  // Lógica de UX: Se todos estão selecionados, o botão deve desmarcar. Caso contrário, marcar todos.
  const allSelected = selectedTypes.length === availableTypes.length;

  const handleToggleAllTypes = () => {
    if (allSelected) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes([...availableTypes]);
    }
  };

  const handleAddId = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newId = idInput.trim().replace(',', '');
      if (newId && !isNaN(newId) && !selectedIds.includes(newId)) {
        setSelectedIds([...selectedIds, newId]);
      }
      setIdInput("");
    }
  };

  const handleRemoveId = (idToRemove) => {
    setSelectedIds(selectedIds.filter(id => id !== idToRemove));
  };

  const handleToggleType = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const applyFilter = () => {
    onApply({ active: selectedIds.length > 0, ids: selectedIds, types: selectedTypes });
    onClose();
  };

  const clearFilter = () => {
    onApply({ active: false, ids: [], types: [] });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-gray-800">Filtro Avançado de Árvore</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[12px] font-black text-gray-800 uppercase tracking-widest block mb-2">IDs Origem</label>
            <span className="text-[10px] font-bold text-gray-500 block mb-3">Digite o ID e pressione Enter.</span>
            <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded-xl bg-gray-50 focus-within:border-blue-500 transition-all min-h-[50px]">
              {selectedIds.map(id => (
                <span key={id} className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg">
                  #{id}
                  <button type="button" onClick={() => handleRemoveId(id)} className="hover:text-blue-900">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </span>
              ))}
              <input type="text" value={idInput} onChange={(e) => setIdInput(e.target.value)} onKeyDown={handleAddId} placeholder="Ex: 15432" className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-semibold outline-none" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex justify-between items-end mb-3">
              <label className="text-[12px] font-black text-gray-800 uppercase tracking-widest block">Tipos Visíveis</label>
              {/* LINK ÚNICO DE UX DINÂMICO */}
              <button 
                type="button" 
                onClick={handleToggleAllTypes} 
                className={`text-[10px] font-black uppercase tracking-wider transition-colors ${allSelected ? 'text-gray-400 hover:text-gray-600' : 'text-blue-600 hover:text-blue-800'}`}
              >
                {allSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {availableTypes.map(type => {
                const isSelected = selectedTypes.includes(type);
                return (
                  <button 
                    key={type} 
                    type="button" 
                    onClick={() => handleToggleType(type)} 
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button type="button" onClick={clearFilter} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-xs hover:bg-gray-200 transition-all">Limpar Filtro</button>
          <button type="button" onClick={applyFilter} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Aplicar na Tela</button>
        </div>
      </div>
    </div>
  );
}