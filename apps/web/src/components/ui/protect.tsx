"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ProtectProps {
  permission: string;
  children: React.ReactNode;
  fallbackType?: "hide" | "redirect";
}

export function Protect({ permission, children, fallbackType = "hide" }: ProtectProps) {
  const { hasPermission, isLoading } = usePermissions();
  const router = useRouter();
  const { toast } = useToast();

  const isAllowed = hasPermission(permission);

  useEffect(() => {
    if (!isLoading && !isAllowed && fallbackType === "redirect") {
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
