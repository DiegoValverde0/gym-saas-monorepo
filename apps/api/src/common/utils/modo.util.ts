import { PrismaService } from '../../prisma/prisma.service';

// Modo de uso de la organización (plan de simplificación, sección 4): decide
// cuánto detalle muestra el sistema. No borra datos ni cambia reglas
// guardadas. Se guarda en Organizacion.configuracion.modoUso (JSON, sin
// cambio de base de datos).
export const MODOS_USO = ['simple', 'intermedio', 'experto'] as const;
export type ModoUso = (typeof MODOS_USO)[number];

// Por defecto intermedio: los gimnasios que ya existían no pierden nada
// visible al desplegar. Debe coincidir con use-modo-uso.ts del frontend.
export const MODO_USO_POR_DEFECTO: ModoUso = 'intermedio';

export function modoDeConfiguracion(configuracion: unknown): ModoUso {
  const modo = (configuracion as { modoUso?: unknown } | null)?.modoUso;
  return MODOS_USO.includes(modo as ModoUso) ? (modo as ModoUso) : MODO_USO_POR_DEFECTO;
}

export async function obtenerModoUso(prisma: PrismaService, organizacionId: string): Promise<ModoUso> {
  const org = await prisma.extendedClient.organizacion.findUnique({
    where: { id: organizacionId },
    select: { configuracion: true },
  });
  return modoDeConfiguracion(org?.configuracion);
}
