"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Globe, IdCard, LayoutDashboard, Lock, LogIn, Receipt, ShoppingCart, UserPlus } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useModulosActivos } from "@/hooks/use-modulos-activos";
import { useModoUso } from "@/hooks/use-modo-uso";
import { useAuth } from "@/hooks/use-auth";
import { useTenantStore } from "@/store/use-tenant-store";
import { INICIO, menuVisible } from "@/lib/navegacion";
import { VentaRapidaModal } from "@/components/ui/venta-rapida-modal";
import { VentaProductoModal } from "@/components/ui/venta-producto-modal";
import { GastoRapidoModal } from "@/components/ui/gasto-rapido-modal";
import { CerrarDiaModal } from "@/components/ui/cerrar-dia-modal";

// Para abrir la paleta desde un botón (el "Buscar…" de la barra de arriba).
const EVENTO_ABRIR = "gym:abrir-paleta";
export const abrirPaleta = () => window.dispatchEvent(new Event(EVENTO_ABRIR));

type Formulario = "venta" | "producto" | "gasto" | "cierre";

interface Accion {
  nombre: string;
  icono: React.ComponentType<{ className?: string }>;
  alias: string[];
  hacer: () => void;
}

/**
 * Paleta de comandos (Ctrl+K o "Buscar…"): las mismas pantallas que el menú
 * de esta persona (lib/navegacion.ts), también por sus nombres de antes, y
 * las acciones rápidas del Inicio (components/ui/acciones-rapidas.tsx).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { permisos, hasPermission } = usePermissions();
  const modulos = useModulosActivos();
  const { modo } = useModoUso();
  const { isSuperAdmin } = useAuth({ redirectIfUnauthenticated: false });
  const { activeTenantId } = useTenantStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    const abrir = () => setOpen(true);
    document.addEventListener("keydown", down);
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener(EVENTO_ABRIR, abrir);
    };
  }, []);

  const ir = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const abrirFormulario = (f: Formulario) => {
    setOpen(false);
    setFormulario(f);
  };

  const grupos = menuVisible({ permisos, modulos, modo });
  // Las acciones crean algo en un gimnasio: el superadmin primero elige uno.
  const conGimnasio = !isSuperAdmin || !!activeTenantId;
  const acciones = (
    [
      hasPermission("clientes:crear") && {
        nombre: "Nuevo cliente",
        icono: UserPlus,
        alias: ["registrar cliente", "alta de cliente", "socio nuevo"],
        // Si ya está en Clientes, la página abre el formulario sin navegar.
        hacer: () => {
          if (pathname === "/dashboard/clientes") {
            setOpen(false);
            window.dispatchEvent(new Event("gym:nuevo-cliente"));
          } else {
            ir("/dashboard/clientes?nuevo=1");
          }
        },
      },
      hasPermission("membresias:crear") && { nombre: "Vender membresía", icono: IdCard, alias: ["renovar membresía", "nueva venta", "cobrar"], hacer: () => abrirFormulario("venta") },
      modulos.controlAcceso && hasPermission("asistencias:crear") && { nombre: "Registrar ingreso", icono: LogIn, alias: ["asistencia", "entrada", "marcar ingreso"], hacer: () => ir("/dashboard/asistencias") },
      modulos.puntoVenta && hasPermission("transacciones:crear") && { nombre: "Vender producto", icono: ShoppingCart, alias: ["bebida", "suplemento"], hacer: () => abrirFormulario("producto") },
      modulos.controlGastos && hasPermission("transacciones:crear") && { nombre: "Registrar gasto", icono: Receipt, alias: ["pagar", "egreso"], hacer: () => abrirFormulario("gasto") },
      hasPermission("aperturas_caja:crear") && { nombre: "Cerrar el día", icono: Lock, alias: ["cerrar caja", "arqueo"], hacer: () => abrirFormulario("cierre") },
    ].filter(Boolean) as Accion[]
  ).filter(() => conGimnasio);

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Busca una pantalla o una acción">
        <CommandInput placeholder="Busca una pantalla o una acción…" />
        <CommandList>
          <CommandEmpty>No encontramos nada con ese nombre.</CommandEmpty>

          {acciones.length > 0 && (
            <>
              <CommandGroup heading="Acciones rápidas">
                {acciones.map((a) => (
                  <CommandItem key={a.nombre} value={a.nombre} keywords={a.alias} onSelect={a.hacer}>
                    <a.icono className="mr-2 h-4 w-4" />
                    <span>{a.nombre}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Ir a">
            <CommandItem value={INICIO.nombre} keywords={[...INICIO.alias]} onSelect={() => ir(INICIO.href)}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>{INICIO.nombre}</span>
            </CommandItem>
            {isSuperAdmin && (
              <CommandItem value="Organizaciones" keywords={["gimnasios", "sistema"]} onSelect={() => ir("/dashboard/organizaciones")}>
                <Globe className="mr-2 h-4 w-4" />
                <span>Organizaciones</span>
              </CommandItem>
            )}
          </CommandGroup>

          {grupos.map((g) => (
            <CommandGroup key={g.titulo} heading={g.titulo}>
              {g.pantallas.map((p) => (
                // Se encuentra por su nombre, por los de antes y por el de su grupo.
                <CommandItem key={p.href} value={p.nombre} keywords={[g.titulo, ...(p.alias ?? [])]} onSelect={() => ir(p.href)}>
                  <p.icono className="mr-2 h-4 w-4" />
                  <span>{p.nombre}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <VentaRapidaModal open={formulario === "venta"} onOpenChange={(a) => setFormulario(a ? "venta" : null)} />
      <VentaProductoModal open={formulario === "producto"} onOpenChange={(a) => setFormulario(a ? "producto" : null)} />
      <GastoRapidoModal open={formulario === "gasto"} onOpenChange={(a) => setFormulario(a ? "gasto" : null)} />
      <CerrarDiaModal open={formulario === "cierre"} onOpenChange={(a) => setFormulario(a ? "cierre" : null)} />
    </>
  );
}
