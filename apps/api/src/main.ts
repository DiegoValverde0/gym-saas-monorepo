import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Seguridad HTTP
  app.use(helmet());
  // Antes `enableCors()` sin opciones aceptaba cualquier origen. Ahora solo
  // se aceptan los de FRONTEND_URL (coma-separado); sin esa variable, cae al
  // dev server local (localhost:3000) en vez de fallar cerrado por completo,
  // para no romper `pnpm dev` a quien no la haya configurado todavía.
  const frontendOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean) ?? ['http://localhost:3000'];
  app.enableCors({ origin: frontendOrigins });
  
  // Validaciones globales
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Interceptores y Filtros Globales
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(3001);
  console.log('🚀 API is running on: http://localhost:3001');
}
bootstrap();
