import { INestApplication, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { OpenAPIDocsService } from '../services/OpenAPIDocsService';

/**
 * Setup OpenAPI documentation
 * Configures Swagger UI and injects document into OpenAPIDocsService
 */
export function setupOpenAPI(app: INestApplication): void {
  const logger = new Logger('OpenAPI');
  
  // Build OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('Quiz Generator AI API')
    .setDescription(
      'AI-powered quiz generation and management API with natural language query support',
    )
    .setVersion('1.0')
    .build();

  // Create OpenAPI document
  const document = SwaggerModule.createDocument(app, config);

  // Setup Swagger UI at /api
  SwaggerModule.setup('api', app, document);

  // Inject document into OpenAPIDocsService for AI routing
  const openAPIDocsService = app.get(OpenAPIDocsService);
  openAPIDocsService.setOpenAPIDocument(document);

  logger.log('OpenAPI documentation configured at /api');
}
