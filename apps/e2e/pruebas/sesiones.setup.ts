import { test as setup, expect } from '@playwright/test';
import { URL_API } from '../entorno';
import { CUENTAS, Rol, sesion } from './base';

// Una sesión por rol, iniciada por la API (sin pasar por la pantalla de
// inicio de sesión): la API permite 5 inicios por minuto y las pruebas que
// la necesitan ya arrancan adentro.
for (const rol of Object.keys(CUENTAS) as Rol[]) {
  setup(`sesión de ${rol}`, async ({ request }) => {
    const { correo, contrasena } = CUENTAS[rol];
    const r = await request.post(`${URL_API}/auth/login`, { data: { correo, contrasena } });
    expect(r.ok(), `No pudo iniciar sesión ${correo}: ${r.status()} ${await r.text()}`).toBeTruthy();
    await request.storageState({ path: sesion(rol) });
  });
}
