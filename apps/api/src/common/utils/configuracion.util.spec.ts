import { describe, expect, it } from 'vitest';
import { combinarConfiguracion, configuracionPublica, sinSecretos } from './configuracion.util';

describe('combinarConfiguracion', () => {
  it('guardar una sección no borra las demás', () => {
    const actual = { modoUso: 'experto', modulos: { clasesGrupales: true, controlGastos: false } };
    expect(combinarConfiguracion(actual, { modulos: { controlGastos: true } })).toEqual({
      modoUso: 'experto',
      modulos: { clasesGrupales: true, controlGastos: true },
    });
  });

  it('los campos opcionales no enviados (undefined) no pisan lo guardado', () => {
    const actual = { jornadas: { toleranciaAtrasoMinutos: 15 } };
    expect(combinarConfiguracion(actual, { jornadas: { toleranciaAtrasoMinutos: undefined }, modoUso: undefined })).toEqual(actual);
  });

  it('parte de un objeto vacío si no había configuración', () => {
    expect(combinarConfiguracion(null, { modoUso: 'simple' })).toEqual({ modoUso: 'simple' });
  });
});

describe('configuración pública (sin secretos)', () => {
  it('nunca devuelve el hash del PIN del kiosco, solo si existe', () => {
    const publica = configuracionPublica({ modoUso: 'intermedio', kiosco: { pinHash: 'sal:hash' } });
    expect(publica).toEqual({ modoUso: 'intermedio', kiosco: { tienePin: true } });
    expect(JSON.stringify(publica)).not.toContain('hash');
  });

  it('un PIN quitado (hash vacío) se informa como que no hay PIN', () => {
    expect(configuracionPublica({ kiosco: { pinHash: '' } })).toEqual({ kiosco: { tienePin: false } });
  });

  it('sin kiosco no agrega nada', () => {
    expect(configuracionPublica({ modoUso: 'simple' })).toEqual({ modoUso: 'simple' });
    expect(configuracionPublica(null)).toBeNull();
  });

  it('sinSecretos limpia la configuración de una organización completa', () => {
    const org = { id: 'o1', nombre: 'Gym', configuracion: { kiosco: { pinHash: 'x' } } };
    expect(sinSecretos(org)).toEqual({ id: 'o1', nombre: 'Gym', configuracion: { kiosco: { tienePin: true } } });
  });
});
