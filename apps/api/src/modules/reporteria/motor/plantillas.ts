import { createHash } from 'crypto';
import { tipoReporte } from '../catalogo';
import { PLANTILLAS } from '../catalogo/plantillas';
import { Definicion, validarDefinicion } from './definicion';

/**
 * El id de una plantilla en un gimnasio: un UUID (versión 5) que sale del
 * gimnasio y de la clave de la plantilla. Siempre el mismo, así la copia de
 * cada gimnasio se encuentra y se actualiza sin una columna más.
 */
export function idDePlantilla(organizacionId: string, clave: string): string {
  const h = createHash('sha1').update(`reporteria-plantilla:${organizacionId}:${clave}`).digest('hex');
  const variante = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

interface PlantillaLista {
  clave: string;
  nombre: string;
  descripcion: string;
  definicion: Definicion;
}

/** La clave de una plantilla a partir de su id en un gimnasio (o undefined si no es una). */
export function clavePlantillaDe(organizacionId: string, id: string): string | undefined {
  return PLANTILLAS.find((p) => idDePlantilla(organizacionId, p.clave) === id)?.clave;
}

let validadas: PlantillaLista[] | undefined;

/** Las plantillas con su definición ya validada (y completa) contra el catálogo. */
export function plantillasListas(): PlantillaLista[] {
  validadas ??= PLANTILLAS.map((p) => {
    const tipo = tipoReporte(p.definicion.tipo);
    if (!tipo) throw new Error(`La plantilla "${p.clave}" usa un tipo que no existe.`);
    return { clave: p.clave, nombre: p.nombre, descripcion: p.descripcion, definicion: validarDefinicion(p.definicion, tipo, { avanzado: true }) };
  });
  return validadas;
}
