import { IsUUID } from 'class-validator';

// Fase 6 (DB-5): sucursal elegida en la barra superior.
export class SucursalPreferidaDto {
  @IsUUID()
  sucursalId: string;
}
