// Cabeceras de seguridad de las páginas de la web (docs/plan-seguridad.md,
// fase 3). Las pone Next (next.config.js), así valen en cualquier despliegue;
// la API pone las suyas con helmet y Caddy agrega HSTS.
//
// La política de contenido (CSP) es la base (decisión S6): solo se cargan
// scripts, estilos, imágenes y fuentes del propio sitio, y la página no se
// puede meter en un iframe de otro sitio. Next y el tema claro/oscuro
// escriben scripts en la página, por eso 'unsafe-inline' (la versión estricta,
// con nonce, queda para más adelante).

/**
 * @param {{ desarrollo: boolean, apiUrl?: string }} opciones
 * @returns {{ key: string, value: string }[]}
 */
function cabecerasDeSeguridad({ desarrollo, apiUrl }) {
  // La API: en producción va por el mismo dominio (/api); en desarrollo y en
  // las pruebas, en otro puerto. Sin la variable, la misma que usa
  // src/lib/api-client.ts.
  const url = apiUrl || 'http://localhost:3001';
  const api = /^https?:\/\//.test(url) ? new URL(url).origin : null;
  const csp = {
    'default-src': ["'self'"],
    // En desarrollo, Next recarga el código con eval.
    'script-src': ["'self'", "'unsafe-inline'", ...(desarrollo ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    // En desarrollo, además, el websocket de la recarga.
    'connect-src': ["'self'", ...(api ? [api] : []), ...(desarrollo ? ['ws:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return [
    { key: 'Content-Security-Policy', value: Object.entries(csp).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ') },
    // Para navegadores viejos que no entienden frame-ancestors.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // La app no usa cámara, micrófono, ubicación ni pagos del navegador.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  ];
}

module.exports = { cabecerasDeSeguridad };
