import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MainModule } from './MainModule';
import { PORT } from './config/constants';
import { CORS_OPTIONS } from './config/cors';
import { setupOpenAPI } from './openapi/helpers/setupOpenAPI';
import { GlobalExceptionFilter } from './common/GlobalExceptionFilter';

async function bootstrap() {
  const app = await NestFactory.create(MainModule);
  app.enableCors(CORS_OPTIONS);
  app.useGlobalFilters(new GlobalExceptionFilter());
  setupOpenAPI(app);
  await app.listen(PORT);
  console.log(`App listening on ${PORT}`);
}

void bootstrap();
