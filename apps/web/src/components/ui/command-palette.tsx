"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users,
  Wallet,
  Settings,
  ShieldCheck,
  ClipboardList,
  UserCog,
  CreditCard,
  Building2,
  Calendar,
  LayoutDashboard,
  Receipt,
  Truck
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useModulosActivos } from "@/hooks/use-modulos-activos";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const modulos = useModulosActivos();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigateTo = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Escribe un comando o busca algo..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
        
        <CommandGroup heading="Navegación Principal">
          <CommandItem onSelect={() => navigateTo('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          
          {hasPermission('clientes:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/clientes')}>
              <Users className="mr-2 h-4 w-4" />
              <span>Clientes</span>
            </CommandItem>
          )}

          {modulos.puntoVenta && hasPermission('cajas_registradoras:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/cajas')}>
              <Wallet className="mr-2 h-4 w-4" />
              <span>Cajas Registradoras</span>
            </CommandItem>
          )}

          {modulos.puntoVenta && hasPermission('transacciones:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/transacciones')}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Transacciones (Ventas)</span>
            </CommandItem>
          )}

          {modulos.clasesGrupales && hasPermission('clases:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/clases')}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>Clases Programadas</span>
            </CommandItem>
          )}

          {modulos.controlGastos && hasPermission('transacciones:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/gastos')}>
              <Receipt className="mr-2 h-4 w-4" />
              <span>Gastos</span>
            </CommandItem>
          )}

          {modulos.controlGastos && hasPermission('transacciones:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/proveedores')}>
              <Truck className="mr-2 h-4 w-4" />
              <span>Proveedores</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Administración">
          {modulos.controlPersonal && hasPermission('staff:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/personal')}>
              <UserCog className="mr-2 h-4 w-4" />
              <span>Personal (Staff)</span>
            </CommandItem>
          )}

          {modulos.clasesGrupales && hasPermission('disciplinas:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/disciplinas')}>
              <ClipboardList className="mr-2 h-4 w-4" />
              <span>Disciplinas</span>
            </CommandItem>
          )}

          {hasPermission('roles:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/roles')}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              <span>Roles y Permisos</span>
            </CommandItem>
          )}

          {hasPermission('sucursales:leer') && (
            <CommandItem onSelect={() => navigateTo('/dashboard/sucursales')}>
              <Building2 className="mr-2 h-4 w-4" />
              <span>Sucursales</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ajustes">
            <CommandItem onSelect={() => navigateTo('/dashboard/configuracion')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Configuración</span>
            </CommandItem>
        </CommandGroup>

      </CommandList>
    </CommandDialog>
  );
}
