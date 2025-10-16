import { Module, Global, OnModuleInit } from '@nestjs/common';
import { SwaggerDocsService } from './services/SwaggerDocsService.js';

/**
 * Swagger Module
 * Handles API documentation generation and programmatic access
 */
@Global()
@Module({
  providers: [SwaggerDocsService],
  exports: [SwaggerDocsService]
})
export class SwaggerModule {}
