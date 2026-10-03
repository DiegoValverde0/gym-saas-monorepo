# Plan: actualizaciones mayores (Node, ESLint, Prisma y Next)

Pedido del usuario (2026-10-03): resolver las propuestas de Dependabot que cambian de versión mayor, bien planificadas, con las decisiones y la mejor opción en cada una.

Sale de revisar las cuatro propuestas abiertas, sus resultados en el CI, el código y las guías oficiales de cada actualización (2026-10-03).

---

## 1. Dónde estamos

| Pieza | Versión hoy | Versión nueva | Estado de la propuesta de Dependabot |
|---|---|---|---|
| Node (Docker y CI) | 24 (soporte de largo plazo hasta abril de 2028) | 26 (pasa a largo plazo el **28 de octubre de 2026**) | #1. El CI pasa, pero no construye la imagen Docker: no prueba nada de este cambio. |
| ESLint | 8.57 (**sin soporte desde octubre de 2024**) | 10.11 | #3. Falla `verificar`: ESLint 10 no lee la configuración vieja (`.eslintrc.js`). |
| Prisma | 5.22 (noviembre de 2024; ya no recibe arreglos) | 7.10 (estable). La 8 está en versión candidata desde septiembre, con muchos cambios más. | #5. Fallan `verificar` y `e2e`: Dependabot subió solo `@prisma/client` y no `prisma` (la herramienta que lo genera); tienen que ir juntos. |
| Next | 15.5 | 16.3 | #4. **Pasa todo el CI**, porque lo que se rompe (`middleware`, `next lint`) en la 16 todavía avisa en vez de fallar. |

Las propuestas de Dependabot cambian solo el número de versión: no hacen los cambios de código que cada una pide. Por eso se hacen aquí, por fases, y las propuestas se cierran (decisión A7).

---

## 2. Qué cambia cada una (lo que nos toca)

### Node 26
- Solo cambian la imagen Docker (`node:24-alpine`), el CI (`node-version: 24`) y `engines` del `package.json`.
- Lo que hay que mirar: que compilen y arranquen las dos imágenes (API y web), que las pruebas pasen con Node 26 y que no haya avisos de cosas quitadas en Node 26.

### ESLint 10
- **La configuración pasa al formato nuevo ("flat config")**: `.eslintrc.js` → `eslint.config.mjs`. Los cuatro complementos que usamos (`@typescript-eslint` 8, `react-hooks` 7, `eslint-config-turbo` 2) ya aceptan ESLint 10.
- **La regla de seguridad del cliente "crudo" de Prisma** (prohíbe `this.prisma.<modelo>` fuera de una lista de archivos, porque se salta el aislamiento entre gimnasios) tiene que pasar idéntica, con su lista de excepciones y sus comentarios. **Se agrega una prueba** que demuestra que sigue detectando el caso (hoy no hay ninguna).
- Ojo: en el formato nuevo, `excludedFiles` pasa a ser `ignores` dentro del mismo bloque, y los archivos ignorados globales van aparte.
- Necesita Node 20.19 o más (hoy `engines` dice `>=20`).

### Prisma 5 → 7
Lo que cambia de verdad (guía oficial de Prisma 7):

| Cambio | Qué hay que hacer aquí |
|---|---|
| **La conexión pasa por un adaptador**: el motor de Prisma ya no trae su propio conector (sin Rust). | Agregar `@prisma/adapter-pg` y crear el cliente con `new PrismaClient({ adapter })` en `PrismaService` y en el seed. **El tamaño y los tiempos del grupo de conexiones cambian**: hay que fijarlos y medir. |
| **`prisma.config.ts`** con la dirección de la base, las migraciones y el seed (ya no en `schema.prisma` ni en `package.json`). | Crear `packages/database/prisma.config.ts`. |
| **El `.env` ya no se lee solo.** | Nuestros comandos ya usan `dotenv -e ../../.env`; el config lo lee igual. |
| **`migrate reset` ya no corre el seed**, y `--skip-generate` ya no existe. | `pnpm db:reset` y la preparación de las e2e (`apps/e2e/scripts/preparar.ts`) **dependen de eso**: hay que agregar el seed explícito y sacar `--skip-generate`. El freno del seed (`solo-pruebas.ts`) sigue igual. |
| El generador viejo `prisma-client-js` queda **en desuso** (sigue funcionando); el nuevo, `prisma-client`, genera TypeScript en una carpeta propia. | Decisión A4. |
| Nada de lo que se quitó lo usamos: `$use` (usamos `$extends`), métricas. | Revisar igual: `$extends` (aislamiento entre gimnasios), `$queryRaw`/`$executeRaw` (5 y 3 archivos), `Prisma.sql`/`Prisma.raw` (13 y 7), `$transaction` (16), `Decimal` (columnas de dinero), `omitApi` y `relationJoins` (opciones en vista previa del esquema). |
| Node 20.19 y TypeScript 5.4 o más. | Hay TypeScript 5.9.3. |

Toca la API entera (77 archivos importan `@prisma/client`) y la forma de conectarse a la base: es la fase más delicada para el negocio.

### Next 16
Lo que nos toca (guía oficial de Next 16):

| Cambio | Qué hay que hacer aquí |
|---|---|
| **`middleware.ts` pasa a llamarse `proxy.ts`** (y la función, `proxy`). Corre en Node, no en el entorno "edge". | Renombrar `apps/web/src/middleware.ts`. De paso desaparecen los avisos de `jose` en la compilación (eran por el entorno edge). |
| **`next lint` ya no existe**, y la opción `eslint` de `next.config.js` tampoco. | El CI ya usa ESLint directo; se quita `eslint: { ignoreDuringBuilds }` de `next.config.js`. Por eso **ESLint va antes que Next**. |
| **Turbopack compila por defecto** (desarrollo y producción). | Decisión A5. Hay que probar el modo `standalone` de la imagen Docker y la política de contenido (CSP). |
| `next dev` compila en `.next/dev` y no deja dos `next dev` a la vez sobre el mismo proyecto. | Revisar el script temporal de pruebas con `NEXT_DIST_DIR`. |
| Se quitó el acceso síncrono a `params` (ya migrado en la fase 6 de seguridad), AMP, `serverRuntimeConfig`. | No los usamos. |
| `next dev` agrega su propio bloque a `AGENTS.md` (como turbo). | Se deja, como el de turbo. |

Hay una herramienta oficial (`@next/codemod upgrade`) que hace los cambios mecánicos; se usa y después se revisa a mano.

---

## 3. Orden

1. **ESLint 10**: sin riesgo para quien usa el sistema (solo herramientas de desarrollo) y **Next 16 la necesita** (ya no trae `next lint`).
2. **Prisma 7** (pasando por la 6): lo más delicado; mejor con la cabeza fresca y con todo el resto quieto.
3. **Next 16**: con lo aprendido en la fase 6 de seguridad.
4. **Node 26**: después del **28 de octubre de 2026**, cuando pase a largo plazo (decisión A1).

Cada fase: su rama, un commit, todas las pruebas, el recorrido que haga falta, y se une a `main` solo cuando lo pidas.

---

## 4. Decisiones (con la mejor opción)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| A1 | ¿Cuándo pasar a Node 26? | Ahora · Después del 28 de octubre, cuando sea de largo plazo · Quedarse en 24 hasta 2027 | **Después del 28 de octubre**, como última fase. Antes de esa fecha Node 26 todavía puede cambiar; Node 24 tiene soporte hasta abril de 2028, así que no hay apuro, pero pasar pronto a la 26 da dos años más de margen. |
| A2 | ¿Prisma 7 ahora o esperar la 8? | 7.10 ahora · Esperar la 8 estable | **7.10 ahora.** Prisma 5 ya no recibe arreglos, la 8 todavía es candidata (sin fecha) y trae más cambios encima de la 7 (renombra `skip`/`take`, cambia las fechas y los nombres de tablas). Los cambios grandes de la 7 (adaptador, `prisma.config.ts`) son la base de la 8: hacerlos ahora deja la 8 más corta. |
| A3 | ¿De 5 a 7 directo o pasando por la 6? | Directo · 5 → 6 → 7 | **Pasando por la 6**, dentro de la misma fase y con las pruebas en cada paso. Los cambios de la 6 son chicos; si algo se rompe, se sabe en qué salto fue. |
| A4 | ¿Qué generador de Prisma? | Seguir con `prisma-client-js` (en desuso, pero funciona y no cambia ningún `import`) · El nuevo `prisma-client` (genera TypeScript en una carpeta: cambian los `import` de 77 archivos y hay que resolver dónde se compila, porque la API no puede importar TypeScript de otro paquete sin mover su carpeta de salida) | **Seguir con `prisma-client-js` en esta fase.** La fase ya cambia la conexión y la configuración; sumarle el generador mezcla dos riesgos. El generador nuevo va con Prisma 8, que igual va a pedir revisar el esquema. |
| A5 | ¿Compilar con Turbopack (lo nuevo) o seguir con Webpack? | Turbopack · Webpack (`--webpack`) | **Turbopack**, que es lo que recomienda Next. Si algo no anda (la imagen Docker, la CSP), `--webpack` queda como plan B documentado, no como punto de partida. |
| A6 | ¿Prender el React Compiler (nuevo en Next 16, opcional)? | Sí · No | **No por ahora.** Es una optimización, no una actualización; hace más lenta la compilación. Se puede probar aparte. |
| A7 | ¿Qué hacer con las cuatro propuestas de Dependabot? | Cerrarlas · Dejarlas abiertas | **Cerrarlas** con un comentario que apunte a este plan: cada fase hace el cambio completo en su rama. Dependabot no las vuelve a abrir para la misma versión. |
| A8 | ¿Cómo sigue Dependabot con las versiones mayores? | Igual · Que no proponga versiones mayores de Node | **Que no proponga versiones mayores de la imagen de Node** (pasan cada medio año y conviene esperar a que sean de largo plazo). Las demás mayores, sí: sirven de aviso, y se planifican como aquí. |

---

## 5. Fases

### Fase 1: ESLint 10
- `eslint.config.mjs` (formato nuevo) con lo mismo que `.eslintrc.js`; se borra el viejo.
- **La regla del cliente crudo de Prisma, idéntica**, con su lista de excepciones; prueba que la hace saltar con un archivo de ejemplo (y que no salta en uno de la lista).
- ESLint 10, `engines.node` a `>=20.19`, el CI y los scripts `lint` de cada paquete.
- Se cierran las propuestas #3 y #1, y Dependabot deja de proponer mayores de Node (A7, A8).
- **Listo cuando:** el lint pasa en todo el repo con las mismas reglas (mismos avisos que antes), la prueba de la regla de Prisma pasa y falla cuando corresponde, y el CI está en verde.

**Hecho (2026-10-03):**
- `eslint.config.mjs` con las mismas reglas. Se comparó regla por regla con ESLint 8 en un archivo normal de la API, uno exceptuado y uno de la web.
- Las únicas diferencias vienen de la lista "recomendada" del propio ESLint 10:
  - Agrega 6 reglas: `no-constant-binary-expression`, `no-empty-static-block`, `no-unassigned-vars`, `no-unused-private-class-members`, `no-useless-assignment` y `preserve-caught-error`.
  - Quita 3 de formato que ya estaban obsoletas: `no-extra-semi`, `no-inner-declarations` y `no-mixed-spaces-and-tabs`.
- Las reglas nuevas encontraron 2 cosas, ya arregladas:
  - Una asignación que no se usaba en `recorrido.tsx`.
  - El error original que se perdía al fallar el cobro en `venta-rapida-modal.tsx`; ahora va como `cause`.
- ESLint 10 avisa de los `eslint-disable` que no hacen nada. Se borraron 13: apagaban reglas que la configuración ya apaga para todo el repo.
- `eslint-plugin-react-hooks` pasa de `apps/web` a la raíz, que es donde lo usa la configuración.
- `engines.node`: `^20.19.0 || ^22.13.0 || >=24`, lo mismo que pide ESLint 10.
- `apps/api/src/prisma/regla-cliente-crudo.spec.ts` (3 pruebas). Se comprobó que falla si se apaga la regla o si se agrega una excepción de más.

### Fase 2: Prisma 7 (pasando por la 6)
- **Paso 1, Prisma 6:** `prisma` y `@prisma/client` 6.19 juntos; los cambios chicos que pida; todas las pruebas.
- **Paso 2, Prisma 7:** `prisma.config.ts`, `@prisma/adapter-pg` en `PrismaService` y en el seed, grupo de conexiones fijado, seed explícito en `db:reset` y en las e2e (sin `--skip-generate`), lo que pida el esquema (`omitApi`, `relationJoins`).
- Revisión a fondo, además de las pruebas:
  - El aislamiento entre gimnasios: una prueba que confirme que un gimnasio no ve datos de otro con la extensión `$extends` nueva.
  - Las migraciones: `migrate deploy` en una base vacía y en una con datos (como en producción).
  - Los tiempos con los datos grandes (200.000 ventas, 500.000 asistencias): los indicadores del Inicio (hoy unos 65 ms), los reportes (hoy menos de 1 s) y "Lo que hay que saber hoy" (100 a 200 ms). Que no empeoren por el cambio de conexión.
  - La imagen Docker de la API y el servicio `migrar` de producción.
- Se cierra la propuesta #5.
- **Listo cuando:** API, base y e2e pasan; los tiempos no empeoran; las migraciones y la imagen Docker funcionan.

### Fase 3: Next 16
- El codemod oficial y después revisión a mano: `proxy.ts`, sin `eslint` en `next.config.js`, scripts.
- Turbopack (A5): la imagen Docker (`standalone`), las cabeceras y la CSP, `/_next/image` sigue cerrado.
- Recorrido: las 26 pantallas sin errores ni avisos en la consola, compilada y en `next dev`, como en la fase 6 de seguridad; los tres roles; claro y oscuro; celular.
- Se cierra la propuesta #4.
- **Listo cuando:** web y e2e pasan, el recorrido está limpio y la imagen Docker arranca con las cabeceras de producción.

### Fase 4: Node 26 (después del 28 de octubre de 2026)
- `node:26-alpine` en el Dockerfile, Node 26 en el CI y `engines`.
- Las dos imágenes construidas y arrancadas, todas las pruebas con Node 26.
- **Listo cuando:** CI en verde con Node 26 y las dos imágenes funcionando.

---

## 6. Riesgos y cómo se cubren

| Riesgo | Cómo se cubre |
|---|---|
| La regla de seguridad de Prisma se pierde en silencio al cambiar el formato de ESLint | Prueba que la hace saltar (fase 1). |
| El adaptador de Prisma cambia el grupo de conexiones y la API se pone lenta o se queda sin conexiones con carga | Fijar el tamaño y los tiempos del grupo; medir con los datos grandes antes y después (fase 2). |
| `db:reset` o las e2e dejan de sembrar la base (Prisma 7 ya no corre el seed solo) | Seed explícito y la tanda e2e lo prueba en cada corrida (fase 2). |
| La extensión que aísla los gimnasios (`$extends`) se comporta distinto | Prueba de aislamiento entre dos gimnasios (fase 2). |
| Turbopack arma distinto la imagen `standalone` o rompe la CSP | Construir y arrancar la imagen Docker; recorrido de la consola; plan B `--webpack` (fase 3). |
| Una propuesta de Dependabot se acepta sin querer | Cerrarlas con comentario (A7). |

---

## 7. Para más adelante

- **Prisma 8**, cuando sea estable y haya tenido algunos arreglos: cambia el esquema (encabezado, nombres de tablas sin `@@map`, fechas), renombra `skip`/`take` a `offset`/`limit` y es el momento de pasar al generador nuevo (A4).
- **Las mayores que vengan después** (NestJS, React, Express, etc.): mismo método que aquí, una por fase, cuando Dependabot las proponga.
- **React Compiler** (A6).
