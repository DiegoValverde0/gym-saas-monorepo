# Informe Analítico - Actividad 6
**Plan de Pruebas y Control de Calidad**

---

## 1. Propósito y Enfoque del Testeo

El objetivo de este documento es establecer el Plan de Pruebas formal para el sistema SaaS **Gym Manager**. Dado que el sistema maneja flujos financieros y acceso multi-tenant (múltiples sucursales y roles), la calidad y estabilidad de la aplicación son críticas.

El plan abarca tres niveles de prueba:
1. **Pruebas Unitarias:** Validación aislada de la lógica de negocio (Servicios del Backend en NestJS).
2. **Pruebas de Integración:** Validación de la comunicación entre el Frontend (React/Next.js) y el Backend (NestJS), asegurando el correcto flujo y formato de los DTOs.
3. **Pruebas de Interfaz (E2E):** Validación de la experiencia de usuario y bloqueos de seguridad visuales en la UI.

---

## 2. Matriz de Casos de Prueba (Diseñados e Identificados)

A continuación se detalla la matriz de los casos de prueba más críticos que han sido identificados (y testeados) durante el desarrollo reciente:

| ID | Módulo | Descripción del Caso de Prueba | Tipo de Prueba | Resultado Esperado | Estado Actual |
|---|---|---|---|---|---|
| **CP-01** | Auth / Tenants | Inicio de sesión como `RECEPCIONISTA` e intento de cargar clientes globales. | Integración / Seguridad | El backend debe inyectar el `organizacionId` y rechazar peticiones con cabecera `tenant: all`. | PASÓ (Solucionado) |
| **CP-02** | Ventas / POS | Creación de transacción en el POS sin tener selector global de sucursal. | Interfaz / Integración | El sistema debe extraer automáticamente la sucursal del token JWT y aprobar la transacción. | PASÓ (Solucionado) |
| **CP-03** | Asistencias | Marcar asistencia por segunda vez en el mismo día para un cliente (Rol: Recepcionista). | Unitaria (Servicio) | El sistema debe denegar el acceso devolviendo "Límite alcanzado". | PASÓ (Solucionado) |
| **CP-04** | Creación (CRUD) | Intento de crear un Plan o Promoción como `Admin_Gym`. | Interfaz | El botón de guardar no debe bloquearse pidiendo un tenant, debe heredar la organización/sucursal del JWT. | PASÓ (Solucionado) |

---

## 3. Aplicación de Técnicas de Testeo (Detección de Fallas)

Durante el ciclo de desarrollo reciente, se aplicaron técnicas de **Testeo de Caja Negra** y **Testeo de Caja Blanca**:
- **Caja Blanca (Auditoría de Código en Backend):** Se testearon los controladores y servicios (`membresia.service.ts`, `asistencia.service.ts`) verificando que los condicionales lógicos inyectaran de forma segura las dependencias de sucursal.
- **Caja Negra (Simulación en Frontend):** Se simularon los roles de *Recepcionista* y *Admin Gym* en la interfaz, sin ver el código subyacente, para descubrir fallas de UX. Esto permitió detectar y arreglar el falso bloqueo que existía en los formularios de creación al faltar el selector global.

---

## 4. Pruebas Automatizadas Integradas (Control de Calidad Formal)

Para cumplir con un estándar de **Control de Calidad 100% formal**, se ha levantado una suite completa de pruebas unitarias automatizadas utilizando el framework **Jest** (integrado nativamente en NestJS) y la librería `jest-mock-extended` para asegurar el correcto aislamiento de la base de datos (Prisma ORM).

### Cobertura de Pruebas Unitarias
Se ha desarrollado código de pruebas `*.spec.ts` aislando la lógica de negocio pura de los siguientes dominios críticos operativos:
- **Gestión de Clientes (`clientes.service.spec.ts`):** Prevención de duplicidad de documentos y validaciones de creación.
- **Validación de Roles y Permisos (`auth.service.spec.ts` & `rol.service.spec.ts`):** Asignación estricta de dominios multitenant y protección de roles del sistema.
- **Membresías y Promociones (`membresia.service.spec.ts` & `promocion.service.spec.ts`):** Lógica matemática para el cálculo de descuentos, y validación temporal (`useFakeTimers`) para las fechas de caducidad.
- **Finanzas y POS (`transaccion.service.spec.ts` & `apertura-caja.service.spec.ts`):** Validación estricta de cuadre de caja (subtotales vs pagos) y prevención transaccional para evitar ventas sin caja abierta.

**Conclusión:** El Plan de Pruebas funcional ha sido diseñado y, ahora, exitosamente traducido hacia código automatizado (`Unit Testing`). Esta base garantiza la detección temprana de fallas en futuras actualizaciones y asegura el cumplimiento integral de los estándares formales de calidad del software para Gym Manager.
