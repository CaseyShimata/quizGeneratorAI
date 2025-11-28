import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAPIDocsService } from './services/OpenAPIDocsService';

/**
 * OpenAPI Module
 * Handles API documentation generation and programmatic access
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpenAPIDocsService],
  exports: [OpenAPIDocsService],
})
export class OpenAPIModule {}
