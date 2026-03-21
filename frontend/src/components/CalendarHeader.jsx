import React from 'react';
import { format } from 'date-fns';

export default function CalendarHeader({ monthGroups, days, leftHeaderContent }) {
  return (
    <thead className="sticky top-0 z-30 shadow-sm">
      <tr className="border-b border-gray-200">
        {leftHeaderContent.topRow}
        {monthGroups.map((m, idx) => (
          <th key={idx} colSpan={m.count} className={`border-r border-gray-200 p-2 text-[10px] font-black uppercase tracking-widest ${m.isEven ? 'bg-blue-200 text-blue-900' : 'bg-green-200 text-green-900'}`}>
            {m.label}
          </th>
        ))}
      </tr>
      <tr className="bg-gray-100 text-[10px] font-black uppercase tracking-tighter">
        {leftHeaderContent.bottomRow}
        {days.map(day => {
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <th key={format(day, 'yyyy-MM-dd')} className={`p-1.5 text-center border-r border-gray-200 min-w-[35px] ${isWeekend ? 'bg-gray-200 text-gray-500' : 'text-gray-700'}`}>
              {format(day, 'dd')}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}