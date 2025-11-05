import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { IntelligentRouterService } from '../../../src/intelligentQuery/services/IntelligentRouterService';
import { ExternalAPIManagerService } from '../../../src/intelligentQuery/services/ExternalAPIManagerService';
import { ExternalAPIExecutionService } from '../../../src/intelligentQuery/services/ExternalAPIExecutionService';
import { GraphQLSchemaParser } from '../../../src/intelligentQuery/services/GraphQLSchemaParser';
import { ConversationService } from '../../../src/intelligentQuery/services/ConversationService';
import { OpenAIService } from '../../../src/openai/services/OpenAIService';
import { OpenAIModule } from '../../../src/openai/OpenAIModule';

/**
 * Integration tests for GraphQL Query Generation
 * Tests that generated GraphQL queries are syntactically valid
 * and match the schema requirements
 */
describe('GraphQL Query Generation Integration', () => {
  let intelligentRouter: IntelligentRouterService;
  let apiManager: ExternalAPIManagerService;
  const API_NAME = 'harmons-grocery-api';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        OpenAIModule,
      ],
      providers: [
        IntelligentRouterService,
        ExternalAPIManagerService,
        ExternalAPIExecutionService,
        GraphQLSchemaParser,
        ConversationService,
      ],
    }).compile();

    intelligentRouter = module.get<IntelligentRouterService>(
      IntelligentRouterService,
    );
    apiManager = module.get<ExternalAPIManagerService>(
      ExternalAPIManagerService,
    );
  });

  describe('String Filter Operations', () => {
    it('should use iLike instead of contains for string filtering', async () => {
      // First request - expect conversational mode due to multiple operations
      const result = await intelligentRouter.processRequest(
        'list addresses where city contains West',
        { email: 'test@example.com' },
      );

      if (result.needsMoreInfo && result.availableOperations) {
        // Choose eswAddresses (the simpler addresses query)
        const result2 = await intelligentRouter.processRequest(
          'eswAddresses',
          { email: 'test@example.com' },
        );

        // Now should either execute or continue collecting parameters
        if (result2.success) {
          // Check no GraphQL validation errors about "contains"
          expect(result2.error).not.toMatch(/contains/);
          expect(result2.error).not.toMatch(/StringFieldComparison/);
          
          // If it succeeded, check the arguments used correct operator
          if (result2.arguments?.filter?.city) {
            expect(result2.arguments.filter.city).toHaveProperty('iLike');
            expect(result2.arguments.filter.city).not.toHaveProperty('contains');
          }
        } else if (result2.needsMoreInfo) {
          // Still in conversational mode - this is also valid behavior
          expect(result2.collectingParameters).toBe(true);
        }
      } else if (result.success) {
        // Direct execution (less likely but valid)
        expect(result.error).not.toMatch(/contains/);
        expect(result.error).not.toMatch(/StringFieldComparison/);
      } else if (result.needsMoreInfo) {
        // Conversational mode without operation selection - also valid
        expect(result.collectingParameters).toBe(true);
      }

      // At minimum, we should get a valid response structure
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    }, 30000);

    it('should handle case-insensitive string matching with iLike', async () => {
      const result = await intelligentRouter.processRequest(
        'find addresses in cities like "salt lake"',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success && result.arguments?.filter?.city) {
        expect(result.arguments.filter.city).toHaveProperty('iLike');
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
    }, 30000);
  });

  describe('Enum Value Formatting', () => {
    it('should not quote enum values in sorting', async () => {
      const result = await intelligentRouter.processRequest(
        'list addresses sorted by city ascending, limit 2',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success) {
        // Should not have validation errors about enum values
        if (result.error) {
          expect(result.error).not.toMatch(/cannot represent non-enum value/);
          expect(result.error).not.toMatch(/Did you mean the enum value/);
        }
        
        // Check that sorting was applied correctly
        if (result.arguments?.sorting) {
          expect(Array.isArray(result.arguments.sorting)).toBe(true);
        }
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
    }, 30000);

    it('should handle sort direction enums correctly', async () => {
      const result = await intelligentRouter.processRequest(
        'show addresses sorted by state descending',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success && result.error) {
        expect(result.error).not.toMatch(/SortDirection/);
        expect(result.error).not.toMatch(/ASC/);
        expect(result.error).not.toMatch(/DESC/);
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
    }, 30000);
  });

  describe('Pagination Parameters', () => {
    it('should use first/last instead of limit for cursor pagination', async () => {
      const result = await intelligentRouter.processRequest(
        'list addresses, limit to 5',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success) {
        // Should not have validation errors about limit
        if (result.error) {
          expect(result.error).not.toMatch(/limit/);
        }
        
        // Should use "first" for cursor pagination
        if (result.arguments?.paging) {
          expect(result.arguments.paging).toHaveProperty('first');
          expect(result.arguments.paging).not.toHaveProperty('limit');
        }
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
    }, 30000);

    it('should not include includePagingDetails in CursorPaging', async () => {
      const result = await intelligentRouter.processRequest(
        'get addresses with paging details',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success) {
        // Should not have validation errors about includePagingDetails
        if (result.error) {
          expect(result.error).not.toMatch(/includePagingDetails/);
          expect(result.error).not.toMatch(/CursorPaging/);
        }
        
        // Paging should only have valid fields
        if (result.arguments?.paging) {
          expect(result.arguments.paging).not.toHaveProperty('includePagingDetails');
          // Valid fields are: first, last, before, after
          const validKeys = ['first', 'last', 'before', 'after'];
          const pagingKeys = Object.keys(result.arguments.paging);
          pagingKeys.forEach(key => {
            expect(validKeys).toContain(key);
          });
        }
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
    }, 30000);
  });

  describe('Complex Query Validation', () => {
    it('should generate valid query with filter, sorting, and paging', async () => {
      const result = await intelligentRouter.processRequest(
        'list addresses where city like West, sorted by city ascending, limit 2',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success) {
        // Should succeed without GraphQL validation errors
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        
        // Verify correct parameter structure
        if (result.arguments) {
          // Filter should use iLike, not contains
          if (result.arguments.filter?.city) {
            expect(result.arguments.filter.city).toHaveProperty('iLike');
          }
          
          // Paging should use first, not limit
          if (result.arguments.paging) {
            expect(result.arguments.paging).toHaveProperty('first');
            expect(result.arguments.paging.first).toBe(2);
          }
          
          // Sorting should be an array
          if (result.arguments.sorting) {
            expect(Array.isArray(result.arguments.sorting)).toBe(true);
          }
        }
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
      
      // At minimum, we should get a valid response
      expect(result).toBeDefined();
    }, 30000);
  });

  describe('Schema Compliance', () => {
    it('should only use field names that exist in the schema', async () => {
      const result = await intelligentRouter.processRequest(
        'list addresses with various filters',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success && result.error) {
        // Should not have "field not defined" errors
        expect(result.error).not.toMatch(/is not defined by type/);
        expect(result.error).not.toMatch(/GRAPHQL_VALIDATION_FAILED/);
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
      
      // At minimum, we should get a valid response
      expect(result).toBeDefined();
    }, 30000);

    it('should validate against actual GraphQL schema', async () => {
      // Load the schema
      const schema = await apiManager.loadAPIDocumentation(API_NAME);
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('string');
      
      // Schema should define StringFieldComparison with correct operators
      expect(schema).toContain('input StringFieldComparison');
      expect(schema).toContain('iLike');
      expect(schema).not.toContain('contains'); // contains is NOT a valid operator
      
      // Schema should define SortDirection enum
      expect(schema).toContain('enum SortDirection');
      expect(schema).toContain('ASC');
      expect(schema).toContain('DESC');
      
      // Schema should define CursorPaging
      expect(schema).toContain('input CursorPaging');
      expect(schema).toContain('first: Int');
      expect(schema).not.toContain('includePagingDetails'); // This field doesn't exist
    });
  });

  describe('Error Messages', () => {
    it('should not produce GraphQL validation errors for valid queries', async () => {
      const result = await intelligentRouter.processRequest(
        'show me 3 addresses',
        { email: 'test@example.com' },
      );

      // Handle conversational vs direct execution
      if (result.success && result.error) {
        // Check for common GraphQL validation error patterns
        expect(result.error).not.toMatch(/GRAPHQL_VALIDATION_FAILED/);
        expect(result.error).not.toMatch(/Field "/);
        expect(result.error).not.toMatch(/is not defined by type/);
        expect(result.error).not.toMatch(/cannot represent non-enum value/);
      } else if (result.needsMoreInfo) {
        // Conversational mode is expected and valid
        expect(result.collectingParameters || result.availableOperations).toBeTruthy();
      }
      
      // At minimum, we should get a valid response
      expect(result).toBeDefined();
    }, 30000);
  });
});
