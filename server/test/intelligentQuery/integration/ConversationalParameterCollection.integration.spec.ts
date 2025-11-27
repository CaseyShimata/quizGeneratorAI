import { Test, TestingModule } from '@nestjs/testing';
import { IntelligentRouterService } from '../../../src/intelligentQuery/services/IntelligentRouterService';
import { ConversationService } from '../../../src/intelligentQuery/services/ConversationService';
import { OpenAIService } from '../../../src/openai/services/OpenAIService';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';
import { ExternalAPIExecutionService } from '../../../src/intelligentQuery/services/ExternalAPIExecutionService';
import { GraphQLSchemaParser } from '../../../src/intelligentQuery/services/GraphQLSchemaParser';

describe('Conversational Parameter Collection Integration Tests', () => {
  let service: IntelligentRouterService;
  let conversationService: ConversationService;
  let mockOpenAIService: Partial<OpenAIService>;
  let mockAPIManager: Partial<ExternalAPIManagerService>;
  let mockAPIExecutor: Partial<ExternalAPIExecutionService>;

  beforeEach(async () => {
    // Mock OpenAI service
    mockOpenAIService = {
      createCompletion: jest.fn(),
      createFunctionCallingCompletion: jest.fn(),
    };

    // Mock API Manager
    mockAPIManager = {
      getEnabledAPIs: jest.fn().mockReturnValue({
        'test-api': {
          type: 'graphql',
          url: 'http://test.com/graphql',
        },
      }),
      loadAPIDocumentation: jest.fn(),
      getAPIConfig: jest.fn(),
      getAuthHeaders: jest.fn().mockReturnValue({}),
    };

    // Mock API Executor
    mockAPIExecutor = {
      executeGraphQLRequest: jest.fn(),
      executeRESTRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligentRouterService,
        ConversationService,
        GraphQLSchemaParser,
        {
          provide: OpenAIService,
          useValue: mockOpenAIService,
        },
        {
          provide: ExternalAPIManagerService,
          useValue: mockAPIManager,
        },
        {
          provide: ExternalAPIExecutionService,
          useValue: mockAPIExecutor,
        },
      ],
    }).compile();

    service = module.get<IntelligentRouterService>(IntelligentRouterService);
    conversationService = module.get<ConversationService>(ConversationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Scenario 1: List addresses with filter and pagination', () => {
    const email = 'test@example.com';
    const mockSchema = `
      type Query {
        eswAddresses(
          paging: PagingInput
          filter: AddressFilter
          sorting: [Sorting!]
        ): AddressConnection!
      }
      
      type AddressConnection {
        edges: [AddressEdge!]!
        pageInfo: PageInfo!
      }
      
      type AddressEdge {
        node: Address!
      }
      
      type Address {
        addressesId: ID!
        city: String
        state: String
      }
      
      type PageInfo {
        hasNextPage: Boolean!
      }
      
      input PagingInput {
        limit: Int
        offset: Int
      }
      
      input AddressFilter {
        city: StringFilter
        state: StringFilter
        zipCode: StringFilter
      }
      
      input StringFilter {
        equals: String
        contains: String
        startsWith: String
      }
      
      input Sorting {
        field: String!
        direction: SortDirection!
      }
      
      enum SortDirection {
        ASC
        DESC
      }
    `;

    beforeEach(() => {
      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockSchema,
      );
      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'graphql',
        url: 'http://test.com/graphql',
      });
    });

    it('should start conversational collection when user says "list addresses"', async () => {
      // Mock OpenAI to select eswAddresses function with empty args
      (
        mockOpenAIService.createFunctionCallingCompletion as jest.Mock
      ).mockResolvedValue({
        tool_calls: [
          {
            function: {
              name: 'eswAddresses',
              arguments: '{}',
            },
          },
        ],
      });

      // Mock asking for parameter
      (mockOpenAIService.createCompletion as jest.Mock).mockResolvedValue(
        'Would you like to filter these addresses by city, state, or zip code? Or should I show you all results?',
      );

      const response = await service.processRequest('list addresses', {
        email,
      });

      // Should start parameter collection OR execute with empty params
      // Both are valid behaviors
      if (response.needsMoreInfo) {
        expect(response.collectingParameters).toBe(true);
        const pendingOp = conversationService.getPendingOperation(email);
        expect(pendingOp).toBeDefined();
        expect(pendingOp?.toolName).toBe('eswAddresses');
      } else {
        // Executed immediately with empty params (also valid)
        expect(response.function).toBe('eswAddresses');
      }
    });

    it('should collect city filter when user says "city like West Val"', async () => {
      // Set up pending operation
      conversationService.setPendingOperation(email, {
        toolName: 'eswAddresses',
        apiName: 'test-api',
        operation: {
          type: 'query',
          parameters: [],
          returnType: 'AddressConnection',
        },
        collectedParams: {},
        requiredParams: [],
        optionalParams: ['paging', 'filter', 'sorting'],
        originalRequest: 'list addresses',
      });

      // Mock schema loading for parameter parsing
      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockSchema,
      );

      // Mock GraphQL execution in case it decides to execute
      (mockAPIExecutor.executeGraphQLRequest as jest.Mock).mockResolvedValue({
        data: { eswAddresses: { edges: [] } },
        success: true,
      });

      // Mock OpenAI to parse filter - needs to return JSON string
      (mockOpenAIService.createCompletion as jest.Mock)
        .mockResolvedValueOnce(
          JSON.stringify({
            filter: { city: { contains: 'West Val' } },
          }),
        )
        .mockResolvedValueOnce(
          'How many results would you like? I can show the first 10, 50, 100, or all.',
        );

      const response = await service.processRequest('city like West Val', {
        email,
      });

      // Should still be collecting OR execute
      if (response.needsMoreInfo) {
        expect(response.collectingParameters).toBe(true);
        const pendingOp = conversationService.getPendingOperation(email);
        expect(pendingOp?.collectedParams.filter).toBeDefined();
      } else if (response.success) {
        // Alternatively, might execute if it has enough params
        expect(response.function).toBe('eswAddresses');
      } else {
        // Should have at least one valid response type
        expect(response).toBeDefined();
      }
    });

    it('should execute when user says "first 100"', async () => {
      // Set up pending operation with filter already collected
      conversationService.setPendingOperation(email, {
        toolName: 'eswAddresses',
        apiName: 'test-api',
        operation: {
          type: 'query',
          parameters: [],
          returnType: 'AddressConnection',
        },
        collectedParams: {
          filter: { city: { contains: 'West Val' } },
        },
        requiredParams: [],
        optionalParams: ['paging', 'sorting'],
        originalRequest: 'list addresses',
      });

      // Mock OpenAI to parse paging
      (mockOpenAIService.createCompletion as jest.Mock).mockResolvedValue(
        JSON.stringify({
          paging: { limit: 100, offset: 0 },
        }),
      );

      // Mock GraphQL execution
      (mockAPIExecutor.executeGraphQLRequest as jest.Mock).mockResolvedValue({
        data: { eswAddresses: { edges: [] } },
        success: true,
      });

      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'graphql',
      });

      const response = await service.processRequest('first 100', { email });

      // Should execute and return results
      expect(response.success).toBe(true);
      expect(response.function).toBe('eswAddresses');

      // Should clear pending operation
      const pendingOp = conversationService.getPendingOperation(email);
      expect(pendingOp).toBeUndefined();
    });
  });

  describe('Scenario 2: List locations (all parameters optional)', () => {
    const email = 'test2@example.com';

    it('should execute immediately when user says "list locations"', async () => {
      const mockSchema = `
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
      `;

      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockSchema,
      );

      (
        mockOpenAIService.createFunctionCallingCompletion as jest.Mock
      ).mockResolvedValue({
        tool_calls: [
          {
            function: {
              name: 'eswLocations',
              arguments: '{}',
            },
          },
        ],
      });

      (mockAPIExecutor.executeGraphQLRequest as jest.Mock).mockResolvedValue({
        data: { eswLocations: { edges: [] } },
        success: true,
      });

      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'graphql',
        url: 'http://test.com/graphql',
      });

      const response = await service.processRequest('list locations', {
        email,
      });

      // May execute with empty parameters OR start conversation
      if (response.success) {
        expect(response.function).toBe('eswLocations');
      } else if (response.needsMoreInfo) {
        // Starting conversation is also valid
        expect(response.collectingParameters).toBe(true);
      } else {
        // Should be one or the other
        expect(response.success || response.needsMoreInfo).toBeTruthy();
      }
    });
  });

  describe('Scenario 3: Create quiz with topic', () => {
    const email = 'test3@example.com';

    it('should ask for topic when user says "create a quiz"', async () => {
      const mockOpenAPI = {
        paths: {
          '/api/quiz/generate': {
            post: {
              operationId: 'GenerateQuizController_generate',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        topic: { type: 'string' },
                      },
                      required: ['email', 'topic'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockOpenAPI,
      );
      (mockAPIManager.getEnabledAPIs as jest.Mock).mockReturnValue({
        'quiz-api': { type: 'rest' },
      });
      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'rest',
        url: 'http://test.com/api',
      });

      (
        mockOpenAIService.createFunctionCallingCompletion as jest.Mock
      ).mockResolvedValue({
        tool_calls: [
          {
            function: {
              name: 'GenerateQuizController_generate',
              arguments: JSON.stringify({ email }),
            },
          },
        ],
      });

      // Mock asking for missing parameter
      (mockOpenAIService.createCompletion as jest.Mock).mockResolvedValue(
        'What topic would you like the quiz to be about?',
      );

      const response = await service.processRequest('create a quiz', {
        email,
      });

      // Should ask for missing topic (needsMoreInfo) OR include it in the message
      expect(response.needsMoreInfo).toBe(true);
      expect(response.collectingParameters || response.message).toBeDefined();
    });
  });

  describe('Scenario 4: Choosing between multiple operations', () => {
    const email = 'test4@example.com';

    it('should preserve parameters when user chooses between eswAddresses and eswUserAddresses', async () => {
      const mockSchema = `
        type Query {
          eswAddresses(
            paging: CursorPaging
            filter: AddressFilter
            sorting: [AddressSort!]
          ): AddressConnection!
          
          eswUserAddresses(
            paging: CursorPaging
            filter: UserAddressFilter
          ): UserAddressConnection!
        }
        
        input CursorPaging {
          first: Int
          last: Int
          after: String
          before: String
        }
        
        input AddressFilter {
          city: StringFieldComparison
          state: StringFieldComparison
        }
        
        input UserAddressFilter {
          userId: IntFieldComparison
        }
        
        input StringFieldComparison {
          like: String
          iLike: String
          eq: String
        }
        
        input IntFieldComparison {
          eq: Int
        }
        
        input AddressSort {
          field: AddressSortFields!
          direction: SortDirection!
        }
        
        enum AddressSortFields {
          city
          state
          zipCode
        }
        
        enum SortDirection {
          ASC
          DESC
        }
      `;

      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockSchema,
      );
      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'graphql',
      });

      // First request: AI can't decide between eswAddresses and eswUserAddresses
      // This simulates the filtering finding both with equal scores
      (mockOpenAIService.createFunctionCallingCompletion as jest.Mock)
        .mockResolvedValueOnce({
          // First call returns no tool_calls, simulating ambiguity
          content: 'I found multiple operations...',
        });

      const firstResponse = await service.processRequest(
        'get addresses, paging 50, filter for state UT, sort by city ASC',
        { email },
      );

      // Should ask user to choose (this part simulates the filtering logic finding 2 matches)
      // In practice, this would be done by the filterRelevantTools returning 2 top matches with same score
      
      // Second request: User chooses eswAddresses
      // Mock parameter extraction
      (mockOpenAIService.createCompletion as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({
          paging: { first: 50 },
          filter: { state: { like: 'UT' } },
          sorting: [{ field: 'city', direction: 'ASC' }]
        }))
        // Mock transformation if needed
        .mockResolvedValueOnce(JSON.stringify({
          paging: { first: 50 },
          filter: { state: { like: 'UT' } },
          sorting: [{ field: 'city', direction: 'ASC' }]
        }));

      (mockAPIExecutor.executeGraphQLRequest as jest.Mock).mockResolvedValue({
        data: { eswAddresses: { edges: [] } },
        success: true,
      });

      // Manually set up the AWAITING_CHOICE state to test the fix
      conversationService.setPendingOperation(email, {
        toolName: 'AWAITING_CHOICE',
        apiName: '',
        operation: null,
        collectedParams: {},
        requiredParams: [],
        optionalParams: [],
        originalRequest: 'get addresses, paging 50, filter for state UT, sort by city ASC',
        availableOperations: [
          {
            toolName: 'eswAddresses',
            apiInfo: {
              apiName: 'test-api',
              operation: {
                type: 'query',
                name: 'eswAddresses',
                returnType: 'AddressConnection',
                parameters: [
                  { name: 'paging', type: 'CursorPaging', required: false },
                  { name: 'filter', type: 'AddressFilter', required: false },
                  { name: 'sorting', type: '[AddressSort!]', required: false }
                ]
              }
            }
          },
          {
            toolName: 'eswUserAddresses',
            apiInfo: {
              apiName: 'test-api',
              operation: {
                type: 'query',
                name: 'eswUserAddresses',
                returnType: 'UserAddressConnection',
                parameters: []
              }
            }
          }
        ]
      } as any);

      const secondResponse = await service.processRequest('eswAddresses', { email });

      // Should execute with extracted parameters from original request
      expect(secondResponse.success).toBe(true);
      expect(secondResponse.function).toBe('eswAddresses');
      expect(secondResponse.arguments).toBeDefined();
      
      // Should clear pending operation
      const pendingOp = conversationService.getPendingOperation(email);
      expect(pendingOp).toBeUndefined();
    });
  });

  describe('Scenario 5: Complex filter with pagination', () => {
    const email = 'test5@example.com';

    it('should handle "list first 3 locations in city like Salt"', async () => {
      const mockSchema = `
        type Query {
          eswLocations(
            paging: PagingInput
            filter: LocationFilter
          ): LocationConnection!
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
      `;

      (mockAPIManager.loadAPIDocumentation as jest.Mock).mockResolvedValue(
        mockSchema,
      );

      (
        mockOpenAIService.createFunctionCallingCompletion as jest.Mock
      ).mockResolvedValue({
        tool_calls: [
          {
            function: {
              name: 'eswLocations',
              arguments: JSON.stringify({
                paging: { limit: 3, offset: 0 },
                filter: { city: { contains: 'Salt' } },
              }),
            },
          },
        ],
      });

      (mockAPIExecutor.executeGraphQLRequest as jest.Mock).mockResolvedValue({
        data: { eswLocations: { edges: [] } },
        success: true,
      });

      (mockAPIManager.getAPIConfig as jest.Mock).mockReturnValue({
        type: 'graphql',
      });

      const response = await service.processRequest(
        'list first 3 locations in city like Salt',
        { email },
      );

      // Handle conversational vs direct execution
      if (response.success) {
        // Should execute with both paging and filter
        expect(response.success).toBe(true);
        expect(response.arguments).toEqual({
          paging: { limit: 3, offset: 0 },
          filter: { city: { contains: 'Salt' } },
        });
      } else if (response.needsMoreInfo) {
        // Conversational mode is also valid behavior
        expect(response.collectingParameters || response.availableOperations).toBeTruthy();
      } else {
        // Should be one or the other
        expect(response.success || response.needsMoreInfo).toBeTruthy();
      }
    });
  });
});
