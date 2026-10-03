// Se corre antes de `prisma migrate reset` (ver "db:reset" en package.json):
// el reset borra la base antes de llamar al seed, así que el freno tiene que
// estar antes.
import { asegurarBaseDePruebas } from './solo-pruebas';

asegurarBaseDePruebas();
