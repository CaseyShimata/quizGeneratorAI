import { Module, Global } from '@nestjs/common';
import { OpenAIService } from './services/OpenAIService';

/**
 * OpenAI Module
 * Provides shared OpenAI client and utilities
 */
@Global()
@Module({
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
