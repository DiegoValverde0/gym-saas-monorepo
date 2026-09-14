// Formato canónico de un permiso: "modulo:accion" (ej. "clientes:leer").
// Único punto de verdad -- el frontend ya usa este orden en ~50 lugares
// (Protect, dashboard/layout.tsx), así que el backend se alinea a eso en vez
// de forzar una migración masiva del lado del cliente.
export function formatPermiso(modulo: string, accion: string): string {
  return `${modulo}:${accion}`;
}
