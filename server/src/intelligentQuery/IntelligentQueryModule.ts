import { Module } from '@nestjs/common';
import { IntelligentRouterService } from './services/IntelligentRouterService.js';
import { IntelligentQueryController } from './controllers/IntelligentQueryController.js';

/**
 * Intelligent Query Module
 * Provides AI-powered conversational natural language query routing
 */
@Module({
  controllers: [IntelligentQueryController],
  providers: [
    IntelligentRouterService
  ],
  exports: [
    IntelligentRouterService
  ]
})
export class IntelligentQueryModule {}
