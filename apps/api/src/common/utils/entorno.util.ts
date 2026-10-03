/** Un número entero positivo de una variable de entorno, o el valor por defecto. */
export function enteroDeEntorno(entorno: NodeJS.ProcessEnv, variable: string, porDefecto: number): number {
  const valor = Number(entorno[variable]);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}
