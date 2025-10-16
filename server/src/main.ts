import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MainModule } from './MainModule.js';
import { PORT } from './config/constants.js';
import { CORS_OPTIONS } from './config/cors.js';
import { setupSwagger } from './swagger/helpers/setupSwagger.js';

async function bootstrap() {
    const app = await NestFactory.create(MainModule);
    app.enableCors(CORS_OPTIONS);
    await setupSwagger(app);
    await app.listen(PORT);
    console.log(`App listening on ${PORT}`);
}

bootstrap();
