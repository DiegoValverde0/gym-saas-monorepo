import { IsUUID } from 'class-validator';

export class CreateReservaClaseDto {
  @IsUUID()
  claseId: string;

  @IsUUID()
  clienteId: string;
}
