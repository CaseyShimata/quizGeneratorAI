import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MainModule } from './MainModule';
import { PORT } from './config/constants';
import { CORS_OPTIONS } from './config/cors';
import { setupOpenAPI } from './openapi/helpers/setupOpenAPI';
import { GlobalExceptionFilter } from './common/GlobalExceptionFilter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(MainModule);
  app.enableCors(CORS_OPTIONS);
  app.useGlobalFilters(new GlobalExceptionFilter());
  setupOpenAPI(app);
  await app.listen(PORT);
  logger.log(`Application is running on port ${PORT}`);
}

void bootstrap();
