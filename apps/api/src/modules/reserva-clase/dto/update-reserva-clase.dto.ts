import { IsEnum } from 'class-validator';
import { EstadoReserva } from '@prisma/client';

// Para marcar asistencia (ASISTIO/NO_ASISTIO) tras la clase; cancelar una
// reserva usa el endpoint dedicado PATCH :id/cancelar en vez de este DTO,
// porque tiene un permiso propio (reservas:eliminar) distinto al de
// actualizar (ver reserva-clase.controller.ts).
export class UpdateReservaClaseDto {
  @IsEnum(EstadoReserva)
  estado: EstadoReserva;
}
