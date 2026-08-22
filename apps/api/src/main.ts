import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Opcional, pero necesario para comunicación con la web app
  await app.listen(3001);
  console.log('🚀 API is running on: http://localhost:3001');
}
bootstrap();
