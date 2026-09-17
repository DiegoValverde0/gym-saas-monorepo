import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Users, Clock } from 'lucide-react';

interface Cliente {
  id: string;
  nombre: string;
  numeroDocumento?: string | null;
}

interface Disciplina {
  id: string;
  nombre: string;
}

interface Entrenador {
  id: string;
  usuario?: { nombreCompleto: string };
}

interface Sucursal {
  id: string;
  nombre: string;
}

interface Reserva {
  id: string;
  estado: string;
  clienteId: string;
  cliente?: Cliente;
}

export interface Clase {
  id: string;
  nombreClase: string;
  descripcion?: string | null;
  capacidadMaxima: number;
  duracionMinutos: number;
  fechaHora: string;
  estado: string;
  sucursalId?: string | null;
  disciplinaId?: string | null;
  entrenadorId?: string | null;
  disciplina?: Disciplina;
  entrenador?: Entrenador;
  sucursal?: Sucursal;
  reservas?: Reserva[];
}

interface WeeklyCalendarProps {
  classes: Clase[];
  currentDate: Date;
  onDateClick: (date: Date) => void;
  onClassClick: (clase: Clase) => void;
  onReservaClick: (claseId: string, e: React.MouseEvent) => void;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 to 20:00

export function WeeklyCalendar({ classes, currentDate, onDateClick, onClassClick, onReservaClick }: WeeklyCalendarProps) {
  
  // Calculate start of week (Monday)
  const startOfWeek = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  }, [currentDate]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [startOfWeek]);

  // Group classes by day (0-6) and hour (6-20)
  const classesByDayAndHour = useMemo(() => {
    const map = new Map<string, Clase[]>();
    classes.forEach(c => {
      if (c.estado !== 'ACTIVO') return; // Only show active classes in calendar
      const d = new Date(c.fechaHora);
      
      // Check if it's within the current week
      if (d >= days[0] && d < new Date(days[6].getTime() + 86400000)) {
        const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0 for Monday, 6 for Sunday
        const hour = d.getHours();
        const key = `${dayIndex}-${hour}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    });
    return map;
  }, [classes, days]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
      {/* Header Days */}
      <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50">
        <div className="p-4 flex items-center justify-center border-r border-slate-200">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hora</span>
        </div>
        {days.map((day, idx) => {
          const isToday = new Date().toDateString() === day.toDateString();
          return (
            <div key={idx} className={`p-3 flex flex-col items-center justify-center border-r border-slate-200 last:border-0 ${isToday ? 'bg-indigo-50/50' : ''}`}>
              <span className={`text-xs font-semibold uppercase ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                {day.toLocaleDateString('es-ES', { weekday: 'short' })}
              </span>
              <span className={`text-lg font-bold ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8 min-w-[800px]">
          {/* Times Column */}
          <div className="flex flex-col border-r border-slate-200 bg-slate-50/50 sticky left-0 z-10">
            {HOURS.map(hour => (
              <div key={hour} className="h-24 flex items-start justify-center p-2 border-b border-slate-200/50">
                <span className="text-xs font-medium text-slate-400">{hour.toString().padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Days Columns */}
          {days.map((day, dayIndex) => (
            <div key={dayIndex} className="flex flex-col border-r border-slate-200 last:border-0">
              {HOURS.map(hour => {
                const key = `${dayIndex}-${hour}`;
                const slotClasses = classesByDayAndHour.get(key) || [];
                
                const handleSlotClick = (e: React.MouseEvent) => {
                  // If clicked directly on the slot (not a class card), trigger new class
                  if (e.target === e.currentTarget) {
                    const newDate = new Date(day);
                    newDate.setHours(hour, 0, 0, 0);
                    onDateClick(newDate);
                  }
                };

                return (
                  <div 
                    key={hour} 
                    className="h-24 border-b border-slate-200/50 p-1 relative hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={handleSlotClick}
                  >
                    {/* Add Class Hover Button */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-indigo-50/50 transition-opacity pointer-events-none">
                      <span className="text-xs font-semibold text-indigo-600 bg-white px-2 py-1 rounded-full shadow-sm">
                        + Agregar
                      </span>
                    </div>

                    {/* Classes in this slot */}
                    <div className="absolute inset-1 flex flex-col gap-1 z-10 overflow-hidden">
                      {slotClasses.map(c => {
                        const reservasCount = c.reservas?.length || 0;
                        const isFull = reservasCount >= c.capacidadMaxima;
                        return (
                          <div 
                            key={c.id} 
                            onClick={(e) => { e.stopPropagation(); onClassClick(c); }}
                            className={`flex flex-col p-1.5 rounded-md border text-xs leading-tight transition-transform hover:scale-[1.02] shadow-sm cursor-pointer ${
                              isFull ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-200'
                            }`}
                          >
                            <span className="font-semibold text-slate-800 truncate" title={c.nombreClase}>{c.nombreClase}</span>
                            <span className="text-[10px] text-slate-500 truncate">{c.entrenador?.usuario?.nombreCompleto || 'Sin profe'}</span>
                            
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <Clock className="w-3 h-3" /> {c.duracionMinutos}m
                              </span>
                              
                              <button 
                                onClick={(e) => onReservaClick(c.id, e)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium text-[10px] ${
                                  isFull ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                }`}
                              >
                                <Users className="w-3 h-3" />
                                {reservasCount}/{c.capacidadMaxima}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
