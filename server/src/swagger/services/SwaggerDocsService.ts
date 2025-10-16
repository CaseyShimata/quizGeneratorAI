import { Injectable, Inject } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

/**
 * Swagger Documentation Service
 * Extracts and formats OpenAPI documentation for AI consumption
 */
@Injectable()
export class SwaggerDocsService {
  private swaggerDocument: any = null;

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost
  ) {}

  /**
   * Initialize and cache Swagger document
   */
  setSwaggerDocument(document: any) {
    this.swaggerDocument = document;
  }

  /**
   * Get Swagger document in OpenAI function calling format
   */
  getToolsFromSwagger(): any[] {
    if (!this.swaggerDocument || !this.swaggerDocument.paths) {
      return [];
    }

    const tools: any[] = [];

    // Iterate through all paths in the Swagger doc
    for (const [path, methods] of Object.entries(this.swaggerDocument.paths)) {
      for (const [method, details] of Object.entries(methods as Record<string, any>)) {
        // Skip non-HTTP methods and the /api/ai endpoints (avoid recursion)
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase()) ||
            path.startsWith('/api/ai')) {
          continue;
        }

        const operation = details as any;
        
        // Build parameters schema
        const parameters: any = {
          type: 'object',
          properties: {},
          required: []
        };

        // Add query parameters
        if (operation.parameters) {
          operation.parameters.forEach((param: any) => {
            if (param.in === 'query') {
              const paramSchema = this.simplifySchema(param.schema);
              if (paramSchema) {
                parameters.properties[param.name] = {
                  ...paramSchema,
                  description: param.description || ''
                };
                if (param.required) {
                  parameters.required.push(param.name);
                }
              }
            }
          });
        }

        // Add request body parameters
        if (operation.requestBody?.content?.['application/json']?.schema) {
          const schema = operation.requestBody.content['application/json'].schema;
          if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              const simplifiedSchema = this.simplifySchema(propSchema as any);
              if (simplifiedSchema) {
                parameters.properties[propName] = simplifiedSchema;
              }
            }
            if (schema.required && Array.isArray(schema.required)) {
              parameters.required.push(...schema.required.filter((r: string) => 
                parameters.properties.hasOwnProperty(r)
              ));
            }
          }
        }

        // Only create tool if it has properties
        if (Object.keys(parameters.properties).length > 0 || method.toLowerCase() === 'get') {
          const tool = {
            type: 'function' as const,
            function: {
              name: `${method.toUpperCase()}_${path.replace(/\//g, '_').replace(/^_/, '')}`,
              description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
              parameters: parameters
            }
          };

          tools.push(tool);
        }
      }
    }

    return tools;
  }

  /**
   * Simplify schema to OpenAI-compatible format
   * Only supports: string, number, integer, boolean, array of simple types
   */
  private simplifySchema(schema: any): any | null {
    if (!schema || !schema.type) {
      return null;
    }

    const type = schema.type;

    // Simple types
    if (['string', 'number', 'integer', 'boolean'].includes(type)) {
      return {
        type,
        description: schema.description || ''
      };
    }

    // Array of simple types
    if (type === 'array' && schema.items) {
      const itemType = schema.items.type;
      if (['string', 'number', 'integer', 'boolean'].includes(itemType)) {
        return {
          type: 'array',
          items: { type: itemType },
          description: schema.description || ''
        };
      }
    }

    // Skip complex types (object, record, any, etc.)
    return null;
  }

  /**
   * Get endpoint information for a specific tool
   */
  getEndpointInfo(toolName: string): { method: string; path: string } | null {
    // Parse tool name back to method and path
    // Format: METHOD_path_parts
    const match = toolName.match(/^(GET|POST|PUT|DELETE|PATCH)_(.+)$/);
    if (!match) return null;

    const method = match[1];
    const pathParts = match[2].split('_');
    const path = '/' + pathParts.join('/');

    return { method, path };
  }

  /**
   * Get all available endpoints in human-readable format
   */
  getEndpointsDescription(): string {
    if (!this.swaggerDocument || !this.swaggerDocument.paths) {
      return 'No API documentation available.';
    }

    const descriptions: string[] = [];

    for (const [path, methods] of Object.entries(this.swaggerDocument.paths)) {
      for (const [method, details] of Object.entries(methods as Record<string, any>)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          continue;
        }

        const operation = details as any;
        descriptions.push(
          `${method.toUpperCase()} ${path}: ${operation.summary || operation.description || 'No description'}`
        );
      }
    }

    return descriptions.join('\n');
  }
}
