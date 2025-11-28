import { Test, TestingModule } from '@nestjs/testing';
import { IntelligentRouterService } from '../../../src/intelligentQuery/services/IntelligentRouterService';
import { ConversationService } from '../../../src/intelligentQuery/services/ConversationService';
import { OpenAIService } from '../../../src/openai/services/OpenAIService';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';
import { ExternalAPIExecutionService } from '../../../src/intelligentQuery/services/ExternalAPIExecutionService';
import { GraphQLSchemaParser } from '../../../src/intelligentQuery/services/GraphQLSchemaParser';

describe('IntelligentRouterService - GraphQL Query Building', () => {
  let service: IntelligentRouterService;
  let mockAPIExecutor: any;
  let mockAPIManager: any;

  beforeEach(async () => {
    mockAPIExecutor = {
      executeGraphQLRequest: jest.fn(),
    };

    mockAPIManager = {
      getEnabledAPIs: jest.fn().mockReturnValue({
        'test-api': { type: 'graphql', url: 'http://test.com/graphql' },
      }),
      loadAPIDocumentation: jest.fn().mockResolvedValue(`
        type Query {
          eswLocations(
            paging: PagingInput
            filter: LocationFilter
          ): LocationConnection!
        }
        
        type LocationConnection {
          edges: [LocationEdge!]!
          pageInfo: PageInfo!
        }
        
        type LocationEdge {
          node: Location!
        }
        
        type Location {
          locationsId: ID!
          name: String
        }
        
        type PageInfo {
          hasNextPage: Boolean!
        }
        
        input PagingInput {
          limit: Int
          offset: Int
        }
        
        input LocationFilter {
          city: StringFilter
        }
        
        input StringFilter {
          contains: String
        }
      `),
      getAPIConfig: jest.fn().mockReturnValue({
        type: 'graphql',
        url: 'http://test.com/graphql',
      }),
      getAuthHeaders: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligentRouterService,
        ConversationService,
        GraphQLSchemaParser,
        { provide: OpenAIService, useValue: {} },
        { provide: ExternalAPIManagerService, useValue: mockAPIManager },
        { provide: ExternalAPIExecutionService, useValue: mockAPIExecutor },
      ],
    }).compile();

    service = module.get<IntelligentRouterService>(IntelligentRouterService);
  });

  it('should build correct GraphQL query with paging parameter', async () => {
    mockAPIExecutor.executeGraphQLRequest.mockResolvedValue({
      data: { eswLocations: { edges: [] } },
      success: true,
    });

    // Access private method through reflection for testing
    const getAllAPITools = (service as any).getAllAPITools.bind(service);
    const { apiToolMap } = await getAllAPITools();

    const executeToolCall = (service as any).executeToolCall.bind(service);
    await executeToolCall(
      'eswLocations',
      { paging: { limit: 10, offset: 0 } },
      apiToolMap,
      { email: 'test@example.com' },
    );

    // Check what query was built
    expect(mockAPIExecutor.executeGraphQLRequest).toHaveBeenCalledTimes(1);
    const [apiName, query, variables] =
      mockAPIExecutor.executeGraphQLRequest.mock.calls[0];

    expect(apiName).toBe('test-api');

    // Query should have properly formatted inline arguments, NOT variables
    expect(query).toContain('paging: {limit: 10, offset: 0}');
    expect(query).not.toContain('[object Object]');

    // Should be a valid GraphQL query
    expect(query).toMatch(/query\s*\{/);
    expect(query).toMatch(/eswLocations/);

    console.log('Generated Query:', query);
    console.log('Variables:', variables);
  });

  it('should build correct GraphQL query with nested filter', async () => {
    mockAPIExecutor.executeGraphQLRequest.mockResolvedValue({
      data: { eswLocations: { edges: [] } },
      success: true,
    });

    const getAllAPITools = (service as any).getAllAPITools.bind(service);
    const { apiToolMap } = await getAllAPITools();

    const executeToolCall = (service as any).executeToolCall.bind(service);
    await executeToolCall(
      'eswLocations',
      {
        paging: { limit: 10, offset: 0 },
        filter: { city: { contains: 'Salt' } },
      },
      apiToolMap,
      { email: 'test@example.com' },
    );

    const [, query] = mockAPIExecutor.executeGraphQLRequest.mock.calls[0];

    expect(query).toContain('paging: {limit: 10, offset: 0}');
    // Allow both quoted and unquoted strings
    expect(query).toMatch(/filter: \{city: \{contains: (?:"Salt"|Salt)\}\}/);
    expect(query).not.toContain('[object Object]');

    console.log('Generated Query with Filter:', query);
  });
});
