# Plan: pruebas de punta a punta (e2e) de los recorridos principales

Pedido del usuario (2026-10-02): pruebas automáticas que usen la aplicación como una persona (navegador real, API real y base de datos real) para los recorridos de todos los días, que corran solas en cada cambio y en el CI.

---

## 1. Qué hay hoy y qué falta

- **Hay:** pruebas con Vitest de la lógica (API 87 y web 15) que corren sin base de datos, y un CI (`.github/workflows/ci.yml`) con tipos, lint y esas pruebas.
- **Falta:** nada prueba las pantallas. En la fase 2 del menú apareció que la paleta de comandos se caía siempre al abrirse (también con Ctrl+K) y nadie lo había notado. Una prueba que abre cada pantalla y falla ante un error de la página lo habría detectado.
- **Playwright** no está declarado en ningún `package.json`. Solo aparece en `node_modules` como dependencia opcional de Next, así que hay que agregarlo.

Dos límites de la API que condicionan el diseño:
- **Pedidos:** como máximo 100 por minuto (`app.module.ts`). Cada pantalla hace varios pedidos (sesión, permisos, gimnasio, listas), así que una tanda de pruebas lo supera y fallaría al azar.
- **Inicio de sesión:** como máximo 5 intentos por minuto (`auth.controller.ts`). Por eso se inicia sesión una sola vez por rol y se reutiliza la sesión.

---

## 2. Cómo funciona

- **Base de datos propia:** `gym_e2e`, en el mismo contenedor de Postgres. Antes de cada tanda se reinicia y se siembra con el seed de siempre. **Nunca toca la base de desarrollo** (`gym_saas_db`), donde están tus datos.
- **Redis:** la misma instancia, pero otra base (`/1`), para no mezclar sesiones ni permisos en caché.
- **API y web propias,** en otros puertos (API **3101**, web **3100**). Las levanta Playwright solo, así que pueden convivir con tus servidores de desarrollo (3001 y 3000). La web va compilada (`next build` + `next start`).
- **Inicio de sesión una vez por rol** (dueño, recepción e instructor) al empezar. La sesión se guarda y cada prueba arranca ya adentro.
- **Falla ante cualquier error de la página:** además de lo que cada prueba revisa, todas fallan si hay un error de JavaScript en la página, si la API responde con un error 500 o si aparece el panel de errores de Next.
- **Datos únicos:** lo que crean las pruebas lleva una marca ("Cliente E2E 1712…"), para no chocar entre sí ni con el seed.
- **Si algo falla,** queda un video, capturas y la traza paso a paso (Playwright trace) para ver qué pasó.

---

## 3. Qué se prueba

| # | Recorrido | Rol | Qué comprueba |
|---|---|---|---|
| 1 | Iniciar y cerrar sesión | Dueño | Entra, ve Inicio, sale. Con la clave mal, ve el aviso y no entra. |
| 2 | Todas las pantallas del menú | Dueño, recepción e instructor | Cada pantalla abre sin errores y su título coincide con el menú; cada rol ve solo lo suyo. |
| 3 | Buscar | Dueño | La paleta (Ctrl+K y "Buscar…") abre, encuentra por nombres viejos ("transacciones") y navega. |
| 4 | Cliente nuevo → membresía → ingreso | Recepción | Registra un cliente, le vende una membresía en efectivo (queda Activa) y registra su ingreso (aparece adentro). |
| 5 | Caja | Recepción | Abre la caja, cobra una venta y cierra el día con lo contado. |
| 6 | Gasto | Dueño | Registra un gasto y aparece en Gastos y en Movimientos. |
| 7 | Reportería | Dueño y recepción | Abre una plantilla con datos, la exporta a CSV y Excel (se revisa el archivo). Recepción la ve pero no puede armar reportes. |
| 8 | Celular | Recepción | En 390 px se ve la barra inferior, "Menú" abre el menú completo y nada queda tapado. |
| 9 | Modo de uso | Dueño | En modo simple el menú se achica y la reportería se llama "Reportes listos". |

Fuera de este plan quedan el portal del cliente, las clases, el modo kiosco y la tablet de marcaje. Se suman después con el mismo esquema.

---

## 4. Decisiones (aprobadas el 2026-10-02: todas las recomendaciones)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| E1 | ¿Dónde viven las pruebas? | Paquete propio `apps/e2e` · Dentro de `apps/web` | **Paquete propio `apps/e2e`:** prueba la API y la web juntas, y Playwright no se mezcla con las dependencias de la web. Corre con `pnpm e2e`, aparte de `pnpm test` (que no necesita base de datos). |
| E2 | ¿Qué base de datos usan? | Una propia (`gym_e2e`) · La de desarrollo · Otro contenedor | **Una propia en el mismo contenedor:** se reinicia en cada tanda sin tocar tus datos y sin levantar nada más. |
| E3 | ¿La web compilada o en modo desarrollo? | Compilada (`next build`) · `next dev` | **Compilada:** las páginas cargan rápido y estable (en desarrollo la primera carga de cada página tarda y a veces se cuelga), y es igual a producción. Cuesta 1 o 2 minutos de compilación por tanda. |
| E4 | Límite de 100 pedidos por minuto | Configurable por variable · Apagarlo en pruebas | **Variable `THROTTLE_LIMIT`** (por defecto 100, como hoy) que solo las pruebas suben. **Es un cambio chico en la API**; en producción queda igual. |
| E5 | Instructor de prueba | Agregarlo al seed · Crearlo en cada tanda | **Agregarlo al seed** (un instructor de Gym Titan, con clave en `seed.ts`, como las demás cuentas). Sirve también para mostrar el sistema. Cambia los datos de ejemplo, no las tablas. |
| E6 | ¿Qué navegadores? | Solo Chromium · Chromium, Firefox y Safari (WebKit) | **Solo Chromium** por ahora: es lo que usan los gimnasios. Se suman los otros si hace falta. |
| E7 | ¿Cuándo corren en el CI? | En cada cambio a main y en cada PR · Solo antes de unir | **En cada cambio a main y en cada PR,** en un trabajo aparte del CI de hoy, que sigue rápido (alrededor de 1 minuto). El nuevo tarda entre 6 y 8 minutos. |

---

## 5. Fases (un commit por fase)

Rama sugerida: `pruebas-e2e`.

### Fase 1: la base (HECHA)
- Paquete `apps/e2e` con Playwright (`playwright.config.ts`), el script `pnpm e2e` y la preparación de la tanda: reiniciar y sembrar `gym_e2e`, levantar la API y la web en 3101 y 3100, e iniciar sesión por rol.
- Las comprobaciones que valen para todas las pruebas (errores de la página, errores 500, el panel de errores de Next).
- **CAMBIO EN LA API (E4):** `THROTTLE_LIMIT` en `app.module.ts`.
- **Seed (E5):** un instructor de Gym Titan.
- Primera prueba: el recorrido 1.
- **Listo cuando:** `pnpm e2e` corre en tu computadora de punta a punta, deja tu base de desarrollo intacta y da verde.
- Hecho así:
  - `apps/e2e`: `entorno.ts` (base `gym_e2e`, Redis `/1`, puertos 3101 y 3100; se niega a correr contra una base que no sea local), `scripts/preparar.ts` (reinicia y siembra la base con `--skip-generate`; compila la API en `apps/api/dist-e2e` y la web en `apps/web/.next-e2e`), `playwright.config.ts`, `pruebas/base.ts` (cuentas, sesiones y la vigilancia de errores) y `pruebas/sesiones.setup.ts`.
  - `pnpm e2e` hace todo; `pnpm --filter e2e e2e:sin-compilar` reutiliza lo ya compilado (unos 15 s en vez de 1 minuto y medio).
  - En la web, `NEXT_DIST_DIR` cambia la carpeta de compilación y apaga el `output: 'standalone'` (las pruebas usan `next start`; en Windows, además, standalone no puede crear sus enlaces sin permisos de administrador). `apps/web/tsconfig.json` ya lleva `.next-e2e/types`, para que Next no lo reescriba en cada tanda.
  - Seed: Carlos Instructor (`carlos@gymtitan.com`, rol ENTRENADOR, con perfil de equipo).
  - Comprobado: la base de desarrollo queda intacta, dos corridas seguidas dan verde y una prueba con un error a propósito falla con "Error en la página".

### Fase 2: pantallas, menú y búsqueda (HECHA)
- Recorridos 2, 3, 8 y 9.
- **Listo cuando:** todas las pantallas del menú de cada rol abren sin errores. Si alguna falla, se corrige la pantalla, no la prueba.
- Hecho así: `menu.spec.ts` (dueño 22 pantallas, recepción 19, instructor 6, y el dueño en experto), `busqueda.spec.ts`, `celular.spec.ts` y `modo.spec.ts`; ayudas compartidas en `ayudas.ts`. La preparación enciende todos los módulos y marca la guía de inicio como hecha (con el pedido de Configuración).
- Encontrado y corregido en la web: mientras cargaban los permisos y la configuración, el menú mostraba por un instante pantallas que no le tocaban (por ejemplo, Accesos avanzados). Ahora espera esos datos, muestra barras de carga y queda con `aria-busy` hasta tenerlos.

### Fase 3: el día a día de recepción (HECHA)
- Recorridos 4 y 5.
- Donde un formulario no tenga etiquetas que se puedan nombrar (por ejemplo, un campo sin `<label>`), se le agregan. También mejora la accesibilidad.
- **Listo cuando:** el recorrido completo pasa varias veces seguidas sin fallar al azar.
- Hecho así: `recepcion.spec.ts`, en serie: abre la caja con Bs. 100, registra un cliente, le vende el plan mensual en efectivo (queda Activa), registra su ingreso (aparece adentro) y cierra la caja contando Bs. 400 sin descuadre. Pasó tres veces seguidas.
- Encontrado y corregido:
  - **Caja (API, decidido con el usuario el 2026-10-02):** al abrir un turno, el monto inicial se guardaba pero no contaba (se esperaba el saldo que la caja traía de antes), y al cerrar con el arqueo quedaba como saldo lo esperado en vez de lo contado, así que un faltante pasaba al turno siguiente. Ahora es igual que "Cerrar el día": al abrir, el saldo es el monto contado (si no coincide con el que había, queda en la auditoría como "abrir_caja_con_diferencia"); al cerrar, el saldo es lo contado menos lo retirado (no se puede retirar más de lo contado). El seed deja la caja con los Bs. 400 de su turno de ejemplo.
  - **Venta de membresía:** mientras la búsqueda de clientes cargaba, decía "No está registrado: agregar a …" de clientes que sí existen (se podía duplicar uno). Ahora lo dice solo con la búsqueda terminada.
  - **Asistencias:** al confirmar un ingreso, la lista de resultados volvía a aparecer un instante con el cliente anterior.
  - **Arqueo:** los campos de billetes y monedas, el dinero a retirar y las observaciones no tenían su etiqueta asociada (lectores de pantalla y pruebas no los podían nombrar).

### Fase 4: dueño y reportería
- Recorridos 6 y 7, con la revisión del CSV y del Excel descargados.
- **Listo cuando:** pasan, y el archivo exportado tiene los mismos totales que la pantalla.

### Fase 5: CI y documentación
- Un trabajo `e2e` en `ci.yml` con Postgres y Redis, que instala Chromium, migra, siembra, compila y corre las pruebas. Si falla, sube el reporte, los videos y las trazas.
- `docs/pruebas-e2e.md`: cómo correrlas en local, cómo ver el reporte de un fallo y cómo agregar una prueba.
- **Listo cuando:** el CI pasa en GitHub, y una prueba rota a propósito lo pone en rojo y deja el reporte para descargar.

---

## 6. A tener en cuenta en tu computadora

- Correr la tanda en local usa alrededor de 1,5 GB de memoria: la API, la web compilada y Chromium. Con poca memoria libre conviene apagar tus servidores de desarrollo mientras tanto.
- El contenedor `gym_saas_db` tiene que estar prendido. La base `gym_e2e` la crea la preparación de la tanda si no existe.

## 7. Para más adelante

- Pruebas del portal del cliente, de clases y reservas, del modo kiosco y de la tablet de marcaje.
- Comparación de capturas para detectar cambios visuales (regresión visual).
- Firefox y Safari (WebKit).
