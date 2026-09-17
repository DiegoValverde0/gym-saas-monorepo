import React from 'react';
import { Button } from '@/components/ui/button';
import { Protect } from '@/components/ui/protect';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  permission?: string;
  isSearch?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  permission,
  isSearch = false
}: EmptyStateProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center flex flex-col items-center max-w-3xl mx-auto my-8">
      <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400 rounded-full flex items-center justify-center mb-6 shadow-xs border border-indigo-100 dark:border-indigo-800/50">
        <Icon className="w-8 h-8" />
      </div>
      
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </h3>
      
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-md leading-relaxed">
        {description}
      </p>
      
      {!isSearch && actionLabel && onAction && (
        permission ? (
          <Protect permission={permission} fallbackType="hide">
            <Button onClick={onAction} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 h-auto shadow-md transition-all hover:shadow-lg">
              {actionIcon && <span className="mr-2">{actionIcon}</span>}
              {actionLabel}
            </Button>
          </Protect>
        ) : (
          <Button onClick={onAction} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 h-auto shadow-md transition-all hover:shadow-lg">
            {actionIcon && <span className="mr-2">{actionIcon}</span>}
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}
