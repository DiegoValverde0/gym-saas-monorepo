"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ProtectProps {
  permission: string;
  children: React.ReactNode;
  fallbackType?: "hide" | "redirect";
}

export function Protect({ permission, children, fallbackType = "hide" }: ProtectProps) {
  // isPending y no isLoading: mientras la consulta espera el token está
  // deshabilitada, isLoading vale false y, sin permisos cargados todavía, se
  // redirigía con "Acceso Denegado" a quien sí tenía el permiso.
  const { hasPermission, isPending: isLoading } = usePermissions();
  const router = useRouter();
  const { toast } = useToast();

  const isAllowed = hasPermission(permission);
  // El efecto se repite al cambiar router/toast: se avisa una sola vez.
  const redirigido = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAllowed && fallbackType === "redirect" && !redirigido.current) {
      redirigido.current = true;
      toast({
        title: "Acceso Denegado",
        description: "No tienes permiso para acceder a esta sección.",
        variant: "destructive",
      });
      router.push("/dashboard");
    }
  }, [isLoading, isAllowed, fallbackType, router, toast]);

  if (isLoading && fallbackType === "redirect") {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
