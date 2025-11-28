import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIModule } from '../openai/OpenAIModule';
import { OpenAPIModule } from '../openapi/OpenAPIModule';
import { IntelligentRouterService } from './services/IntelligentRouterService';
import { ConversationService } from './services/ConversationService';
import { ExternalAPIManagerService } from './services/ExternalAPIManagerService';
import { ExternalAPIExecutionService } from './services/ExternalAPIExecutionService';
import { InternalAPIIntegrationService } from './services/InternalAPIIntegrationService';
import { GraphQLSchemaParser } from './services/GraphQLSchemaParser';
import { IntelligentQueryController } from './controllers/IntelligentQueryController';

/**
 * Intelligent Query Module
 * Provides AI-powered conversational natural language query routing
 * Enhanced with schema-driven relationship analysis for complex operations
 * Supports both internal and external API integration
 */
@Module({
  imports: [ConfigModule, OpenAIModule, OpenAPIModule],
  controllers: [IntelligentQueryController],
  providers: [
    IntelligentRouterService,
    ConversationService,
    ExternalAPIManagerService,
    ExternalAPIExecutionService,
    InternalAPIIntegrationService,
    GraphQLSchemaParser,
  ],
  exports: [
    IntelligentRouterService,
    ExternalAPIManagerService,
    ExternalAPIExecutionService,
    InternalAPIIntegrationService,
    GraphQLSchemaParser,
  ],
})
export class IntelligentQueryModule {}
