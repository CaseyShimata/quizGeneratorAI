import { Test, TestingModule } from '@nestjs/testing';
import { ExternalAPIExecutionService } from '../../../src/intelligentQuery/services/ExternalAPIExecutionService';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';

describe('ExternalAPIExecutionService', () => {
  let service: ExternalAPIExecutionService;
  let apiManager: ExternalAPIManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAPIExecutionService,
        {
          provide: ExternalAPIManagerService,
          useValue: {
            getAPIConfig: jest.fn(),
            getAuthHeaders: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExternalAPIExecutionService>(
      ExternalAPIExecutionService,
    );
    apiManager = module.get<ExternalAPIManagerService>(
      ExternalAPIManagerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeRESTRequest', () => {
    it('should execute a successful REST request', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);
      jest.spyOn(apiManager, 'getAuthHeaders').mockReturnValue({
        Authorization: 'Bearer token123',
      });

      // Mock fetch for successful response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: () => Promise.resolve({ success: true, data: 'test response' }),
      });

      const result = await service.executeRESTRequest('test-api', '/users');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true, data: 'test response' });
      expect(result.statusCode).toBe(200);
      expect(result.executionTime).toBeDefined();
    });

    it('should handle REST API errors', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      // Mock fetch for error response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const result = await service.executeRESTRequest('test-api', '/users');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 404');
      expect(result.statusCode).toBe(404);
    });

    it('should handle API configuration not found', async () => {
      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(null);

      const result = await service.executeRESTRequest(
        'nonexistent-api',
        '/users',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API configuration not found');
    });

    it('should handle wrong API type', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'graphql' as const,
        APIUrl: 'https://api.example.com/graphql',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      const result = await service.executeRESTRequest('test-api', '/users');

      expect(result.success).toBe(false);
      expect(result.error).toContain('is not a REST API');
    });
  });

  describe('executeGraphQLRequest', () => {
    it('should execute a successful GraphQL request', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'graphql' as const,
        APIUrl: 'https://api.example.com/graphql',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      const testQuery = `
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `;

      // Mock fetch for successful response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: '1',
                name: 'Test User',
              },
            },
          }),
      });

      const result = await service.executeGraphQLRequest(
        'test-api',
        testQuery,
        { id: '1' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        data: {
          user: {
            id: '1',
            name: 'Test User',
          },
        },
      });
      expect(result.statusCode).toBe(200);
    });

    it('should handle GraphQL API errors', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'graphql' as const,
        APIUrl: 'https://api.example.com/graphql',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      // Mock fetch for error response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      const result = await service.executeGraphQLRequest(
        'test-api',
        'query { invalid }',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
      expect(result.statusCode).toBe(400);
    });
  });

  describe('executeBatchRequests', () => {
    it('should execute multiple requests in parallel', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      // Mock fetch for successful responses
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: () => Promise.resolve({ success: true }),
      });

      const requests = [
        {
          apiName: 'test-api',
          type: 'rest' as const,
          endpoint: '/users',
        },
        {
          apiName: 'test-api',
          type: 'rest' as const,
          endpoint: '/posts',
        },
      ];

      const results = await service.executeBatchRequests(requests);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('testAPIConnection', () => {
    it('should test REST API connectivity', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      // Mock fetch for successful connection test
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('OK'),
      });

      const result = await service.testAPIConnection('test-api');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should handle connection test failures', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      jest.spyOn(apiManager, 'getAPIConfig').mockReturnValue(mockConfig);

      // Mock fetch for connection failure
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      const result = await service.testAPIConnection('test-api');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');
    });
  });
});
