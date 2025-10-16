import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { SwaggerDocsService } from '../services/SwaggerDocsService.js';

/**
 * Setup Swagger API documentation
 * Configures Swagger UI and injects document into SwaggerDocsService
 */
export async function setupSwagger(app: INestApplication): Promise<void> {
  // Build Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Quiz Generator AI API')
    .setDescription('AI-powered quiz generation and management API with natural language query support')
    .setVersion('1.0')
    .build();
  
  // Create Swagger document
  const document = SwaggerModule.createDocument(app, config);
  
  // Setup Swagger UI at /api
  SwaggerModule.setup('api', app, document);
  
  // Inject document into SwaggerDocsService for AI routing
  const swaggerDocsService = app.get(SwaggerDocsService);
  swaggerDocsService.setSwaggerDocument(document);
  
  console.log('Swagger documentation configured at /api');
}
