import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function AdminView() {
  const [tables, setTables] = useState([]);
  const [query, setQuery] = useState("SELECT * FROM resources LIMIT 10");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/admin/tables').then(res => setTables(res.data));
  }, []);

  const runQuery = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.post('/api/admin/query', { query });
      setResults(res.data);
    } catch (err) { setError(err.response?.data?.detail || "Erro na consulta."); }
    finally { setLoading(false); }
  };

  const exportToJSON = () => {
    if (!results || !results.rows) return;
    const dataStr = JSON.stringify(results.rows, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "exportacao_banco.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    if (!results || !results.columns || !results.rows) return;
    const separator = ';';
    const header = results.columns.join(separator);
    const csvRows = results.rows.map(row => {
      return results.columns.map(col => {
        let val = row[col];
        if (val === null || val === undefined) val = '';
        const strVal = String(val).replace(/"/g, '""'); 
        return `"${strVal}"`;
      }).join(separator);
    });
    const csvData = [header, ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "exportacao_banco.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-[75vh] bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in">
      {/* Sidebar de Tabelas */}
      <aside className="w-64 border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Tabelas Disponíveis</h3>
        <div className="space-y-2">
          {tables.map(t => (
            <button key={t} onClick={() => setQuery(`SELECT * FROM ${t} LIMIT 50`)} className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold text-gray-600 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-100 italic">
              {t}
            </button>
          ))}
        </div>
      </aside>

      {/* Área de Comando e Resultados */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Superior: Editor e Controles */}
        <div className="p-6 border-b border-gray-100 bg-white">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">SQL Editor (Somente Leitura)</span>
            <div className="flex gap-2">
              {results && results.rows.length > 0 && (
                <>
                  <button onClick={exportToCSV} className="bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-100 transition-colors">
                    📥 CSV
                  </button>
                  <button onClick={exportToJSON} className="bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-100 transition-colors mr-2">
                    📥 JSON
                  </button>
                </>
              )}
              <button onClick={runQuery} disabled={loading} className="bg-green-500 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-green-600 shadow-lg shadow-green-100 flex items-center gap-2 transition-colors">
                {loading ? '...' : '▶ EXECUTAR'}
              </button>
              <button onClick={() => setResults(null)} className="bg-gray-100 text-gray-400 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-gray-200 transition-colors">
                ■ PARAR
              </button>
            </div>
          </div>
          <textarea className="w-full h-32 p-4 bg-gray-900 text-green-400 font-mono text-xs rounded-2xl outline-none border-2 border-gray-800 focus:border-blue-500" value={query} onChange={(e) => setQuery(e.target.value)} />
          {error && <div className="mt-2 text-[10px] font-bold text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">⚠️ {error}</div>}
        </div>

        {/* Inferior: Grid de Resultados */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50/30">
          {results ? (
            <table className="min-w-full bg-white border border-gray-100 rounded-xl">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {results.columns.map(col => <th key={col} className="p-3 text-left text-[9px] font-black text-gray-400 uppercase border-b border-r border-gray-100">{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-blue-50/30">
                    {results.columns.map(col => <td key={col} className="p-3 text-[10px] text-gray-600 border-b border-r border-gray-50">{String(row[col])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-300 text-xs font-bold italic">Execute um select para visualizar os dados...</div>
          )}
        </div>
      </main>
    </div>
  );
}