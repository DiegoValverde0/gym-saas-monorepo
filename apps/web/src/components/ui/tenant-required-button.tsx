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

    // El superadmin de plataforma nunca puede escribir datos de un tenant,
    // ni siquiera impersonando una organización específica desde el selector
    // (el backend lo bloquea a nivel de RLS). Cortamos acá para no abrir un
    // formulario que va a fallar sí o sí con un error confuso.
    if (user?.is_superadmin) {
      toast({
        title: 'Acción no disponible para superadmin',
        description: 'El superadmin de plataforma no puede crear ni editar datos de una organización. Usa "Organizaciones" para crear el gimnasio (queda con su administrador inicial), o inicia sesión como administrador de esa organización para gestionar sus datos.',
        variant: 'destructive',
      });
      return;
    }

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
