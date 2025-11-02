import { Injectable, Inject, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenAPI Documentation Service
 * Extracts and formats OpenAPI documentation for AI consumption
 * Exports internal API documentation to ./APIDocs/ for IntelligentQuery integration
 */
@Injectable()
export class OpenAPIDocsService {
  private readonly logger = new Logger(OpenAPIDocsService.name);
  private openAPIDocument: any = null;
  private readonly APIDOCS_DIR = './APIDocs';
  private readonly INTERNAL_API_DOC_PATH = './APIDocs/internalREST.json';

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    private readonly configService: ConfigService,
  ) {
    this.ensureAPIDocsDirectory();
  }

  /**
   * Initialize and cache OpenAPI document
   * Also exports to ./APIDocs/internalREST.json for IntelligentQuery integration
   */
  setOpenAPIDocument(document: any) {
    this.openAPIDocument = document;
    this.exportOpenAPIDocument();
  }

  /**
   * Expose the raw OpenAPI document
   */
  getOpenAPIDocument(): any {
    return this.openAPIDocument;
  }

  /**
   * Export OpenAPI document to ./APIDocs/ directory
   * This allows IntelligentQuery to treat internal API like an external API
   */
  private exportOpenAPIDocument(): void {
    if (!this.openAPIDocument) {
      this.logger.warn('No OpenAPI document to export');
      return;
    }

    try {
      const docPath = path.resolve(this.INTERNAL_API_DOC_PATH);
      fs.writeFileSync(
        docPath,
        JSON.stringify(this.openAPIDocument, null, 2),
        'utf-8',
      );
      this.logger.log(
        `Exported internal API OpenAPI documentation to ${docPath}`,
      );
    } catch (error) {
      this.logger.error('Failed to export OpenAPI document:', error);
    }
  }

  /**
   * Get internal API configuration for IntelligentQuery integration
   * Returns configuration compatible with ExternalAPIManagerService
   */
  getInternalAPIConfig() {
    const baseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';

    return {
      name: 'internalREST',
      type: 'rest' as const,
      APIUrl: baseUrl,
      AuthKey: 'Authorization: Internal',
      APIDoc: this.INTERNAL_API_DOC_PATH,
      enabled: true,
      timeout: 30000,
      retries: 3,
    };
  }

  /**
   * Ensure APIDocs directory exists
   */
  private ensureAPIDocsDirectory(): void {
    try {
      if (!fs.existsSync(this.APIDOCS_DIR)) {
        fs.mkdirSync(this.APIDOCS_DIR, { recursive: true });
        this.logger.log(`Created APIDocs directory at ${this.APIDOCS_DIR}`);
      }
    } catch (error) {
      this.logger.error('Failed to create APIDocs directory:', error);
    }
  }
}
