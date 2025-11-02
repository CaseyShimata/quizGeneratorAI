import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalAPIManagerService } from './ExternalAPIManagerService';
import { OpenAPIDocsService } from '../../openapi/services/OpenAPIDocsService';

/**
 * Internal API Integration Service
 * Integrates the internal REST API (via Swagger) with IntelligentQuery module
 * Allows IntelligentQuery to treat internal API identically to external APIs
 */
@Injectable()
export class InternalAPIIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(InternalAPIIntegrationService.name);

  constructor(
    private readonly apiManager: ExternalAPIManagerService,
    private readonly openAPIDocs: OpenAPIDocsService,
  ) {}

  /**
   * Register internal API on module initialization
   */
  async onModuleInit() {
    this.registerInternalAPI();
  }

  /**
   * Register internal API with ExternalAPIManagerService
   * This allows the internal API to be included in:
   * - Unified relationship graphs
   * - Cross-API dependency resolution
   * - Conversational query routing
   */
  private registerInternalAPI(): void {
    try {
      const internalAPIConfig = this.openAPIDocs.getInternalAPIConfig();

      // Register with API manager
      this.apiManager.registerAPI(internalAPIConfig);

      this.logger.log(
        'Internal API successfully registered with IntelligentQuery module',
      );
      this.logger.log(
        `Internal API documentation: ${internalAPIConfig.APIDoc}`,
      );
    } catch (error) {
      this.logger.error('Failed to register internal API:', error);
      // Don't throw - allow module to continue functioning
    }
  }

  /**
   * Check if internal API is registered and accessible
   */
  isInternalAPIRegistered(): boolean {
    return this.apiManager.isAPIEnabled('internalREST');
  }

  /**
   * Get internal API configuration
   */
  getInternalAPIConfig() {
    return this.apiManager.getAPIConfig('internalREST');
  }

  /**
   * Reload internal API documentation
   * Useful when Swagger document is updated
   */
  async reloadInternalAPI(): Promise<void> {
    try {
      this.logger.log('Reloading internal API documentation...');

      // Clear cached documentation
      this.apiManager.clearDocumentationCache('internalREST');

      // Re-register with updated config
      this.registerInternalAPI();

      this.logger.log('Internal API documentation reloaded successfully');
    } catch (error) {
      this.logger.error('Failed to reload internal API:', error);
      throw error;
    }
  }
}
