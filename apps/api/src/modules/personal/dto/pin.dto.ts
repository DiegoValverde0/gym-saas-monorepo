import { Matches } from 'class-validator';
import { PIN_VALIDO } from '../../../common/utils/pin.util';

// PIN de marcaje (fase 6, DB-4).
export class PinDto {
  @Matches(PIN_VALIDO, { message: 'El PIN debe tener entre 4 y 6 números.' })
  pin: string;
}
