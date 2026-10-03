import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });

// La configuración se revisa antes de cargar nada más (docs/plan-seguridad.md,
// fase 4): con una variable que falta o es insegura, la API no arranca y dice
// cuál. Va antes de importar AppModule, que ya lee las variables.
import { revisarEntorno } from './common/utils/entorno.util';
const { errores, avisos } = revisarEntorno(process.env);
for (const aviso of avisos) console.warn(`⚠️  ${aviso}`);
if (errores.length > 0) {
  const lista = errores.map((e) => `   - ${e}`).join('\n');
  console.error(`\n✋ La API no arranca: hay que corregir la configuración (.env):\n${lista}\n`);
  process.exit(1);
}

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Delante está Caddy, que pone en X-Forwarded-For solo la IP real de quien
  // pide (deploy/Caddyfile): con 1 salto de confianza, req.ip es esa IP y los
  // límites cuentan bien. La API no se publica afuera sin Caddy.
  app.set('trust proxy', 1);
  
  // Seguridad HTTP
  app.use(helmet());
  app.use(cookieParser());
  // Antes `enableCors()` sin opciones aceptaba cualquier origen. Ahora solo
  // se aceptan los de FRONTEND_URL (coma-separado); sin esa variable, cae al
  // dev server local (localhost:3000) en vez de fallar cerrado por completo,
  // para no romper `pnpm dev` a quien no la haya configurado todavía.
  const frontendOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean) ?? ['http://localhost:3000'];
  // Content-Disposition expuesta: el navegador lee el nombre del archivo de
  // las exportaciones de la reportería (en producción va por el mismo dominio).
  app.enableCors({ origin: frontendOrigins, credentials: true, exposedHeaders: ['Content-Disposition'] });
  
  // Validaciones globales
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Interceptores y Filtros Globales
  app.useGlobalInterceptors(new ResponseInterceptor());
  // PrismaClientExceptionFilter va primero: Nest usa el primer filtro que matchea
  // la excepción, y GlobalExceptionFilter usa @Catch() (atrapa todo), así que si
  // fuera primero el filtro de Prisma nunca se ejecutaría.
  app.useGlobalFilters(new PrismaClientExceptionFilter(), new GlobalExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API is running on: http://localhost:${port}`);
}
bootstrap();
