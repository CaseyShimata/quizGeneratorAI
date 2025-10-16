import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIService } from './services/OpenAIService.js';

/**
 * OpenAI Module
 * Provides shared OpenAI client and services
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpenAIService],
  exports: [OpenAIService]
})
export class OpenAIModule {}
