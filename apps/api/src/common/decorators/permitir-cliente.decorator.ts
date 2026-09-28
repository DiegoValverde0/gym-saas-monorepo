import { SetMetadata } from '@nestjs/common';

export const PERMITIR_CLIENTE_KEY = 'permitirCliente';

// Ruta que también pueden usar las cuentas del portal del cliente. Sin este
// decorador, JwtAuthGuard las rechaza (ver el comentario allí).
export const PermitirCliente = () => SetMetadata(PERMITIR_CLIENTE_KEY, true);
