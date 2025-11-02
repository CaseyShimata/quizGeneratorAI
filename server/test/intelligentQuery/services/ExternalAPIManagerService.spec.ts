import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('path');

describe('ExternalAPIManagerService', () => {
  let service: ExternalAPIManagerService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        EXTERNAL_API_TEST_REST_NAME: 'test-api',
        EXTERNAL_API_TEST_REST_TYPE: 'rest',
        EXTERNAL_API_TEST_REST_URL: 'https://api.example.com',
        EXTERNAL_API_TEST_REST_AUTH_KEY: 'Authorization: Bearer token123',
        EXTERNAL_API_TEST_REST_DOC_PATH: './test.json',
        EXTERNAL_API_TEST_REST_TIMEOUT: 30000,
        EXTERNAL_API_TEST_REST_RETRIES: 3,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock environment variables
    process.env.EXTERNAL_API_TEST_REST_NAME = 'test-api';

    // Mock fs.existsSync and mkdirSync
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAPIManagerService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ExternalAPIManagerService>(ExternalAPIManagerService);
  });

  afterEach(() => {
    delete process.env.EXTERNAL_API_TEST_REST_NAME;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllAPIs', () => {
    it('should return all configured APIs', () => {
      const apis = service.getAllAPIs();
      expect(apis).toBeDefined();
      expect(typeof apis).toBe('object');
    });
  });

  describe('getAPIConfig', () => {
    it('should return API configuration by name', () => {
      const config = service.getAPIConfig('test-api');
      expect(config).toBeDefined();
      expect(config?.name).toBe('test-api');
      expect(config?.type).toBe('rest');
      expect(config?.APIUrl).toBe('https://api.example.com');
    });

    it('should return null for non-existent API', () => {
      const config = service.getAPIConfig('nonexistent-api');
      expect(config).toBeNull();
    });
  });

  describe('getEnabledAPIs', () => {
    it('should return only enabled APIs', () => {
      const enabledAPIs = service.getEnabledAPIs();
      expect(enabledAPIs).toBeDefined();
      expect(typeof enabledAPIs).toBe('object');
    });
  });

  describe('isAPIEnabled', () => {
    it('should return true for enabled API', () => {
      const enabled = service.isAPIEnabled('test-api');
      expect(enabled).toBe(true);
    });

    it('should return false for non-existent API', () => {
      const enabled = service.isAPIEnabled('nonexistent-api');
      expect(enabled).toBe(false);
    });
  });

  describe('loadAPIDocumentation', () => {
    it('should load and cache API documentation', async () => {
      const mockDoc = { openapi: '3.0.0', info: { title: 'Test API' } };
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDoc));
      (path.resolve as jest.Mock).mockReturnValue('./test.json');
      (path.extname as jest.Mock).mockReturnValue('.json');

      const doc = await service.loadAPIDocumentation('test-api');
      expect(doc).toEqual(mockDoc);
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent API', async () => {
      await expect(
        service.loadAPIDocumentation('nonexistent-api'),
      ).rejects.toThrow('API configuration not found');
    });

    it('should use cached documentation on second call', async () => {
      const mockDoc = { openapi: '3.0.0', info: { title: 'Test API' } };
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDoc));
      (path.resolve as jest.Mock).mockReturnValue('./test.json');
      (path.extname as jest.Mock).mockReturnValue('.json');

      // First call
      await service.loadAPIDocumentation('test-api');
      const readCallCount = (fs.readFileSync as jest.Mock).mock.calls.length;

      // Second call should use cache
      await service.loadAPIDocumentation('test-api');
      expect((fs.readFileSync as jest.Mock).mock.calls.length).toBe(
        readCallCount,
      );
    });
  });

  describe('generateOpenAPIDocumentation', () => {
    it('should generate OpenAPI documentation', async () => {
      const mockConfig = {
        name: 'test-api',
        type: 'rest' as const,
        APIUrl: 'https://api.example.com',
        AuthKey: 'Authorization: Bearer token123',
        APIDoc: './test.json',
      };

      (path.join as jest.Mock).mockReturnValue('./APIDocs/test-api.json');
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const doc = await service.generateOpenAPIDocumentation(
        'test-api',
        mockConfig,
      );

      expect(doc).toBeDefined();
      expect(doc.openapi).toBe('3.0.0');
      expect(doc.info.title).toContain('test-api');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getAuthHeaders', () => {
    it('should return authorization headers', () => {
      const headers = service.getAuthHeaders('test-api');
      expect(headers).toBeDefined();
      expect(headers.Authorization).toBe('Bearer token123');
    });

    it('should throw error for non-existent API', () => {
      expect(() => service.getAuthHeaders('nonexistent-api')).toThrow(
        'API configuration not found',
      );
    });
  });

  describe('getAPIBaseUrl', () => {
    it('should return API base URL', () => {
      const url = service.getAPIBaseUrl('test-api');
      expect(url).toBe('https://api.example.com');
    });

    it('should throw error for non-existent API', () => {
      expect(() => service.getAPIBaseUrl('nonexistent-api')).toThrow(
        'API configuration not found',
      );
    });
  });

  describe('testAPIConnection', () => {
    it('should test API connectivity successfully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await service.testAPIConnection('test-api');
      expect(result).toBe(true);
    });

    it('should handle connection failures', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection error'));

      const result = await service.testAPIConnection('test-api');
      expect(result).toBe(false);
    });

    it('should throw error for non-existent API', async () => {
      await expect(
        service.testAPIConnection('nonexistent-api'),
      ).rejects.toThrow('API configuration not found');
    });
  });

  describe('clearDocumentationCache', () => {
    it('should clear cache for specific API', async () => {
      const mockDoc = { openapi: '3.0.0' };
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDoc));
      (path.resolve as jest.Mock).mockReturnValue('./test.json');
      (path.extname as jest.Mock).mockReturnValue('.json');

      // Load to cache
      await service.loadAPIDocumentation('test-api');

      // Clear cache
      service.clearDocumentationCache('test-api');

      // Should reload from file
      await service.loadAPIDocumentation('test-api');
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches when no API specified', () => {
      service.clearDocumentationCache();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('refreshAPICredentials', () => {
    it('should reload API credentials from environment', () => {
      service.refreshAPICredentials();
      const apis = service.getAllAPIs();
      expect(apis).toBeDefined();
    });
  });
});
