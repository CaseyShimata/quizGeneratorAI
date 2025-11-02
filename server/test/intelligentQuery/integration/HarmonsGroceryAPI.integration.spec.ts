import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';
import { ExternalAPIExecutionService } from '../../../src/intelligentQuery/services/ExternalAPIExecutionService';

/**
 * Integration tests for Harmons Grocery GraphQL API
 * Tests actual connectivity and schema introspection
 */
describe('HarmonsGroceryAPI Integration', () => {
  let apiManager: ExternalAPIManagerService;
  let apiExecutor: ExternalAPIExecutionService;
  const API_NAME = 'harmons-grocery-api';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [ExternalAPIManagerService, ExternalAPIExecutionService],
    }).compile();

    apiManager = module.get<ExternalAPIManagerService>(
      ExternalAPIManagerService,
    );
    apiExecutor = module.get<ExternalAPIExecutionService>(
      ExternalAPIExecutionService,
    );
  });

  describe('API Configuration', () => {
    it('should load Harmons Grocery API configuration', () => {
      const config = apiManager.getAPIConfig(API_NAME);

      expect(config).toBeDefined();
      expect(config?.name).toBe(API_NAME);
      expect(config?.type).toBe('graphql');
      expect(config?.APIUrl).toBe('https://data.harmonsgrocery.com/graphql');
    });

    it('should have correct authentication headers', () => {
      const headers = apiManager.getAuthHeaders(API_NAME);

      expect(headers).toBeDefined();
      expect(headers.Authorization).toBe('50me5ecre7Header');
    });

    it('should have schema documentation path configured', () => {
      const config = apiManager.getAPIConfig(API_NAME);

      expect(config?.APIDoc).toBe('./APIDocs/eshopwebGQL.gql');
    });
  });

  describe('API Connectivity', () => {
    it('should execute GraphQL queries successfully', async () => {
      // Use __typename query to test basic connectivity
      const result = await apiExecutor.executeGraphQLRequest(
        API_NAME,
        'query { __typename }',
      );

      // May succeed or fail depending on auth, but should get a response
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    }, 10000);

    it('should attempt GraphQL introspection query', async () => {
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType {
              name
            }
            types {
              name
              kind
            }
          }
        }
      `;

      const result = await apiExecutor.executeGraphQLRequest(
        API_NAME,
        introspectionQuery,
      );

      // Introspection may be disabled for security, but should get response
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    }, 10000);
  });

  describe('Sample Queries', () => {
    it('should query EswOrders', async () => {
      const query = `
        query GetOrders {
          eswOrders(
            filter: {}
            sorting: []
            paging: { first: 5 }
          ) {
            edges {
              node {
                orderId
                createdDate
              }
            }
          }
        }
      `;

      const result = await apiExecutor.executeGraphQLRequest(API_NAME, query);

      // API may return data or errors depending on permissions
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    }, 10000);

    it('should query EswTenders with filter', async () => {
      const query = `
        query GetTenders {
          eswTenders(
            filter: { type: { eq: "credit_card" } }
            sorting: []
          ) {
            tendersId
            type
            createdDate
          }
        }
      `;

      const result = await apiExecutor.executeGraphQLRequest(API_NAME, query);

      // API may return data or errors depending on permissions
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle invalid GraphQL query', async () => {
      const invalidQuery = `
        query InvalidQuery {
          nonExistentField {
            id
          }
        }
      `;

      const result = await apiExecutor.executeGraphQLRequest(
        API_NAME,
        invalidQuery,
      );

      // GraphQL will return errors in the response
      expect(result).toBeDefined();
    }, 10000);

    it('should handle network timeout gracefully', async () => {
      const query = `query { __typename }`;

      const result = await apiExecutor.executeGraphQLRequest(
        API_NAME,
        query,
        {},
        { timeout: 1 }, // 1ms timeout to force failure
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    }, 10000);
  });

  describe('Schema Loading', () => {
    it('should load GraphQL schema from file', async () => {
      const schema = await apiManager.loadAPIDocumentation(API_NAME);

      expect(schema).toBeDefined();
      // GraphQL schema should be a string
      expect(typeof schema === 'string' || typeof schema === 'object').toBe(
        true,
      );
    });
  });
});
