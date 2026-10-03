import { describe, expect, it } from 'vitest';
import { cabecerasDeSeguridad } from '../../cabeceras';

const csp = (opciones: { desarrollo: boolean; apiUrl?: string }) => {
  const valor = cabecerasDeSeguridad(opciones).find((c) => c.key === 'Content-Security-Policy')!.value;
  return Object.fromEntries(valor.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
};

describe('cabeceras de seguridad de la web', () => {
  it('en producción: solo lo propio, sin eval y sin poder meterla en un iframe', () => {
    const p = csp({ desarrollo: false, apiUrl: '/api' });
    expect(p['default-src']).toEqual(["'self'"]);
    expect(p['script-src']).not.toContain("'unsafe-eval'");
    // La API va por el mismo dominio (/api): alcanza con 'self'.
    expect(p['connect-src']).toEqual(["'self'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['object-src']).toEqual(["'none'"]);
  });

  it('en desarrollo y en las pruebas: la API en otro puerto, eval y el websocket de la recarga', () => {
    const p = csp({ desarrollo: true, apiUrl: 'http://localhost:3001/' });
    expect(p['connect-src']).toEqual(["'self'", 'http://localhost:3001', 'ws:']);
    expect(p['script-src']).toContain("'unsafe-eval'");
    expect(csp({ desarrollo: false, apiUrl: 'http://localhost:3101' })['connect-src']).toEqual(["'self'", 'http://localhost:3101']);
    // Sin la variable, la API por defecto de src/lib/api-client.ts.
    expect(csp({ desarrollo: true })['connect-src']).toEqual(["'self'", 'http://localhost:3001', 'ws:']);
  });

  it('las demás cabeceras', () => {
    const todas = Object.fromEntries(cabecerasDeSeguridad({ desarrollo: false }).map((c) => [c.key, c.value]));
    expect(todas['X-Frame-Options']).toBe('DENY');
    expect(todas['X-Content-Type-Options']).toBe('nosniff');
    expect(todas['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(todas['Permissions-Policy']).toContain('camera=()');
  });
});
