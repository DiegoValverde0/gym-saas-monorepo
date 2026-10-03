import { test as setup, expect } from '@playwright/test';
import { URL_API } from '../entorno';
import { configurarGimnasio } from './ayudas';
import { CUENTAS, Rol, sesion } from './base';

// Una sesión por rol, iniciada por la API (sin pasar por la pantalla de
// inicio de sesión): es más rápido y las pruebas que la necesitan ya arrancan
// adentro. (En producción, además, la API permite 5 inicios por minuto.)
for (const rol of Object.keys(CUENTAS) as Rol[]) {
  setup(`sesión de ${rol}`, async ({ request }) => {
    const { correo, contrasena } = CUENTAS[rol];
    const r = await request.post(`${URL_API}/auth/login`, { data: { correo, contrasena } });
    expect(r.ok(), `No pudo iniciar sesión ${correo}: ${r.status()} ${await r.text()}`).toBeTruthy();
    await request.storageState({ path: sesion(rol) });
  });
}

// El gimnasio del seed nace sin configuración: módulos por defecto (sin
// clases, equipo ni gastos) y la guía de inicio sin hacer. Para probar todas
// las pantallas se encienden todos los módulos, en modo intermedio, con la
// guía hecha (si no, se abre sola en el Inicio y tapa la pantalla).
setup('configurar el gimnasio', async ({ playwright }) => {
  await configurarGimnasio(playwright, {
    modoUso: 'intermedio',
    modulos: { puntoVenta: true, clasesGrupales: true, controlPersonal: true, reportesAvanzados: true, controlGastos: true, controlAcceso: true },
    onboarding: { completado: true },
  });
});
