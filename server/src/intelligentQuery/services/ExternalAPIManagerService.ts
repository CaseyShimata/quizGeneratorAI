import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * External API Manager Service
 * Manages external API credentials and configurations
 * Handles loading, validation, and caching of external API settings
 */

export interface ExternalAPIConfig {
  name: string;
  type: 'rest' | 'graphql';
  APIUrl: string;
  AuthKey: string;
  APIDoc: string;
  enabled?: boolean;
  timeout?: number;
  retries?: number;
}

export interface APICredentials {
  [apiName: string]: ExternalAPIConfig;
}

@Injectable()
export class ExternalAPIManagerService {
  private readonly logger = new Logger(ExternalAPIManagerService.name);
  private apiCredentials: APICredentials = {};
  private docsCache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly APIDOCS_DIR = './APIDocs';

  constructor(private readonly configService: ConfigService) {
    this.loadAPICredentials();
    this.ensureAPIDocsDirectory();
  }

  /**
   * Load API credentials from flat environment configuration
   */
  private loadAPICredentials(): void {
    try {
      // Look for all environment variables starting with EXTERNAL_API_
      const envVars = Object.keys(process.env).filter(
        (key) => key.startsWith('EXTERNAL_API_') && key.endsWith('_NAME'),
      );

      for (const envVar of envVars) {
        // Extract API identifier (e.g., "EXAMPLE_REST" from "EXTERNAL_API_EXAMPLE_REST_NAME")
        const apiId = envVar.replace('EXTERNAL_API_', '').replace('_NAME', '');

        // Build configuration from flat structure
        const apiName = this.configService.get<string>(
          `EXTERNAL_API_${apiId}_NAME`,
        );
        const apiType = this.configService.get<string>(
          `EXTERNAL_API_${apiId}_TYPE`,
        );
        const apiUrl = this.configService.get<string>(
          `EXTERNAL_API_${apiId}_URL`,
        );
        const authKey = this.configService.get<string>(
          `EXTERNAL_API_${apiId}_AUTH_KEY`,
        );
        const docPath = this.configService.get<string>(
          `EXTERNAL_API_${apiId}_DOC_PATH`,
        );
        const timeout = this.configService.get<number>(
          `EXTERNAL_API_${apiId}_TIMEOUT`,
        );
        const retries = this.configService.get<number>(
          `EXTERNAL_API_${apiId}_RETRIES`,
        );

        if (!apiName || !apiType || !apiUrl || !authKey || !docPath) {
          this.logger.warn(
            `Incomplete configuration for API ${apiId}, skipping`,
          );
          continue;
        }

        const config: ExternalAPIConfig = {
          name: apiName,
          type: apiType as 'rest' | 'graphql',
          APIUrl: apiUrl,
          AuthKey: authKey,
          APIDoc: docPath,
          enabled: true,
          timeout: timeout ?? 30000,
          retries: retries ?? 3,
        };

        this.validateAPIConfig(config);
        this.apiCredentials[config.name] = config;
      }

      const apiCount = Object.keys(this.apiCredentials).length;
      if (apiCount > 0) {
        this.logger.log(`Loaded ${apiCount} external API configurations`);
      } else {
        this.logger.warn(
          'No external API configurations found in environment variables',
        );
      }
    } catch (error) {
      this.logger.error('Failed to load external API credentials:', error);
      throw new Error(`Invalid external API configuration: ${error.message}`);
    }
  }

  /**
   * Validate API configuration structure
   */
  private validateAPIConfig(config: ExternalAPIConfig): void {
    if (
      !config.name ||
      !config.type ||
      !config.APIUrl ||
      !config.AuthKey ||
      !config.APIDoc
    ) {
      throw new Error(`Invalid API configuration: missing required fields`);
    }

    if (!['rest', 'graphql'].includes(config.type)) {
      throw new Error(
        `Invalid API type: ${config.type}. Must be 'rest' or 'graphql'`,
      );
    }

    // Validate URL format
    try {
      new URL(config.APIUrl);
    } catch {
      throw new Error(`Invalid API URL: ${config.APIUrl}`);
    }

    // Validate AuthKey format (should include authorization type)
    if (!config.AuthKey.includes(': ')) {
      throw new Error(
        `Invalid AuthKey format: ${config.AuthKey}. Should be "AuthorizationType: Value"`,
      );
    }
  }

  /**
   * Get all available API configurations
   */
  getAllAPIs(): APICredentials {
    return { ...this.apiCredentials };
  }

  /**
   * Get specific API configuration by name
   */
  getAPIConfig(apiName: string): ExternalAPIConfig | null {
    return this.apiCredentials[apiName] || null;
  }

  /**
   * Get enabled API configurations only
   */
  getEnabledAPIs(): APICredentials {
    const enabled: APICredentials = {};

    for (const [name, config] of Object.entries(this.apiCredentials)) {
      if (config.enabled) {
        enabled[name] = config;
      }
    }

    return enabled;
  }

  /**
   * Check if API is configured and enabled
   */
  isAPIEnabled(apiName: string): boolean {
    const config = this.apiCredentials[apiName];
    return config?.enabled ?? false;
  }

  /**
   * Load and cache API documentation
   * Handles both JSON (OpenAPI) and GraphQL schema files (.gql)
   */
  async loadAPIDocumentation(apiName: string): Promise<any> {
    const config = this.apiCredentials[apiName];

    if (!config) {
      throw new Error(`API configuration not found: ${apiName}`);
    }

    // Check cache first
    if (this.isCacheValid(apiName)) {
      return this.docsCache.get(apiName);
    }

    try {
      // Load documentation from file
      if (!config.APIDoc) {
        throw new Error(`No documentation path configured for ${apiName}`);
      }

      const docPath = path.resolve(config.APIDoc);
      const docContent = fs.readFileSync(docPath, 'utf-8');

      let documentation: any;

      // Determine file type and parse accordingly
      const fileExt = path.extname(docPath).toLowerCase();

      if (fileExt === '.gql' || fileExt === '.graphql') {
        // GraphQL schema file - return as string
        documentation = docContent;
        this.logger.log(`Loaded GraphQL schema for ${apiName} from ${docPath}`);
      } else if (fileExt === '.json') {
        // JSON file (OpenAPI spec)
        documentation = JSON.parse(docContent);
        this.logger.log(
          `Loaded OpenAPI documentation for ${apiName} from ${docPath}`,
        );
      } else {
        // Try to parse as JSON first, fall back to raw string
        try {
          documentation = JSON.parse(docContent);
          this.logger.log(
            `Loaded JSON documentation for ${apiName} from ${docPath}`,
          );
        } catch {
          documentation = docContent;
          this.logger.log(
            `Loaded raw documentation for ${apiName} from ${docPath}`,
          );
        }
      }

      // Cache the documentation
      this.cacheDocumentation(apiName, documentation);

      return documentation;
    } catch (error) {
      this.logger.error(
        `Failed to load API documentation for ${apiName}:`,
        error,
      );
      throw new Error(`Failed to load API documentation: ${error.message}`);
    }
  }

  /**
   * Generate OpenAPI documentation for an API
   */
  async generateOpenAPIDocumentation(
    apiName: string,
    apiConfig: ExternalAPIConfig,
  ): Promise<any> {
    try {
      // This would typically introspect the API to generate OpenAPI docs
      // For now, we'll create a basic structure
      const baseUrl = new URL(apiConfig.APIUrl).origin;

      const openAPIDoc = {
        openapi: '3.0.0',
        info: {
          title: `${apiName} API`,
          version: '1.0.0',
          description: `Auto-generated OpenAPI documentation for ${apiName}`,
        },
        servers: [
          {
            url: baseUrl,
            description: `${apiConfig.type.toUpperCase()} API Server`,
          },
        ],
        paths: {},
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      };

      // Save to file
      const fileName = `${apiName}.json`;
      const filePath = path.join(this.APIDOCS_DIR, fileName);

      fs.writeFileSync(filePath, JSON.stringify(openAPIDoc, null, 2));

      this.logger.log(
        `Generated OpenAPI documentation for ${apiName} at ${filePath}`,
      );
      return openAPIDoc;
    } catch (error) {
      this.logger.error(
        `Failed to generate OpenAPI documentation for ${apiName}:`,
        error,
      );
      throw new Error(`OpenAPI generation failed: ${error.message}`);
    }
  }

  /**
   * Get authorization headers for API request
   */
  getAuthHeaders(apiName: string): Record<string, string> {
    const config = this.apiCredentials[apiName];

    if (!config) {
      throw new Error(`API configuration not found: ${apiName}`);
    }

    // Parse AuthKey format: "AuthorizationType: Value"
    const [authType, authValue] = config.AuthKey.split(': ');

    return {
      [authType]: authValue,
    };
  }

  /**
   * Get API base URL
   */
  getAPIBaseUrl(apiName: string): string {
    const config = this.apiCredentials[apiName];

    if (!config) {
      throw new Error(`API configuration not found: ${apiName}`);
    }

    return config.APIUrl;
  }

  /**
   * Test API connectivity
   */
  async testAPIConnection(apiName: string): Promise<boolean> {
    const config = this.apiCredentials[apiName];

    if (!config) {
      throw new Error(`API configuration not found: ${apiName}`);
    }

    try {
      const headers = this.getAuthHeaders(apiName);
      const baseUrl = new URL(config.APIUrl);

      // Simple connectivity test
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.timeout || 30000,
      );

      const response = await fetch(baseUrl.origin, {
        method: 'HEAD',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      this.logger.error(`API connectivity test failed for ${apiName}:`, error);
      return false;
    }
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

  /**
   * Cache management
   */
  private isCacheValid(apiName: string): boolean {
    const expiry = this.cacheExpiry.get(apiName);
    if (!expiry) return false;

    return Date.now() < expiry;
  }

  private cacheDocumentation(apiName: string, documentation: any): void {
    this.docsCache.set(apiName, documentation);
    this.cacheExpiry.set(apiName, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear documentation cache
   */
  clearDocumentationCache(apiName?: string): void {
    if (apiName) {
      this.docsCache.delete(apiName);
      this.cacheExpiry.delete(apiName);
    } else {
      this.docsCache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Manually register an API (used for internal API integration)
   */
  registerAPI(config: ExternalAPIConfig): void {
    try {
      this.validateAPIConfig(config);
      this.apiCredentials[config.name] = config;
      this.logger.log(`Manually registered API: ${config.name}`);
    } catch (error) {
      this.logger.error(`Failed to register API ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Unregister an API
   */
  unregisterAPI(apiName: string): void {
    if (this.apiCredentials[apiName]) {
      delete this.apiCredentials[apiName];
      this.clearDocumentationCache(apiName);
      this.logger.log(`Unregistered API: ${apiName}`);
    }
  }

  /**
   * Refresh API credentials from environment
   */
  refreshAPICredentials(): void {
    this.apiCredentials = {};
    this.clearDocumentationCache();
    this.loadAPICredentials();
  }
}
