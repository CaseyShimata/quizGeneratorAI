import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {MainModule} from './MainModule.js';
import {AppConfigService} from './config/services/AppConfigService.js';
import {setupSwagger} from './swagger/helpers/setupSwagger.js';

async function bootstrap() {

    const app = await NestFactory.create(MainModule);
    const appConfigService = app.get(AppConfigService);
    appConfigService.applyCors(app);
    const port = appConfigService.getPort();

    await setupSwagger(app);
    await app.listen(port);
    console.log(`App listening on ${port}`);
}

bootstrap();
