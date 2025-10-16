import { Module } from '@nestjs/common';
import { IntelligentRouterService } from './services/IntelligentRouterService.js';
import { ConversationService } from './services/ConversationService.js';
import { ConversationalRouterService } from './services/ConversationalRouterService.js';
import { IntelligentQueryController } from './controllers/IntelligentQueryController.js';

/**
 * Intelligent Query Module
 * Provides AI-powered conversational natural language query routing
 */
@Module({
  controllers: [IntelligentQueryController],
  providers: [
    IntelligentRouterService,
    ConversationService,
    ConversationalRouterService
  ],
  exports: [
    IntelligentRouterService,
    ConversationalRouterService
  ]
})
export class IntelligentQueryModule {}
