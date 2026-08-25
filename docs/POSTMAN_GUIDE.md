# Guía Práctica de Postman para Gym Manager

Esta guía te ayudará a configurar y probar tus endpoints directamente desde Postman.

## 1. Conceptos Iniciales
Como tenemos una arquitectura separada (Frontend/Backend), las pruebas de Postman deben dirigirse siempre al **Backend (NestJS)**, el cual está corriendo en el puerto **3001**. 

*   **URL Base:** `http://localhost:3001`

---

## 2. Configurar Variables de Entorno en Postman (Recomendado)
Para no tener que copiar y pegar el Token en cada petición, haremos lo siguiente en Postman:
1. En la esquina superior derecha, haz clic en el ícono del **Ojo (Environment quick look)** y dale a **"Add"**.
2. Ponle de nombre "Gym Manager Local".
3. Agrega dos variables:
   *   Variable: `API_URL` | Initial Value: `http://localhost:3001` | Current Value: `http://localhost:3001`
   *   Variable: `TOKEN` | Deja el valor en blanco (lo llenaremos luego).
4. Dale a guardar y asegúrate de seleccionar el entorno "Gym Manager Local" en el menú desplegable arriba a la derecha.

---

## 3. Probando los Endpoints

A continuación se detalla cómo crear cada petición. Haz clic en el botón **"New" (o "+") -> HTTP Request**.

### Endpoint 1: Login (Autenticación)
Este endpoint te devolverá el Token de Seguridad JWT.

*   **Método:** `POST`
*   **URL:** `{{API_URL}}/auth/login`
*   **Pestaña Body:** Selecciona `raw` y luego asegúrate de que el formato (a la derecha) diga `JSON`.
*   **Cuerpo (Body):**
```json
{
  "correo": "admin@gymtitan.com",
  "contrasena": "hashed_password_123"
}
```
*(Nota: Si quieres probar el otro inquilino, usa `"correo": "coach@cfalpha.com"` y `"contrasena": "hashed_password_456"`)*

*   **Al hacer clic en Send:** Obtendrás una respuesta 201 (Created) con un JSON que contiene el `access_token`.
*   **Paso Crítico:** Copia ese largo `access_token` sin las comillas, ve a tus Variables de Entorno (el Ojo en la esquina superior derecha), y pégalo en la variable `TOKEN`.

---

### Endpoint 2: Obtener Lista de Clientes (Protegido por JWT y RLS)
Este endpoint requiere tu token. Si le envías el token de "Gym Titan", te devolverá unos clientes; si le mandas el de "CrossFit Alpha", te devolverá otros. Todo esto es controlado por tu RLS de manera invisible.

*   **Método:** `GET`
*   **URL:** `{{API_URL}}/clientes`
*   **Pestaña Authorization:**
    *   **Type:** Selecciona `Bearer Token`
    *   **Token:** Escribe `{{TOKEN}}` (Postman reemplazará esto por la variable que guardaste antes).
*   **Al hacer clic en Send:** Obtendrás un JSON (Status 200 OK) con la lista de tus clientes filtrados por gimnasio. Si no configuras bien el token, recibirás un `401 Unauthorized`.

---


### Otros Endpoints del Proyecto
*(Siguen la misma lógica de Autorización JWT)*

*   **Obtener Usuarios:** 
    *   `GET {{API_URL}}/usuario`
*   **Registrar Nueva Organización (Tenant B2B):**
    *   `POST {{API_URL}}/organizacion/registrar` 
    *   En la pestaña **Body**, selecciona **raw** -> **JSON** y envía esta estructura:
```json
{
  "nombreOrg": "Nuevo Gym",
  "nombreAdmin": "Dueño Nuevo",
  "correo": "dueno@nuevogym.com",
  "contrasena": "secreta123"
}
```

---
### usuarios y organizaciones para las pruebas
Gym Titan
admin@gymtitan.com
hashed_password_123

CrossFit Alpha
coach@cfalpha.com
hashed_password_456
