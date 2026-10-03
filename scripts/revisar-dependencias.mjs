// Revisa las dependencias de producción con `pnpm audit` (docs/plan-seguridad.md,
// fase 1). Falla si aparece una vulnerabilidad alta o crítica que no esté en
// ACEPTADAS: así el CI avisa de las nuevas sin quedar rojo por las conocidas.
//
// Uso: node scripts/revisar-dependencias.mjs
import { execSync } from 'node:child_process';

// Las conocidas que no se pueden arreglar todavía (por ejemplo, porque piden
// cambiar de versión mayor), con el motivo y cuándo se van:
//   'GHSA-xxxx-xxxx-xxxx': 'Por qué no aplica o cómo se mitigó (y cuándo se arregla).',
// Vacía desde la fase 6 de docs/plan-seguridad.md: 0 vulnerabilidades.
/** @type {Record<string, string>} */
const ACEPTADAS = {};

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
