import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateReservaClaseDto {
  @IsUUID()
  claseId: string;

  @IsUUID()
  clienteId: string;

  // Si la clase está llena, anotar al cliente en la lista de espera
  // (fase 6, DB-3) en vez de rechazar la reserva.
  @IsOptional()
  @IsBoolean()
  listaEspera?: boolean;
}
