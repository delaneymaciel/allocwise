import { useMemo } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function useCalendar(startDate, endDate, holidays = []) {
  const days = useMemo(() => {
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [startDate, endDate]);

  const monthGroups = useMemo(() => {
    const months = [];
    let currentMonthLabel = null;
    days.forEach(day => {
      const label = format(day, 'MMMM yyyy', { locale: ptBR });
      if (label !== currentMonthLabel) {
        currentMonthLabel = label;
        months.push({ label, count: 1, isEven: (day.getMonth() + 1) % 2 === 0 });
      } else {
        months[months.length - 1].count++;
      }
    });
    return months;
  }, [days]);

  const getDayBgColor = (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const holiday = holidays.find(h => h.date === dateStr);

    
    if (holiday) {
      if (holiday.category === "suspensao") return "bg-yellow-200/80";
      if (holiday.category === "local") return "bg-cyan-200/80";
      return "bg-red-200/80";
    }
    
    if (isWeekend) return "bg-gray-200/40";

    return "";
  };

  return { days, monthGroups, getDayBgColor };
}