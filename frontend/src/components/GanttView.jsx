import React, { useMemo, useState, useEffect, useRef } from 'react';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import CalendarHeader from './CalendarHeader';

const getPriorityData = (priorityValue) => {
  const pStr = parseInt(priorityValue, 10);
  const safeP = isNaN(pStr) ? 5 : Math.max(0, Math.min(5, pStr));
  const colors = ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#fca5a5'];
  return { value: safeP, color: colors[safeP] };
};

export default function GanttView({ data, getWorkItemIcon, onOpenAllocationModal, savedScrollPosition, onSaveScrollPosition, showTeamNames = true }) {
  const [holidays, setHolidays] = useState([]);
  const [resourcesMap, setResourcesMap] = useState({});
  const [assignmentsMap, setAssignmentsMap] = useState({});
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef(null);
  const initialScrollDone = useRef(false); 
  const scrollPosRef = useRef({ top: 0, left: 0 });
  const scrollTimeoutRef = useRef(null);
  const dayWidth = 35; 
  const rowHeight = 48;
  const visibleRows = 20;
  const overscan = 5;

  useEffect(() => {
    const loadGanttData = async () => {
      try {
        const [resH, resR] = await Promise.all([
          api.get('/api/holidays'),
          api.get('/api/resources')
        ]);
        setHolidays(resH.data);
        const rMap = {};
        resR.data.forEach(r => { rMap[r.id] = r; });
        setResourcesMap(rMap);
        const aMap = {};
        if (data && data.length > 0) {
          await Promise.all(data.map(async (item) => {
            const resA = await api.get(`/api/workitems/${item.Id}/assignments`);
            aMap[item.Id] = resA.data; 
          }));
        }
        setAssignmentsMap(aMap);
      } catch (err) {}
    };
    loadGanttData();
  }, [data]);

  const { minDate, daysCount } = useMemo(() => {
    const allDates = data.flatMap(item => [
      item.IniDev, item.FimDev, item.IniQA, item.FimQA, item.IniHML, item.FimHML, item.EstProd
    ].filter(d => d && d !== '-').map(d => new Date(d)));
    if (allDates.length === 0) return { minDate: new Date(), daysCount: 0 };
    const min = startOfDay(addDays(new Date(Math.min(...allDates)), -2));
    const max = startOfDay(addDays(new Date(Math.max(...allDates)), 15));
    return { minDate: min, daysCount: differenceInDays(max, min) + 1 };
  }, [data]);

  const overbookedSet = useMemo(() => {
    const conflicts = new Set();
    const resourceTimelines = {};
    data.forEach(node => {
      ['Dev', 'QA', 'HML'].forEach(phase => {
        const startStr = node[`Ini${phase}`];
        const endStr = node[`Fim${phase}`];
        if (!startStr || startStr === '-' || !endStr || endStr === '-') return;
        const start = new Date(startStr).getTime();
        const end = new Date(endStr).getTime();
        const assigns = assignmentsMap[node.Id]?.filter(a => a.phase === phase) || [];
        assigns.forEach(a => {
          if (!resourceTimelines[a.resource_id]) resourceTimelines[a.resource_id] = [];
          resourceTimelines[a.resource_id].push({ featureId: node.Id, phase, start, end });
        });
      });
    });
    Object.values(resourceTimelines).forEach(timeline => {
      timeline.sort((a, b) => a.start - b.start);
      for (let i = 0; i < timeline.length; i++) {
        for (let j = i + 1; j < timeline.length; j++) {
          if (timeline[j].start <= timeline[i].end) {
            conflicts.add(`${timeline[i].featureId}-${timeline[i].phase}`);
            conflicts.add(`${timeline[j].featureId}-${timeline[j].phase}`);
          } else {
            break;
          }
        }
      }
    });
    return conflicts;
  }, [data, assignmentsMap]);

  const dependencyLines = useMemo(() => {
    const lines = [];
    const nodeIndexMap = new Map(data.map((n, i) => [n.Id, i]));
    data.forEach((targetNode, targetIdx) => {
      const deps = targetNode.Dependencies || [];
      deps.forEach(depId => {
        const sourceIdx = nodeIndexMap.get(depId);
        if (sourceIdx !== undefined) {
          const sourceNode = data[sourceIdx];
          const sourceEndStr = sourceNode.FimHML !== '-' ? sourceNode.FimHML : (sourceNode.FimQA !== '-' ? sourceNode.FimQA : sourceNode.FimDev);
          const targetStartStr = targetNode.IniDev !== '-' ? targetNode.IniDev : (targetNode.IniQA !== '-' ? targetNode.IniQA : targetNode.IniHML);
          if (sourceEndStr && targetStartStr && sourceEndStr !== '-' && targetStartStr !== '-') {
            const sourceX = (differenceInDays(new Date(sourceEndStr), minDate) + 1) * dayWidth;
            const sourceY = sourceIdx * rowHeight + (rowHeight / 2);
            const targetX = differenceInDays(new Date(targetStartStr), minDate) * dayWidth;
            const targetY = targetIdx * rowHeight + (rowHeight / 2);
            const path = `M ${sourceX} ${sourceY} C ${sourceX + 20} ${sourceY}, ${targetX - 20} ${targetY}, ${targetX} ${targetY}`;
            lines.push(<path key={`${sourceNode.Id}-${targetNode.Id}`} d={path} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#arrowhead)" opacity="0.6" />);
          }
        }
      });
    });
    return lines;
  }, [data, minDate, dayWidth, rowHeight]);

  const { timelineDays, monthGroups } = useMemo(() => {
    const days = [];
    const months = [];
    let currentMonthLabel = null;
    for (let i = 0; i < daysCount; i++) {
      const date = addDays(minDate, i);
      const monthLabel = format(date, 'MMMM yyyy', { locale: ptBR });
      const dateStr = format(date, 'yyyy-MM-dd');
      days.push({
        date,
        label: format(date, 'dd'),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        holiday: holidays.find(h => h.date === dateStr)
      });
      if (monthLabel !== currentMonthLabel) {
        currentMonthLabel = monthLabel;
        months.push({ label: monthLabel, count: 1, isEven: (date.getMonth() + 1) % 2 === 0 });
      } else {
        months[months.length - 1].count++;
      }
    }
    return { timelineDays: days, monthGroups: months };
  }, [minDate, daysCount, holidays]);

  const getBarCoords = (startStr, endStr) => {
    if (!startStr || startStr === '-' || !endStr || endStr === '-') return null;
    const start = new Date(startStr);
    const end = new Date(endStr);
    return { left: differenceInDays(start, minDate) * dayWidth, width: (differenceInDays(end, start) + 1) * dayWidth };
  };

  const todayPos = differenceInDays(new Date(), minDate) * dayWidth;

  useEffect(() => {
    if (scrollContainerRef.current && daysCount > 0 && !initialScrollDone.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          if (savedScrollPosition && (savedScrollPosition.top > 0 || savedScrollPosition.left > 0)) {
            scrollContainerRef.current.scrollTop = savedScrollPosition.top || 0;
            scrollContainerRef.current.scrollLeft = savedScrollPosition.left || 0;
            setScrollTop(savedScrollPosition.top || 0);
          }
          initialScrollDone.current = true; 
        }
      }, 100);
    }
  }, [daysCount, savedScrollPosition]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (onSaveScrollPosition && (scrollPosRef.current.top > 0 || scrollPosRef.current.left > 0)) {
        onSaveScrollPosition('gantt', scrollPosRef.current);
      }
    };
  }, []);

  const handleScroll = (e) => {
    const top = e.target.scrollTop;
    const left = e.target.scrollLeft;
    setScrollTop(top);
    scrollPosRef.current = { top, left };

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (onSaveScrollPosition) {
        onSaveScrollPosition('gantt', { top, left });
      }
    }, 1000);
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(data.length, Math.floor(scrollTop / rowHeight) + visibleRows + overscan);
  const visibleData = data.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = (data.length - endIndex) * rowHeight;

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-20 text-center shadow-xl border border-gray-200">
        <p className="text-gray-400 font-bold italic uppercase tracking-widest">Nenhuma demanda filtrada para o Gantt.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[75vh]">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="overflow-auto relative flex-1 scroll-smooth">
        <div className="absolute top-0 bottom-0 border-l-2 border-red-600 z-30 pointer-events-none" style={{ left: todayPos + 350 }}>
          <div className="bg-red-600 text-white text-[8px] font-black px-1 rounded-r shadow-md mt-16">HOJE</div>
        </div>
        
        <svg className="absolute z-10 pointer-events-none" style={{ top: 64, left: 350, width: timelineDays.length * dayWidth, height: data.length * rowHeight }}>
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
            </marker>
          </defs>
          {dependencyLines}
        </svg>

        <table className="border-collapse min-w-max">
          <CalendarHeader 
            monthGroups={monthGroups} 
            days={timelineDays.map(d => d.date)} 
            leftHeaderContent={{
              topRow: <th className="bg-gray-50 border-r border-gray-200 sticky left-0 z-40 min-w-[350px] w-[350px]"></th>,
              bottomRow: <th className="bg-white border-r border-gray-200 p-3 font-black text-[11px] uppercase text-gray-500 text-left sticky left-0 z-40 min-w-[350px] w-[350px]">Cronograma Executivo</th>
            }}
          />
          <tbody className="divide-y divide-gray-50">
            {topSpacerHeight > 0 && <tr style={{ height: topSpacerHeight }}></tr>}
            {visibleData.map((node) => {
              const { value: pValue, color: pColor } = getPriorityData(node.Priority);
              return (
                <tr key={node.Id} className="hover:bg-blue-50/50 group transition-all h-12 relative">
                  <td 
                    onClick={() => onOpenAllocationModal && onOpenAllocationModal(node)}
                    className="w-[350px] min-w-[350px] max-w-[350px] border-r border-gray-100 p-3 bg-white sticky left-0 z-20 flex items-center gap-2 group-hover:bg-blue-50/50 shadow-[5px_0_10px_-5px_rgba(0,0,0,0.1)] cursor-pointer"
                    title="Clique para gerir a alocação"
                  >
                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">{node.Id}</span>
                    <div className="relative flex items-center justify-center w-6 h-6 flex-shrink-0" title={`Prioridade: ${pValue}`}>
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 24">
                        <path d="M 12 2 A 10 10 0 1 1 2 12" fill="none" stroke={pColor} strokeWidth="2.5" strokeLinecap="round" />
                        <circle cx="2.6" cy="8.6" r="1.2" fill={pColor} />
                        <circle cx="4.9" cy="4.9" r="1.2" fill={pColor} />
                        <circle cx="8.6" cy="2.6" r="1.2" fill={pColor} />
                      </svg>
                      <span className="text-[10px] font-black" style={{ color: pColor }}>{pValue}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      {getWorkItemIcon && getWorkItemIcon(node.WorkItemType)}
                      <span className="text-[11px] font-bold truncate text-gray-800">{node.Title}</span>
                    </div>
                    <span className="text-[8px] font-black uppercase bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 flex-shrink-0 ml-auto">{node.State}</span>
                  </td>
                  <td colSpan={timelineDays.length} className="p-0 relative align-top">
                    <div className="flex h-12 w-full relative">
                      {timelineDays.map((day, i) => {
                        let bgColor = "";
                        if (day.isWeekend) bgColor = "bg-gray-100/40"; 
                        if (day.holiday) {
                          if (day.holiday.category === "suspensao") bgColor = "bg-yellow-100/80"; 
                          else if (day.holiday.category === "local") bgColor = "bg-cyan-100/80";    
                          else bgColor = "bg-red-100/80";                                          
                        }
                        return <div key={i} className={`h-full border-r border-gray-50 flex-shrink-0 ${bgColor}`} style={{ width: dayWidth }} title={day.holiday?.description} />;
                      })}
                      {['Dev', 'QA', 'HML'].map(phase => {
                        const coords = getBarCoords(node[`Ini${phase}`], node[`Fim${phase}`]);
                        if (!coords) return null;
                        const assignedList = assignmentsMap[node.Id]?.filter(a => a.phase === phase) || [];
                        const resourceObjs = assignedList.map(a => resourcesMap[a.resource_id]).filter(Boolean);
                        const barColor = resourceObjs.length > 0 ? resourceObjs[0].color_code : (phase === 'Dev' ? '#facc15' : phase === 'QA' ? '#16a34a' : '#ea580c');
                        const namesStr = resourceObjs.map(r => r.name.split('.')[0]).join(', ');
                        
                        // Nova regra de visualização (Mascaramento do nome se configurado)
                        const label = (resourceObjs.length > 0 && showTeamNames) ? `${phase}: ${namesStr}` : phase;
                        
                        const hasResources = resourceObjs.length > 0;
                        const isOverbooked = overbookedSet.has(`${node.Id}-${phase}`);
                        const barStyle = {
                          left: coords.left,
                          width: coords.width,
                          top: '10px',
                          backgroundColor: barColor,
                          borderColor: isOverbooked ? '#ef4444' : 'rgba(0,0,0,0.1)',
                          borderWidth: isOverbooked ? '2px' : '1px',
                          backgroundImage: isOverbooked ? 'repeating-linear-gradient(45deg, rgba(220,38,38,0.4), rgba(220,38,38,0.4) 8px, transparent 8px, transparent 16px)' : 'none'
                        };
                        return (
                          <div 
                            key={phase} 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenAllocationModal) onOpenAllocationModal(node, phase);
                            }}
                            className="absolute h-7 rounded shadow-md border flex items-center justify-center z-10 transition-transform hover:scale-105 cursor-pointer" 
                            style={barStyle}
                            title={isOverbooked ? `⚠️ ALERTA: Conflito de alocação nesta fase!\nClique para gerir a alocação` : `Clique para gerir a alocação`}
                          >
                            <span className={`text-[9px] font-black uppercase tracking-tighter px-1 truncate ${hasResources ? 'text-white drop-shadow-md' : 'text-black/60'}`}>{label}</span>
                          </div>
                        );
                      })}
                      {node.EstProd && node.EstProd !== '-' && (
                        <div className="absolute w-4 h-9 bg-blue-900 rounded-full z-20 shadow-xl border-2 border-white flex items-center justify-center" style={{ left: (differenceInDays(new Date(node.EstProd), minDate) * dayWidth) + (dayWidth/2) - 8, top: '6px' }}>
                          <span className="text-white text-xs">🚀</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {bottomSpacerHeight > 0 && <tr style={{ height: bottomSpacerHeight }}></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}