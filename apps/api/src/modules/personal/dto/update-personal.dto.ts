import { PartialType } from '@nestjs/mapped-types';
import { CreatePersonalDto } from './create-personal.dto';

// usuarioId llega en el payload por herencia de CreatePersonalDto, pero el
// servicio lo ignora en update() -- el perfil de staff queda ligado al mismo
// usuario para siempre, no se "reasigna" a otra persona.
export class UpdatePersonalDto extends PartialType(CreatePersonalDto) {}
