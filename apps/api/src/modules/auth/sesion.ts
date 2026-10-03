import { enteroDeEntorno } from '../../common/utils/entorno.util';

// Cuánto dura una sesión (docs/plan-seguridad.md, fase 3): el token y la
// cookie que lo lleva, siempre lo mismo. Antes la cookie duraba 7 días y el
// token 1: después del primer día la cookie seguía viajando con un token
// vencido. Se cambia con SESION_HORAS.
export const HORAS_SESION = enteroDeEntorno(process.env, 'SESION_HORAS', 24);
export const DURACION_SESION_MS = HORAS_SESION * 60 * 60 * 1000;
