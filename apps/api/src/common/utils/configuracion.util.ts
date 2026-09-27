import { Prisma } from '@prisma/client';

// La configuración es un JSON con varias secciones (modulos, modoUso,
// onboarding, requerimientosCliente...). Guardar desde una pantalla que solo
// conoce algunas no debe borrar las demás: se combinan sección por sección.
export function combinarConfiguracion(actual: unknown, cambios: object): Prisma.InputJsonValue {
  const base = (actual && typeof actual === 'object' && !Array.isArray(actual) ? actual : {}) as Record<string, unknown>;
  const resultado: Record<string, unknown> = { ...base };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined) continue;
    const previo = base[clave];
    const ambosObjetos = valor && typeof valor === 'object' && !Array.isArray(valor) && previo && typeof previo === 'object' && !Array.isArray(previo);
    // Los DTO de class-transformer traen las propiedades opcionales no
    // enviadas como `undefined`: se descartan para no pisar lo guardado.
    const definidos = (obj: object) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
    resultado[clave] = ambosObjetos ? { ...(previo as object), ...definidos(valor as object) } : valor;
  }
  return resultado as Prisma.InputJsonValue;
}

// Secciones de la configuración que no deben salir del servidor: el hash del
// PIN del kiosco (un PIN de 4 a 6 números se adivina fácil a partir de su
// hash). En su lugar se informa solo si existe.
export function configuracionPublica(configuracion: unknown): unknown {
  if (!configuracion || typeof configuracion !== 'object' || Array.isArray(configuracion)) return configuracion;
  const { kiosco, ...resto } = configuracion as Record<string, unknown>;
  if (kiosco === undefined) return resto;
  const pinHash = (kiosco as { pinHash?: unknown } | null)?.pinHash;
  return { ...resto, kiosco: { tienePin: typeof pinHash === 'string' && pinHash.length > 0 } };
}

export function sinSecretos<T extends { configuracion?: unknown }>(org: T): T {
  return org && 'configuracion' in org ? { ...org, configuracion: configuracionPublica(org.configuracion) } : org;
}
