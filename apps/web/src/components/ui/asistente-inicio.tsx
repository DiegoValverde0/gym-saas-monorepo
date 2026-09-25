"use client";

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiPost, apiPut } from '@/lib/api-client';
import { MODOS_USO, ModoUso, useModoUso } from '@/hooks/use-modo-uso';
import { usePermissions } from '@/hooks/use-permissions';
import { ModulosConfig } from '@/hooks/use-modulos-activos';
import { ChevronLeft } from 'lucide-react';

const TIPOS = [
  { valor: 'musculacion', nombre: 'Musculación' },
  { valor: 'box', nombre: 'Box / CrossFit' },
  { valor: 'estudio', nombre: 'Estudio (yoga, pilates, danza)' },
  { valor: 'artes_marciales', nombre: 'Artes marciales / academia' },
  { valor: 'otro', nombre: 'Otro' },
];
const TAMANOS = [
  { valor: 'solo', nombre: 'Solo yo' },
  { valor: 'pequeno', nombre: '2 a 5 personas' },
  { valor: 'grande', nombre: 'Más de 5' },
];

const NOMBRE_MODULO: Record<keyof ModulosConfig, string> = {
  puntoVenta: 'Venta de membresías y productos',
  controlAcceso: 'Control de acceso',
  clasesGrupales: 'Clases con reservas',
  controlPersonal: 'Equipo con horario',
  controlGastos: 'Gastos',
  reportesAvanzados: 'Reportes',
};

// Propuesta de modo y módulos según las respuestas (plan de simplificación, 4.5).
function proponer(tamano: string, clases: boolean): { modo: ModoUso; modulos: ModulosConfig } {
  const base: ModulosConfig = {
    puntoVenta: true,
    controlAcceso: true,
    reportesAvanzados: true,
    clasesGrupales: clases,
    controlPersonal: false,
    controlGastos: false,
  };
  if (tamano === 'grande') {
    return { modo: 'experto', modulos: { ...base, clasesGrupales: true, controlPersonal: true, controlGastos: true } };
  }
  if (tamano === 'solo' && !clases) return { modo: 'simple', modulos: base };
  return { modo: 'intermedio', modulos: { ...base, controlPersonal: tamano !== 'solo', controlGastos: true } };
}

/**
 * Asistente de inicio: 3 preguntas en lenguaje simple y una propuesta de modo
 * de uso y módulos. Aparece solo en organizaciones nuevas (configuracion.
 * onboarding.completado === false) y solo a quien puede cambiar la
 * configuración. Desde Configuración se puede volver a abrir.
 */
export function AsistenteInicio() {
  const { onboarding } = useModoUso();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pendiente = onboarding?.completado === false && hasPermission('organizaciones:actualizar');
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState('');
  const [tamano, setTamano] = useState('');
  const [clases, setClases] = useState<boolean | null>(null);
  const [modo, setModo] = useState<ModoUso>('intermedio');
  const [crearEjemplos, setCrearEjemplos] = useState(true);

  useEffect(() => {
    if (pendiente) setPaso(0);
  }, [pendiente]);

  const propuesta = proponer(tamano, !!clases);
  useEffect(() => {
    if (paso === 3) setModo(propuesta.modo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  const terminar = useMutation({
    mutationFn: async () =>
      apiPost<{ ejemplos: { planes: number; disciplinas: number } }>('/organizaciones/me/inicio', {
        modoUso: modo,
        modulos: propuesta.modulos,
        respuestas: { tipoGimnasio: tipo, tamanoEquipo: tamano, clasesGrupales: !!clases },
        crearEjemplos,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      const creados = res?.ejemplos?.planes ? ` Creamos ${res.ejemplos.planes} planes de ejemplo para que empieces a vender.` : '';
      toast({ title: '¡Listo!', description: `Tu gimnasio quedó en modo ${MODOS_USO.find((m) => m.valor === modo)?.nombre}.${creados}`, variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }),
  });

  const saltar = useMutation({
    mutationFn: async () => apiPut('/organizaciones/me/info', { configuracion: { onboarding: { completado: true } } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizacion'] }),
  });

  if (!pendiente) return null;

  const opcion = (activa: boolean) =>
    `w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${activa ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-100 font-semibold' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300'}`;
  const elegir = (accion: () => void) => {
    accion();
    setPaso((p) => p + 1);
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{paso < 3 ? 'Cuéntanos de tu gimnasio' : 'Te proponemos esta forma de trabajar'}</DialogTitle>
          <DialogDescription>
            {paso < 3 ? `Pregunta ${paso + 1} de 3. Con esto dejamos el sistema listo para ti; puedes cambiarlo cuando quieras en Configuración.` : 'Puedes elegir otro modo. Ocultar opciones no borra nada.'}
          </DialogDescription>
        </DialogHeader>

        {paso === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Qué tipo de gimnasio es?</p>
            {TIPOS.map((t) => (
              <button key={t.valor} type="button" className={opcion(tipo === t.valor)} onClick={() => elegir(() => setTipo(t.valor))}>{t.nombre}</button>
            ))}
          </div>
        )}
        {paso === 1 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Cuántas personas trabajan contigo?</p>
            {TAMANOS.map((t) => (
              <button key={t.valor} type="button" className={opcion(tamano === t.valor)} onClick={() => elegir(() => setTamano(t.valor))}>{t.nombre}</button>
            ))}
          </div>
        )}
        {paso === 2 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Das clases grupales con horario?</p>
            <button type="button" className={opcion(clases === true)} onClick={() => elegir(() => setClases(true))}>Sí</button>
            <button type="button" className={opcion(clases === false)} onClick={() => elegir(() => setClases(false))}>No</button>
          </div>
        )}
        {paso === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              {MODOS_USO.map((m) => (
                <button key={m.valor} type="button" className={opcion(modo === m.valor)} onClick={() => setModo(m.valor)}>
                  <span className="block">
                    {m.nombre}
                    {m.valor === propuesta.modo && <span className="ml-2 text-xs font-normal text-indigo-600 dark:text-indigo-300">(sugerido)</span>}
                  </span>
                  <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">{m.idea}</span>
                </button>
              ))}
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-600 dark:text-zinc-300">
              <p className="font-semibold mb-1">Funciones que activamos</p>
              <p>{(Object.keys(NOMBRE_MODULO) as (keyof ModulosConfig)[]).filter((k) => propuesta.modulos[k]).map((k) => NOMBRE_MODULO[k]).join(' · ')}</p>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={crearEjemplos} onCheckedChange={(c) => setCrearEjemplos(!!c)} className="mt-0.5" />
              <span>Crear planes de ejemplo (&quot;Mensual&quot; y &quot;10 sesiones&quot;){clases ? ' y una disciplina' : ''}. Podrás editarlos.</span>
            </label>
            <Button className="w-full" onClick={() => terminar.mutate()} disabled={terminar.isPending}>
              {terminar.isPending ? 'Guardando...' : 'Empezar'}
            </Button>
          </div>
        )}

        <div className="flex justify-between pt-2">
          {paso > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setPaso((p) => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Atrás</Button>
          ) : <span />}
          <Button variant="ghost" size="sm" onClick={() => saltar.mutate()} disabled={saltar.isPending}>Ahora no</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
