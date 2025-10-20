import { Injectable, Inject } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ToolBuilder, OpenAITool } from '../../openai/tools/ToolBuilder.js';

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
   * Expose the raw Swagger document
   */
  getSwaggerDocument(): any | null {
    return this.swaggerDocument;
  }

  /**
   * Get tools (OpenAI function format) constructed dynamically from Swagger
   */
  getToolsFromSwagger(): OpenAITool[] {
    if (!this.swaggerDocument || !this.swaggerDocument.paths) {
      return [];
    }

    // Build an allowlist of tool names derived from paths, excluding conversational/AI control endpoints
    const allowedNames = new Set<string>();
    for (const [path, methods] of Object.entries(this.swaggerDocument.paths)) {
      // Exclude the conversational endpoint to prevent recursive self-calls
      const lowerPath = String(path).toLowerCase();
      if (lowerPath.includes('/intelligent-query')) {
        continue;
      }

      for (const [method, op] of Object.entries(methods as Record<string, any>)) {
        const httpMethod = method.toLowerCase();
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(httpMethod)) continue;
        const operation = op as any;
        const name = operation?.operationId || ToolBuilder.getOperationName(operation, method, path);
        allowedNames.add(name);
      }
    }

    const allTools = ToolBuilder.buildTools(this.swaggerDocument);
    const tools = allTools.filter(t => allowedNames.has(t.function.name));

    return tools;
  }

  /**
   * Get endpoint information for a specific tool (by operationId or legacy METHOD_path)
   */
  getEndpointInfo(toolName: string): { method: string; path: string } | null {
    if (!this.swaggerDocument || !this.swaggerDocument.paths) return null;

    // 1) Try to match by operationId (preferred)
    for (const [path, methods] of Object.entries(this.swaggerDocument.paths)) {
      for (const [method, op] of Object.entries(methods as Record<string, any>)) {
        const operation = op as any;
        if (operation?.operationId === toolName) {
          return { method: method.toUpperCase(), path };
        }
      }
    }

    // 2) Fallback: compare against names ToolBuilder would generate
    for (const [path, methods] of Object.entries(this.swaggerDocument.paths)) {
      for (const [method, op] of Object.entries(methods as Record<string, any>)) {
        const operation = op as any;
        const computedName = ToolBuilder.getOperationName(operation, method, path);
        if (computedName === toolName) {
          return { method: method.toUpperCase(), path };
        }
      }
    }

    return null;
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
