import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { mainConfig } from '../mainConfig.js';
import { AppConfigService } from './services/AppConfigService.js';

/**
 * Config Module
 * Handles application configuration
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [mainConfig]
    })
  ],
  providers: [AppConfigService],
  exports: [AppConfigService, NestConfigModule]
})
export class ConfigModule {}
