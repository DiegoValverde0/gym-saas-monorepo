import { SetMetadata } from '@nestjs/common';

export const MODULO_KEY = 'modulo_requerido';

// Debe coincidir con las claves de Organizacion.configuracion.modulos
// (ver update-mi-organizacion.dto.ts y dashboard/layout.tsx en el frontend).
export type ModuloTenant = 'puntoVenta' | 'clasesGrupales' | 'controlPersonal' | 'reportesAvanzados' | 'controlGastos' | 'controlAcceso';

export const RequiereModulo = (modulo: ModuloTenant) => SetMetadata(MODULO_KEY, modulo);
