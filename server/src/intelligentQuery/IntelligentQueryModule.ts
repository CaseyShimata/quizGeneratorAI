import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntelligentRouterService } from './services/IntelligentRouterService.js';
import { IntelligentQueryController } from './controllers/IntelligentQueryController.js';

/**
 * Intelligent Query Module
 * Provides AI-powered natural language query routing
 */
@Module({
  imports: [ConfigModule],
  controllers: [IntelligentQueryController],
  providers: [IntelligentRouterService],
  exports: [IntelligentRouterService]
})
export class IntelligentQueryModule {}
