import { Injectable, Logger } from '@nestjs/common';
import {
  ExternalAPIManagerService,
  ExternalAPIConfig,
} from './ExternalAPIManagerService';

/**
 * External API Execution Service
 * Handles HTTP requests to external REST and GraphQL APIs
 * Manages authentication, retries, timeouts, and response processing
 */

export interface APIRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  executionTime?: number;
}

@Injectable()
export class ExternalAPIExecutionService {
  private readonly logger = new Logger(ExternalAPIExecutionService.name);

  constructor(private readonly apiManager: ExternalAPIManagerService) {}

  /**
   * Execute REST API request
   */
  async executeRESTRequest(
    apiName: string,
    endpoint: string,
    options: APIRequestOptions = {},
  ): Promise<APIResponse> {
    const startTime = Date.now();

    try {
      const config = this.apiManager.getAPIConfig(apiName);
      if (!config) {
        throw new Error(`API configuration not found: ${apiName}`);
      }

      if (config.type !== 'rest') {
        throw new Error(`API ${apiName} is not a REST API`);
      }

      const url = this.buildRESTUrl(
        config,
        endpoint,
        options.method,
        options.body,
      );
      const requestOptions = this.buildRequestOptions(config, options);

      // Remove body for GET/HEAD requests (params already in URL)
      if (['GET', 'HEAD'].includes(options.method?.toUpperCase() || 'GET')) {
        delete requestOptions.body;
      }

      this.logger.debug(
        `Executing REST request to ${apiName}: ${options.method || 'GET'} ${url}`,
      );

      const response = await this.makeHttpRequest(url, requestOptions);

      const executionTime = Date.now() - startTime;

      if (response.ok) {
        const data = await this.parseResponse(response);
        this.logger.debug(
          `REST request to ${apiName} succeeded in ${executionTime}ms`,
        );

        return {
          success: true,
          data,
          statusCode: response.status,
          headers: this.parseHeaders(response.headers),
          executionTime,
        };
      } else {
        const errorText = await response.text();
        this.logger.error(
          `REST request to ${apiName} failed: ${response.status} ${errorText}`,
        );

        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          statusCode: response.status,
          executionTime,
        };
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`REST request to ${apiName} threw error:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        executionTime,
      };
    }
  }

  /**
   * Execute GraphQL API request
   */
  async executeGraphQLRequest(
    apiName: string,
    query: string,
    variables?: Record<string, any>,
    options: APIRequestOptions = {},
  ): Promise<APIResponse> {
    const startTime = Date.now();

    try {
      const config = this.apiManager.getAPIConfig(apiName);
      if (!config) {
        throw new Error(`API configuration not found: ${apiName}`);
      }

      if (config.type !== 'graphql') {
        throw new Error(`API ${apiName} is not a GraphQL API`);
      }

      const url = config.APIUrl;
      const graphqlPayload = {
        query,
        variables: variables || {},
      };

      this.logger.log(`GraphQL Payload being sent to ${apiName}:`);
      this.logger.log(`Query: ${query}`);
      this.logger.log(`Variables: ${JSON.stringify(variables || {})}`);
      this.logger.log(
        `Full Payload: ${JSON.stringify(graphqlPayload, null, 2)}`,
      );

      const requestOptions: APIRequestOptions = {
        ...options, // Spread first
        method: 'POST',
        body: JSON.stringify(graphqlPayload),
        headers: {
          // Then set headers (will override any from options)
          'Content-Type': 'application/json',
          'x-apollo-operation-name': 'IntelligentQuery', // For CSRF protection
          ...(options.headers || {}), // Merge any additional headers from options
        },
      };

      const response = await this.makeHttpRequest(url, requestOptions);
      const executionTime = Date.now() - startTime;

      if (response.ok) {
        const data = await this.parseResponse(response);
        this.logger.debug(
          `GraphQL request to ${apiName} succeeded in ${executionTime}ms`,
        );

        return {
          success: true,
          data,
          statusCode: response.status,
          headers: this.parseHeaders(response.headers),
          executionTime,
        };
      } else {
        const errorText = await response.text();
        this.logger.error(
          `GraphQL request to ${apiName} failed: ${response.status} ${errorText}`,
        );

        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          statusCode: response.status,
          executionTime,
        };
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`GraphQL request to ${apiName} threw error:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        executionTime,
      };
    }
  }

  /**
   * Execute multiple API requests in parallel
   */
  async executeBatchRequests(
    requests: Array<{
      apiName: string;
      type: 'rest' | 'graphql';
      endpoint?: string;
      query?: string;
      variables?: Record<string, any>;
      options?: APIRequestOptions;
    }>,
  ): Promise<APIResponse[]> {
    const promises = requests.map((request) => {
      if (request.type === 'graphql' && request.query) {
        return this.executeGraphQLRequest(
          request.apiName,
          request.query,
          request.variables,
          request.options,
        );
      } else if (request.type === 'rest' && request.endpoint) {
        return this.executeRESTRequest(
          request.apiName,
          request.endpoint,
          request.options,
        );
      } else {
        return Promise.resolve({
          success: false,
          error: 'Invalid request configuration',
        });
      }
    });

    return Promise.all(promises);
  }

  /**
   * Test API connectivity and authentication
   */
  async testAPIConnection(apiName: string): Promise<APIResponse> {
    const config = this.apiManager.getAPIConfig(apiName);
    if (!config) {
      return {
        success: false,
        error: `API configuration not found: ${apiName}`,
      };
    }

    try {
      if (config.type === 'rest') {
        return await this.executeRESTRequest(apiName, '', {
          method: 'GET',
        });
      } else {
        // Simple GraphQL health check query
        return await this.executeGraphQLRequest(
          apiName,
          'query { __typename }',
        );
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build REST API URL with query parameters for GET requests
   */
  private buildRESTUrl(
    config: ExternalAPIConfig,
    endpoint: string,
    method?: string,
    body?: any,
  ): string {
    const baseUrl = config.APIUrl.endsWith('/')
      ? config.APIUrl.slice(0, -1)
      : config.APIUrl;

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let url = `${baseUrl}${cleanEndpoint}`;

    // For GET/HEAD requests, add body params as query string
    if (
      body &&
      typeof body === 'object' &&
      ['GET', 'HEAD'].includes(method?.toUpperCase() || '')
    ) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          // Serialize objects/arrays as JSON, primitives as strings
          const stringValue =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
          params.append(key, stringValue);
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Build request options with authentication and defaults
   */
  private buildRequestOptions(
    config: ExternalAPIConfig,
    options: APIRequestOptions,
  ): APIRequestOptions {
    const authHeaders = this.apiManager.getAuthHeaders(config.name);

    // Prepare headers and body
    const headers = {
      ...authHeaders,
      ...options.headers,
    };

    let body = options.body;

    // Stringify body for POST/PUT/PATCH requests with JSON content
    if (body && ['POST', 'PUT', 'PATCH'].includes(options.method || '')) {
      if (typeof body === 'object') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
    }

    return {
      method: options.method || 'GET',
      headers,
      body,
      timeout: options.timeout || config.timeout || 30000,
      retries: options.retries || config.retries || 3,
    };
  }

  /**
   * Make HTTP request with retry logic and timeout
   */
  private async makeHttpRequest(
    url: string,
    options: APIRequestOptions,
  ): Promise<Response> {
    const maxRetries = options.retries || 3;
    const timeout = options.timeout || 30000;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Log what's being sent to fetch
        this.logger.log(`fetch() being called with:`);
        this.logger.log(`URL: ${url}`);
        this.logger.log(
          `Options: ${JSON.stringify({ method: options.method, headers: options.headers, body: typeof options.body === 'string' ? options.body.substring(0, 200) : `[${typeof options.body}]` })}`,
        );

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        this.logger.warn(
          `Request attempt ${attempt} failed, retrying in ${delay}ms:`,
          error.message,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType.includes('text/')) {
      return await response.text();
    } else {
      // Return as text for unknown content types
      return await response.text();
    }
  }

  /**
   * Parse response headers
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of headers.entries()) {
      result[key] = value;
    }

    return result;
  }

  /**
   * Validate API response structure
   */
  validateResponse<T>(
    response: APIResponse<T>,
    expectedStructure?: any,
  ): boolean {
    if (!response.success || !response.data) {
      return false;
    }

    if (expectedStructure) {
      return this.validateResponseStructure(response.data, expectedStructure);
    }

    return true;
  }

  /**
   * Validate response structure recursively
   */
  private validateResponseStructure(data: any, structure: any): boolean {
    if (structure === null || structure === undefined) {
      return true;
    }

    if (typeof structure === 'object' && !Array.isArray(structure)) {
      if (typeof data !== 'object' || Array.isArray(data)) {
        return false;
      }

      for (const [key, value] of Object.entries(structure)) {
        if (!(key in data)) {
          return false;
        }

        if (!this.validateResponseStructure(data[key], value)) {
          return false;
        }
      }
    }

    return true;
  }
}
