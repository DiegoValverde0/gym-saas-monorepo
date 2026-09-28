// Enlaces de WhatsApp (wa.me) para avisar a un cliente desde el navegador.

// Código de país cuando el teléfono se guardó sin él. Solo se deduce de la
// moneda de la organización (hoy los gimnasios son de Bolivia).
const CODIGO_PAIS_POR_MONEDA: Record<string, string> = { BOB: '591' };

export function enlaceWhatsapp(telefono: string, mensaje: string, moneda?: string | null) {
  let numero = telefono.replace(/\D/g, '');
  if (!telefono.trim().startsWith('+') && numero.length <= 8 && moneda && CODIGO_PAIS_POR_MONEDA[moneda]) {
    numero = `${CODIGO_PAIS_POR_MONEDA[moneda]}${numero}`;
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
