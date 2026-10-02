import { URL_API } from '../entorno';
import { configurarGimnasio } from './ayudas';
import { expect, sesion, test } from './base';

// El Inicio (docs/plan-inicio.md): indicadores con comparación y tarjetas, según
// el rol, y "Personalizar el Inicio".

test.describe('dueño', () => {
  test.use({ storageState: sesion('dueno') });

  test('abre con los ingresos del mes en grande y las cuatro tarjetas', async ({ page }) => {
    await page.goto('/dashboard');
    const mes = page.getByRole('region', { name: 'Ingresos del mes' });
    await expect(mes).toBeVisible();
    await expect(mes).toContainText(/Bs\. [\d.]+,\d{2}/);
    await expect(mes).toContainText('El mes pasado cerró en');
    for (const nombre of ['Ingresos de hoy', 'Asistencias de hoy', 'Clientes activos', 'Vencen en 7 días']) {
      await expect(page.getByRole('region', { name: nombre })).toBeVisible();
    }
    // Lo primero del Inicio, antes que los primeros pasos y los vencimientos.
    const orden = await page.locator('main').evaluate((m) => {
      const pos = (t: string) => [...m.querySelectorAll('*')].findIndex((e) => e.getAttribute?.('aria-label') === t || e.textContent?.trim() === t);
      return pos('Ingresos del mes') < pos('Membresías por vencer esta semana');
    });
    expect(orden).toBe(true);
  });

  test('abrir el Inicio no cuenta como abrir sus reportes', async ({ page }) => {
    const veces = async () => {
      const r = await page.request.get(`${URL_API}/reporteria/reportes?vista=plantillas`);
      const lista: { clavePlantilla: string; vecesEjecutado: number }[] = (await r.json()).data;
      return lista.find((p) => p.clavePlantilla === 'horas-pico')!.vecesEjecutado;
    };
    const antes = await veces();
    await page.goto('/dashboard');
    await expect(page.locator('[data-tarjeta="plantilla:horas-pico"]')).toContainText('¿A qué hora viene la gente?');
    await page.waitForLoadState('networkidle');
    expect(await veces()).toBe(antes);
  });

  test('muestra las tarjetas del diseño sugerido, con sus gráficos', async ({ page }) => {
    await page.goto('/dashboard');
    const tarjeta = (id: string) => page.locator(`[data-tarjeta="${id}"]`);
    await expect(tarjeta('plantilla:ingresos-anio-vs-pasado')).toContainText('Ingresos por mes: este año y los anteriores');
    // El seed no trae asistencias recientes: el mapa de calor o su aviso de vacío.
    const horas = tarjeta('plantilla:horas-pico');
    await expect(horas.getByRole('table', { name: /Mapa de calor/ }).or(horas.getByText('No hay datos en este período.'))).toBeVisible();
    await expect(tarjeta('estado-clientes')).toContainText('Al día');
    await expect(tarjeta('por-vencer')).toContainText('Membresías por vencer esta semana');
    // El período de una tarjeta se cambia ahí mismo.
    await tarjeta('plantilla:horas-pico').getByLabel(/Período de/).selectOption('ultimos_7');
    await expect(tarjeta('plantilla:horas-pico').getByLabel(/Período de/)).toHaveValue('ultimos_7');
  });
});

test.describe('lo que hay que saber hoy', () => {
  test.use({ storageState: sesion('dueno') });

  test('hasta 4 frases con su botón, y las del dinero solo para quien administra', async ({ page, browser }) => {
    const dueno = await page.request.get(`${URL_API}/dashboard/para-saber`);
    expect(dueno.ok()).toBeTruthy();
    const frases: { clave: string; texto: string; accion?: { href: string } }[] = (await dueno.json()).data.frases;
    expect(frases.length).toBeLessThanOrEqual(4);
    await page.goto('/dashboard');
    if (frases.length > 0) {
      const seccion = page.getByRole('region', { name: 'Lo que hay que saber hoy' });
      for (const f of frases) await expect(seccion).toContainText(f.texto);
    }
    // El instructor no recibe las del dinero ni botones a la reportería.
    const contexto = await browser.newContext({ storageState: sesion('instructor') });
    const instructor = await contexto.request.get(`${URL_API}/dashboard/para-saber`);
    const suyas: { clave: string; accion?: { href: string } }[] = (await instructor.json()).data.frases;
    expect(suyas.map((f) => f.clave)).not.toContain('caja');
    expect(suyas.map((f) => f.clave)).not.toContain('ritmo-mes');
    for (const f of suyas) expect(f.accion?.href ?? '').not.toContain('/reporteria/');
    await contexto.close();
  });
});

test.describe('datos de ejemplo', () => {
  test.use({ storageState: sesion('dueno') });

  test('un gimnasio sin datos ve su Inicio con ejemplos marcados, y los puede ocultar', async ({ page }) => {
    // El gimnasio del seed tiene datos: se simula uno nuevo cambiando solo esa marca.
    await page.route(`${URL_API}/dashboard/kpis`, async (route) => {
      const respuesta = await route.fetch();
      const cuerpo = await respuesta.json();
      cuerpo.data.conDatos = false;
      await route.fulfill({ response: respuesta, json: cuerpo });
    });
    await page.goto('/dashboard');
    await expect(page.getByText('Así se va a ver tu Inicio')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toContainText('Ejemplo');
    // El seed no tiene asistencias recientes: el mapa de calor sale de ejemplo.
    const horas = page.locator('[data-tarjeta="plantilla:horas-pico"]');
    await expect(horas.getByRole('table', { name: /Mapa de calor/ })).toBeVisible();
    await expect(horas).toContainText('Ejemplo');

    await page.getByRole('button', { name: 'Ocultar los ejemplos' }).click();
    await expect(page.getByRole('button', { name: 'Ver con datos de ejemplo' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).not.toContainText('Ejemplo');
    await expect(horas).toContainText('No hay datos en este período.');
    // Se recuerda al volver.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Ver con datos de ejemplo' })).toBeVisible();
    await page.getByRole('button', { name: 'Ver con datos de ejemplo' }).click();
    await expect(page.getByText('Así se va a ver tu Inicio')).toBeVisible();
  });

  test('con datos no hay ejemplos', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toBeVisible();
    await expect(page.getByText('Así se va a ver tu Inicio')).toHaveCount(0);
    await expect(page.getByText('Ejemplo', { exact: true })).toHaveCount(0);
  });
});

test.describe('personalizar', () => {
  test.use({ storageState: sesion('dueno') });
  // Deja el Inicio como al principio para las demás pruebas.
  test.afterAll(async ({ playwright }) => configurarGimnasio(playwright, { tablero: { tarjetas: null } }));

  test('el dueño quita, agrega y ordena tarjetas, y recepción ve su Inicio sin poder cambiarlo', async ({ page, browser }) => {
    await page.goto('/dashboard');
    const tarjeta = (id: string) => page.locator(`[data-tarjeta="${id}"]`);
    await expect(tarjeta('estado-clientes')).toBeVisible();
    await page.getByRole('button', { name: 'Personalizar el Inicio' }).click();
    await expect(page.getByText('Personalizando el Inicio')).toBeVisible();

    // Quitar una, mover otra al principio (con las flechas) y agregar desde la galería.
    await page.getByRole('button', { name: 'Quitar: Estado de los clientes' }).click();
    await page.getByRole('button', { name: 'Mover antes: ¿A qué hora viene la gente?' }).click();
    await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
    const galeria = page.getByRole('dialog', { name: 'Agregar una tarjeta' });
    await galeria.getByPlaceholder(/Buscar/).fill('nuevos');
    await galeria.getByRole('option', { name: /Clientes nuevos por mes/ }).click();
    await expect(galeria.getByRole('heading', { name: 'Clientes nuevos por mes' })).toBeVisible();
    await galeria.getByRole('button', { name: 'Agregar al Inicio' }).click();
    await expect(galeria).toBeHidden();
    await page.getByLabel('Tamaño de Clientes nuevos por mes').selectOption('ancha');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Personalizando el Inicio')).toBeHidden();

    // Queda guardado (después de recargar), en ese orden.
    await page.reload();
    await expect(tarjeta('plantilla:clientes-nuevos-por-mes')).toBeVisible();
    await expect(tarjeta('estado-clientes')).toHaveCount(0);
    const orden = await page.locator('[data-tarjeta]').evaluateAll((s) => s.map((x) => x.getAttribute('data-tarjeta')));
    expect(orden[0]).toBe('plantilla:horas-pico');
    expect(orden.at(-1)).toBe('plantilla:clientes-nuevos-por-mes');

    // Recepción ve el mismo diseño, pero no lo puede cambiar.
    const contexto = await browser.newContext({ storageState: sesion('recepcion') });
    const recepcion = await contexto.newPage();
    await recepcion.goto('/dashboard');
    await expect(recepcion.locator('[data-tarjeta="plantilla:clientes-nuevos-por-mes"]')).toBeVisible();
    await expect(recepcion.getByRole('button', { name: 'Personalizar el Inicio' })).toHaveCount(0);
    await contexto.close();

    // "Volver al diseño sugerido" lo deja como al principio.
    await page.getByRole('button', { name: 'Personalizar el Inicio' }).click();
    await page.getByRole('button', { name: 'Volver al diseño sugerido' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(tarjeta('estado-clientes')).toBeVisible();
    await expect(tarjeta('plantilla:clientes-nuevos-por-mes')).toHaveCount(0);
  });
});

test.describe('en el celular', () => {
  test.use({ storageState: sesion('dueno'), viewport: { width: 390, height: 844 } });

  test('nada se sale a lo ancho y las tarjetas van una debajo de otra', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-tarjeta="estado-clientes"]')).toBeVisible();
    // Lo que se sale de la pantalla, sin contar lo que está dentro de algo que se desliza (el mapa de calor).
    const salidos = await page.locator('main').evaluate((main) => {
      const ancho = window.innerWidth;
      const deslizable = (el: Element) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      return [...main.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > ancho + 1 && !deslizable(el)).length;
    });
    expect(salidos).toBe(0);
    const anchos = await page.locator('[data-tarjeta]').evaluateAll((s) => s.map((x) => Math.round(x.getBoundingClientRect().width)));
    expect(new Set(anchos).size).toBe(1);
    // La leyenda del estado de los clientes, en una columna (en dos no entraba).
    const leyenda = page.locator('[data-tarjeta="estado-clientes"] ul > li');
    const izquierdas = await leyenda.evaluateAll((li) => li.map((x) => Math.round(x.getBoundingClientRect().left)));
    expect(new Set(izquierdas).size).toBe(1);
  });
});

test.describe('modo simple', () => {
  test.use({ storageState: sesion('dueno') });

  test('las acciones arriba, la guía de 3 pasos sobre el tablero, y personalizar sin tamaños', async ({ page, playwright }) => {
    await configurarGimnasio(playwright, { modoUso: 'simple' });
    try {
      await page.goto('/dashboard');
      // La guía resalta, en orden, los indicadores, las acciones y los vencimientos.
      const guia = page.getByRole('dialog', { name: /Guía de la pantalla/ });
      for (const [titulo, marca] of [
        ['Lo que pasa hoy', 'resumen'],
        ['Lo que más haces, a un toque', 'acciones'],
        ['Quién está por vencer', 'por-vencer'],
      ]) {
        await expect(guia).toContainText(titulo);
        await expect(page.locator(`[data-recorrido="${marca}"]`)).toHaveClass(/ring-indigo-500/);
        await guia.getByRole('button', { name: /Siguiente|Entendido/ }).click();
      }
      await expect(guia).toBeHidden();

      // Las acciones rápidas, antes que los indicadores.
      const orden = await page.locator('[data-recorrido]').evaluateAll((e) => e.map((x) => x.getAttribute('data-recorrido')));
      expect(orden.slice(0, 2)).toEqual(['acciones', 'resumen']);
      await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toBeVisible();
      await expect(page.locator('[data-tarjeta="por-vencer"]')).toBeVisible();

      await page.getByRole('button', { name: 'Personalizar el Inicio' }).click();
      await expect(page.getByLabel(/^Tamaño de /)).toHaveCount(0);
      await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
      const galeria = page.getByRole('dialog', { name: 'Agregar una tarjeta' });
      await expect(galeria.getByRole('option').first()).toBeVisible();
      await expect(galeria.getByText('Tus reportes')).toHaveCount(0);
      await expect(galeria.getByText('Tamaño')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Cancelar' }).click();
    } finally {
      await configurarGimnasio(playwright, { modoUso: 'intermedio' });
    }
  });
});

test.describe('instructor', () => {
  test.use({ storageState: sesion('instructor') });

  test('no ve los ingresos, ni en la pantalla ni en lo que manda la API', async ({ page }) => {
    // Ningún pedido rechazado al abrir el Inicio (antes, el selector de sucursal pedía /sucursales y recibía 403).
    const rechazados: string[] = [];
    page.on('response', (r) => r.status() >= 400 && rechazados.push(`${r.status()} ${r.url()}`));
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'Asistencias de hoy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Clientes activos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingresos del mes' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Ingresos de hoy' })).toHaveCount(0);
    // Sin reportes ni membresías: solo el estado de los clientes.
    await expect(page.locator('[data-tarjeta="estado-clientes"]')).toBeVisible();
    await expect(page.locator('[data-tarjeta^="plantilla:"]')).toHaveCount(0);
    await expect(page.locator('[data-tarjeta="por-vencer"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Personalizar el Inicio' })).toHaveCount(0);

    const respuesta = await page.request.get(`${URL_API}/dashboard/kpis`);
    expect(respuesta.ok()).toBeTruthy();
    expect((await respuesta.json()).data.ingresos).toBeNull();
    await page.waitForLoadState('networkidle');
    expect(rechazados).toEqual([]);
    // La lista básica de sucursales sí la puede pedir (la del encabezado).
    const basicas = await page.request.get(`${URL_API}/sucursales/basicas`);
    expect(basicas.ok()).toBeTruthy();
    expect((await basicas.json()).data[0]).toEqual(expect.objectContaining({ id: expect.any(String), nombre: expect.any(String) }));
  });
});
