import { describe, expect, it } from 'vitest';
import { motivoParaNoSembrar } from './solo-pruebas';

const local = 'postgresql://u:c@localhost:5433/gym';

describe('el seed y db:reset solo contra bases de prueba', () => {
  it('deja sembrar una base de esta computadora', () => {
    expect(motivoParaNoSembrar({ DATABASE_URL: local })).toBeNull();
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@127.0.0.1:5432/gym_e2e' })).toBeNull();
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@[::1]:5432/gym' })).toBeNull();
  });

  it('no deja con NODE_ENV=production ni con una base en otro servidor', () => {
    expect(motivoParaNoSembrar({ DATABASE_URL: local, NODE_ENV: 'production' })).toContain('production');
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@db:5432/gym' })).toContain('"db"');
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@mi-servidor.com:5432/gym' })).toContain('mi-servidor.com');
    expect(motivoParaNoSembrar({})).toContain('DATABASE_URL');
  });

  it('SEED_PERMITIDO=si lo permite a propósito (un servidor de pruebas)', () => {
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@db:5432/gym', SEED_PERMITIDO: 'si' })).toBeNull();
    expect(motivoParaNoSembrar({ DATABASE_URL: 'postgresql://u:c@db:5432/gym', SEED_PERMITIDO: 'true' })).not.toBeNull();
  });
});
