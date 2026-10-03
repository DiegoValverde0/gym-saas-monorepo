# Pruebas de punta a punta (e2e)

Pruebas que usan la aplicación como una persona: un navegador real (Chromium), la API y la web compiladas, y una base de datos real. Están en `apps/e2e`, con Playwright. El plan y sus decisiones están en [plan-pruebas-e2e.md](plan-pruebas-e2e.md).

## Correrlas en tu computadora

Con el contenedor de Postgres prendido (`gym_saas_db`) y Redis:

```bash
pnpm e2e
```

Hace todo solo:
1. Reinicia y siembra **su propia base** (`gym_e2e`, en el mismo contenedor). Tu base de desarrollo no se toca, y la tanda se niega a correr si `DATABASE_URL` no apunta a esta máquina.
2. Compila una copia de la API (`apps/api/dist-e2e`) y de la web (`apps/web/.next-e2e`), aparte de las de desarrollo.
3. Las levanta en los puertos **3101** (API) y **3100** (web). Pueden convivir con tus servidores de desarrollo (3001 y 3000).
4. Inicia sesión una vez con cada cuenta del seed (dueño, recepción e instructor), enciende todos los módulos del gimnasio y corre las pruebas.

La primera vez tarda alrededor de 1 minuto y medio. Para repetir sin recompilar (si no cambiaste la API ni la web):

```bash
pnpm --filter e2e e2e:sin-compilar
```

Usa alrededor de 1,5 GB de memoria. Con poca memoria libre, apaga tus servidores de desarrollo mientras corre.

## Si una prueba falla

- La terminal dice cuál falló y por qué (lo esperado y lo que encontró).
- `pnpm --filter e2e reporte` abre el reporte en el navegador. De cada prueba que falló quedan una captura, un video y la **traza**: el paso a paso con la página, los pedidos a la API y la consola en cada momento.
- En el CI, el reporte queda como artefacto `reporte-e2e` en la corrida de GitHub Actions (14 días).

Todas las pruebas fallan además si la página tiene un error de JavaScript, si la API responde con un error 500 o si Next muestra "Application error", aunque la prueba no lo estuviera buscando (`pruebas/base.ts`).

## Qué se prueba

| Archivo | Qué |
|---|---|
| `sesion.spec.ts` | Iniciar y cerrar sesión, clave equivocada, sesión guardada. |
| `menu.spec.ts` | El menú de dueño, recepción e instructor; cada pantalla abre sin errores y con su título. |
| `inicio.spec.ts` | El Inicio: indicadores, tarjetas del diseño sugerido y su período, "Lo que hay que saber hoy" por rol, datos de ejemplo, personalizar (quitar, mover, agregar, guardar, volver al sugerido), el celular, el modo simple con su guía, y lo que no ve el instructor. |
| `seguridad.spec.ts` | El bloqueo por cuenta tras varias contraseñas equivocadas (429 con `Retry-After`), sin afectar a las demás cuentas. |
| `busqueda.spec.ts` | La paleta (Ctrl+K y "Buscar…"), nombres viejos y acciones rápidas. |
| `celular.spec.ts` | La barra de abajo, el menú en el celular y que nada quede tapado. |
| `modo.spec.ts` | El menú en modo simple. |
| `recepcion.spec.ts` | Un día de recepción: abrir caja, cliente nuevo, venta de membresía, ingreso y cierre de caja sin descuadre. |
| `gasto.spec.ts` | Un gasto desde la acción rápida, en Gastos y en Movimientos. |
| `reporteria.spec.ts` | Una plantilla exportada a CSV y Excel con los mismos totales que la pantalla; lo que puede recepción. |

## Agregar una prueba

1. Un archivo `pruebas/<algo>.spec.ts` que importe `test` y `expect` de `./base` (no de `@playwright/test`), así hereda la vigilancia de errores.
2. Elige con qué cuenta entra: `test.use({ storageState: sesion('dueno' | 'recepcion' | 'instructor') })`. Las cuentas están en `pruebas/base.ts` (son las del seed).
3. Busca los elementos como los ve una persona: `getByRole('button', { name: 'Guardar' })`, `getByLabel('Monto (Bs.)')`, `getByPlaceholder(...)`. Si un campo no tiene nombre (por ejemplo, un `<Label>` sin `htmlFor`), arréglalo en la pantalla: también mejora la accesibilidad.
4. Lo que crees lleva un nombre único: `unico('Cliente')` da algo como "Cliente E2E lk3j9a".
5. Si la prueba cambia la configuración del gimnasio (`configurarGimnasio` en `pruebas/ayudas.ts`), déjala como estaba en un `finally`.
6. Si varias pruebas dependen una de otra (abrir caja → vender → cerrar), ponlas en un mismo archivo con `test.describe.configure({ mode: 'serial' })`.
7. Una prueba que falla al azar se arregla esperando lo correcto (`await expect(...).toBeVisible()`, `toHaveAttribute('aria-busy', 'false')`), nunca con esperas fijas ni reintentos.

## En el CI

El trabajo `e2e` de `.github/workflows/ci.yml` corre en cada cambio a `main` y en cada PR, aparte del trabajo `verificar`. Levanta Postgres y Redis como servicios, instala Chromium (queda en caché entre corridas), revisa los tipos de las pruebas y corre `pnpm e2e`. Tarda unos 3 minutos. Cada prueba que falla queda marcada con su archivo, su línea y el motivo en la corrida (y en el PR), y el reporte completo queda para descargar.
