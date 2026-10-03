/** Un número entero positivo de una variable de entorno, o el valor por defecto. */
export function enteroDeEntorno(entorno: NodeJS.ProcessEnv, variable: string, porDefecto: number): number {
  const valor = Number(entorno[variable]);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}

// Las variables numéricas opcionales (límites y sesión): si están, tienen que
// ser un entero mayor que 0. Sin esto, un valor mal escrito se ignoraba en
// silencio y quedaba el de siempre.
const ENTEROS_OPCIONALES = [
  'LIMITE_GENERAL',
  'LIMITE_LOGIN',
  'LIMITE_PESADO',
  'LIMITE_REPORTES',
  'LOGIN_FALLOS_MAX',
  'LOGIN_FALLOS_VENTANA_MIN',
  'LOGIN_BLOQUEO_MIN',
  'SESION_HORAS',
];

// Los valores de muestra de los .env.example: nunca deben llegar a producción.
const SECRETOS_DE_MUESTRA = ['tu_secreto_jwt_muy_seguro_y_largo', 'cambia-esto-por-un-secreto-largo-y-aleatorio'];
const LARGO_MINIMO_SECRETO = 32;

const esUrl = (valor: string, protocolos: string[]) => {
  try {
    return protocolos.includes(new URL(valor).protocol);
  } catch {
    return false;
  }
};

/**
 * Revisa la configuración antes de arrancar (docs/plan-seguridad.md, fase 4).
 * `errores`: la API no arranca. `avisos`: arranca, pero lo dice. En
 * producción lo inseguro es un error; en desarrollo, un aviso.
 */
export function revisarEntorno(entorno: NodeJS.ProcessEnv): { errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];
  const produccion = entorno.NODE_ENV === 'production';
  const inseguro = (mensaje: string) => (produccion ? errores : avisos).push(mensaje);
  const valor = (variable: string) => entorno[variable]?.trim() || undefined;

  if (entorno.NODE_ENV && !['development', 'production', 'test'].includes(entorno.NODE_ENV)) {
    errores.push(`NODE_ENV tiene que ser development, production o test (vale "${entorno.NODE_ENV}").`);
  }

  const baseDeDatos = valor('DATABASE_URL');
  if (!baseDeDatos) errores.push('Falta DATABASE_URL (la dirección de la base de datos).');
  else if (!esUrl(baseDeDatos, ['postgres:', 'postgresql:'])) errores.push('DATABASE_URL tiene que empezar con postgresql://.');

  const secreto = valor('JWT_SECRET');
  if (!secreto) errores.push('Falta JWT_SECRET (el secreto que firma las sesiones). Genera uno con: openssl rand -hex 48');
  else if (SECRETOS_DE_MUESTRA.includes(secreto)) inseguro('JWT_SECRET es el valor de muestra del .env.example: cualquiera puede firmar sesiones. Genera uno con: openssl rand -hex 48');
  else if (secreto.length < LARGO_MINIMO_SECRETO) inseguro(`JWT_SECRET es muy corto (${secreto.length} caracteres; mínimo ${LARGO_MINIMO_SECRETO}). Genera uno con: openssl rand -hex 48`);

  const redis = valor('REDIS_URL');
  if (redis && !esUrl(redis, ['redis:', 'rediss:'])) errores.push('REDIS_URL tiene que empezar con redis:// o rediss://.');

  const frontend = valor('FRONTEND_URL');
  if (frontend) {
    for (const origen of frontend.split(',').map((o) => o.trim()).filter(Boolean)) {
      if (!esUrl(origen, ['http:', 'https:'])) errores.push(`FRONTEND_URL tiene una dirección que no es válida: "${origen}".`);
      else if (produccion && !origen.startsWith('https://')) errores.push(`En producción, FRONTEND_URL tiene que usar https:// ("${origen}").`);
    }
  } else if (produccion) {
    errores.push('Falta FRONTEND_URL: en producción es la dirección de la web (la única que puede llamar a la API).');
  }

  const puerto = valor('PORT');
  if (puerto && !(Number.isInteger(Number(puerto)) && Number(puerto) > 0 && Number(puerto) < 65536)) {
    errores.push(`PORT tiene que ser un número de puerto (vale "${puerto}").`);
  }

  for (const variable of ENTEROS_OPCIONALES) {
    const v = valor(variable);
    if (v && !(Number.isInteger(Number(v)) && Number(v) > 0)) errores.push(`${variable} tiene que ser un número entero mayor que 0 (vale "${v}").`);
  }

  return { errores, avisos };
}
