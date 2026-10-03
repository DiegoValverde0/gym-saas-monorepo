// Revisa las dependencias de producción con `pnpm audit` (docs/plan-seguridad.md,
// fase 1). Falla si aparece una vulnerabilidad alta o crítica que no esté en
// ACEPTADAS: así el CI avisa de las nuevas sin quedar rojo por las conocidas.
//
// Uso: node scripts/revisar-dependencias.mjs
import { execSync } from 'node:child_process';

// Las conocidas que se arreglan cambiando de versión mayor, con el motivo y
// la fase del plan en que desaparecen. Al hacer esa fase, se borran de aquí.
const ACEPTADAS = {
  // Next 14 → Next 15 (fase 6).
  'GHSA-p293-qw3h-jr36': 'Ejecución remota en Next solo en servidores Windows: producción corre en Linux.',
  'GHSA-2xp9-vwfh-vxw4': 'Ejecución remota en el optimizador de imágenes: apagado (images.unoptimized) y /_next/image bloqueado en Caddy.',
  'GHSA-h25m-26qc-wcjf': 'Denegación de servicio en Next 14.',
  'GHSA-q4gf-8mx6-v5v3': 'Denegación de servicio con Server Components en Next 14.',
  'GHSA-8h8q-6873-q5fj': 'Denegación de servicio con Server Components en Next 14.',
  'GHSA-c4j6-fc7j-m34r': 'SSRF en Next 14 (la app no hace pedidos a URLs que mande el usuario).',
  'GHSA-36qx-fr4f-26g5': 'Salto del middleware en el Pages Router: la app usa el App Router.',
  'GHSA-m99w-x7hq-7vfj': 'Denegación de servicio con Server Actions: la app no usa Server Actions.',
  'GHSA-89xv-2m56-2m9x': 'SSRF con Server Actions: la app no usa Server Actions.',
  'GHSA-p9j2-gv94-2wf4': 'SSRF en rewrites: la app no tiene rewrites.',
};

const GRAVES = new Set(['high', 'critical']);

let salida;
try {
  // Un comando fijo, sin nada de afuera.
  salida = execSync('pnpm audit --prod --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  // `pnpm audit` sale con error cuando encuentra algo: el JSON viene igual.
  salida = e.stdout;
}
const informe = JSON.parse(salida);
const avisos = Object.values(informe.advisories ?? {});
const graves = avisos.filter((a) => GRAVES.has(a.severity));
const nuevas = graves.filter((a) => !ACEPTADAS[a.github_advisory_id]);
// Las aceptadas que ya no aparecen: hay que borrarlas de la lista.
const vigentes = new Set(graves.map((a) => a.github_advisory_id));
const sobran = Object.keys(ACEPTADAS).filter((id) => !vigentes.has(id));

console.log(`Dependencias de producción: ${avisos.length} avisos, ${graves.length} altos o críticos, ${graves.length - nuevas.length} aceptados.`);
for (const id of sobran) console.log(`  Ya no aparece ${id}: bórrala de ACEPTADAS.`);
if (nuevas.length > 0) {
  console.error('\nVulnerabilidades altas o críticas nuevas:');
  for (const a of nuevas) console.error(`  [${a.severity}] ${a.module_name} ${a.github_advisory_id}: ${a.title}\n    arreglo: ${a.patched_versions}  ${a.url}`);
  process.exit(1);
}
if (sobran.length > 0) process.exit(1);
