import React from 'react';
import { Trash2 } from 'lucide-react';
import { Protect } from '@/components/ui/protect';

interface PapeleraToggleProps {
  showDeleted: boolean;
  setShowDeleted: (show: boolean) => void;
}

export function PapeleraToggle({ showDeleted, setShowDeleted }: PapeleraToggleProps) {
  return (
    <Protect permission="sistema:restaurar" fallbackType="hide">
      <button
        type="button"
        onClick={() => setShowDeleted(!showDeleted)}
        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors border
          ${showDeleted 
            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
      >
        <Trash2 className="w-4 h-4" />
        {showDeleted ? 'Ocultar Papelera' : 'Ver Papelera'}
      </button>
    </Protect>
  );
}
