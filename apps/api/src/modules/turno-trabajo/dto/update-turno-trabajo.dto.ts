import { PartialType } from '@nestjs/mapped-types';
import { CreateTurnoTrabajoDto } from './create-turno-trabajo.dto';

export class UpdateTurnoTrabajoDto extends PartialType(CreateTurnoTrabajoDto) {}
