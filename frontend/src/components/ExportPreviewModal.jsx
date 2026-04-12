import React, { useState } from 'react';

export default function ExportPreviewModal({ isOpen, onClose, onConfirm, data }) {
  const [indentSize, setIndentSize] = useState(3);

  if (!isOpen) return null;

  // Pegamos uma amostra (ex: 6 itens) para o preview real
  const previewData = data.slice(0, 8);

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-gray-800">Configurações de Exportação</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Controle de Recuo */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <label className="text-[12px] font-black text-gray-800 uppercase tracking-widest">Recuo Hierárquico (Espaços)</label>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-black">{indentSize}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="50" // Aumentado para dar mais liberdade, mas mantendo um teto seguro
              value={indentSize} 
              onChange={(e) => setIndentSize(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Área de Preview Real */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">Pré-visualização (Amostra)</label>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-inner">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase">Título (Estrutura no Excel)</th>
                    <th className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase text-right">Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 text-[11px] font-semibold text-gray-700">
                      <td className="px-4 py-2 whitespace-pre">
                        {' '.repeat(item.depth * indentSize)}{item.node.title}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400 font-bold">{item.depth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-black text-xs hover:bg-gray-200 transition-all">Cancelar</button>
          <button 
            onClick={() => onConfirm(indentSize)} 
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <span>📥</span> Baixar Planilha
          </button>
        </div>
      </div>
    </div>
  );
}