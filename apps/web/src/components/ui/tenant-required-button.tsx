"use client";

import { useTenantStore } from '@/store/use-tenant-store';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ReactNode, ComponentProps } from 'react';

interface TenantRequiredButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  onClick: () => void;
  icon?: ReactNode;
  label: string;
}

export function TenantRequiredButton({
  onClick,
  icon,
  label,
  className = "bg-indigo-600 hover:bg-indigo-500 text-white",
  ...props
}: TenantRequiredButtonProps) {
  const { activeTenantId } = useTenantStore();
  const { user } = useAuth({ redirectIfUnauthenticated: false });
  const userOrgId = user?.organizacionId;

  const { toast } = useToast();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!userOrgId && (!activeTenantId || activeTenantId === 'all')) {
      toast({ 
        title: 'Acción requerida', 
        description: 'Por favor, selecciona una organización específica en el menú superior antes de registrar un dato.', 
        variant: 'destructive' 
      });
      return;
    }
    
    onClick();
  };

  return (
    <Button onClick={handleClick} className={className} {...props}>
      {icon}
      {label}
    </Button>
  );
}
