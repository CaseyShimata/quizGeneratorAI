import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../../openai/services/OpenAIService';
import { PromptBuilder } from '../../openai/utils/promptBuilder';
import { ExternalAPIManagerService } from './ExternalAPIManagerService';
import { ExternalAPIExecutionService } from './ExternalAPIExecutionService';
import { ToolBuilder, OpenAITool } from '../../openai/tools/ToolBuilder';
import { GraphQLSchemaParser } from './GraphQLSchemaParser';
import { ConversationService } from './ConversationService';
/**
 * Intelligent Router Service
 * Routes requests to ANY API (internal or external) using OpenAPI documentation
 * No distinction between internal and external - all handled uniformly
 */
@Injectable()
export class IntelligentRouterService {
  private readonly logger = new Logger(IntelligentRouterService.name);
  private schemaCache: Map<string, string> = new Map(); // Cache loaded schemas

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly apiManager: ExternalAPIManagerService,
    private readonly apiExecutor: ExternalAPIExecutionService,
    private readonly graphQLParser: GraphQLSchemaParser,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Process natural language request and route to appropriate API
   */
  async processRequest(
    userPrompt: string,
    context?: Record<string, any>,
  ): Promise<any> {
    try {
      // Check if user has a pending operation (conversational parameter collection)
      const email = context?.email;
      if (email) {
        const pendingOp = this.conversationService.getPendingOperation(email);
        if (pendingOp) {
          this.logger.log(
            `Continuing parameter collection for ${pendingOp.toolName}`,
          );
          return await this.continueParameterCollection(
            email,
            userPrompt,
            pendingOp,
          );
        }
      }

      // Get all available APIs and build unified tool list
      const { tools, apiToolMap } = await this.getAllAPITools();

      if (tools.length === 0) {
        return {
          error:
            'No API endpoints available. Please configure APIs in .env or check internal API registration.',
        };
      }

      // Filter tools using DETERMINISTIC pre-filtering
      const { filteredTools, topMatches } = this.filterRelevantTools(
        tools,
        userPrompt,
        apiToolMap,
      );

      this.logger.log(
        `Filtered ${tools.length} tools down to ${filteredTools.length} relevant tools`,
      );

      // If we have multiple equally good matches, ask user to choose
      if (
        topMatches.length > 1 &&
        topMatches[0].score === topMatches[1].score
      ) {
        // Store the original request and available operations for later
        if (email) {
          this.conversationService.setPendingOperation(email, {
            toolName: 'AWAITING_CHOICE',
            apiName: '',
            operation: null,
            collectedParams: {},
            requiredParams: [],
            optionalParams: [],
            originalRequest: userPrompt,
            availableOperations: topMatches.map((m) => ({
              toolName: m.tool.function.name,
              apiInfo: apiToolMap.get(m.tool.function.name),
            })),
          } as any);
        }

        return {
          needsMoreInfo: true,
          collectingParameters: true,
          message: `I found ${topMatches.length} operations that could work. Which one would you like to use?`,
          options: topMatches.map((match) => {
            const info = apiToolMap.get(match.tool.function.name);
            const op = info?.operation;
            if (op?.type === 'query' || op?.type === 'mutation') {
              return `${match.tool.function.name} - ${op.type} returning ${op.returnType}`;
            }
            return `${match.tool.function.name} - ${match.tool.function.description || 'No description'}`;
          }),
          availableOperations: topMatches.map((m) => m.tool.function.name),
        };
      }

      // Build system prompt with schema information
      const filteredToolMap = new Map(
        Array.from(apiToolMap.entries()).filter(([name]) =>
          filteredTools.some((t) => t.function.name === name),
        ),
      );

      // Load GraphQL schemas for filtered tools to provide INPUT type definitions
      const schemaContext =
        await this.loadSchemaContextForTools(filteredToolMap);

      const systemPrompt = this.buildProgrammerSystemPrompt(
        filteredToolMap,
        schemaContext,
      );

      // Build messages
      const messages = PromptBuilder.buildMessages(systemPrompt, userPrompt);

      if (context) {
        messages.push({
          role: 'system',
          content: `Context: ${JSON.stringify(context, null, 2)}`,
        });
      }

      // Determine if this is an ACTION query (should call API) or INFORMATIONAL query (can respond with text)
      const promptLower = userPrompt.toLowerCase();
      const isActionQuery = promptLower.match(
        /\b(create|generate|make|list|show|get|update|modify|delete|remove|grade|submit)\b/,
      );

      // Get AI's routing decision - FORCE function calling ONLY for action queries
      const response = await this.openAIService.createFunctionCallingCompletion(
        messages,
        filteredTools,
        { temperature: 0.1, forceToolUse: !!isActionQuery },
      );

      // Execute the selected function
      if (response.tool_calls?.length) {
        const toolCall = response.tool_calls[0];

        if ('function' in toolCall) {
          return await this.executeToolCall(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            apiToolMap,
            { ...context, originalRequest: userPrompt },
          );
        }
      }

      return {
        message:
          response.content || 'No appropriate endpoint found for this request.',
      };
    } catch (error: any) {
      this.logger.error('Failed to process request:', error);
      return {
        error: error.message || 'Failed to process request',
      };
    }
  }

  /**
   * Filter tools to most relevant using DETERMINISTIC matching
   * Think like a programmer: match operation names to user intent
   */
  private filterRelevantTools(
    tools: OpenAITool[],
    userPrompt: string,
    apiToolMap: Map<string, { apiName: string; operation: any }>,
  ): {
    filteredTools: OpenAITool[];
    topMatches: Array<{ tool: OpenAITool; score: number }>;
  } {
    const MAX_TOOLS = 30;

    const promptLower = userPrompt.toLowerCase();

    // Extract entity keywords (likely represent data types)
    // EXCLUDE action words - those are handled separately
    const keywords = promptLower
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9]/g, '')) // Remove punctuation
      .filter((word) => word.length > 3)
      .filter(
        (word) =>
          ![
            'this',
            'that',
            'with',
            'from',
            'want',
            'need',
            'show',
            'list',
            'some',
            'like',
            'create',
            'update',
            'delete',
            'generate',
            'make',
            'build',
            'add',
          ].includes(word),
      );

    this.logger.log(`Extracted keywords: ${keywords.join(', ')}`);

    // DETERMINISTIC PRE-FILTERING: Eliminate obviously wrong operations
    const eligibleTools = tools.filter((tool) => {
      const toolName = tool.function.name.toLowerCase();

      // RULE 1: If user says "list" or "get", NEVER show aggregate/count/update/create/delete
      if (promptLower.match(/\b(list|get|show|find)\b/)) {
        if (
          toolName.includes('aggregate') ||
          toolName.includes('count') ||
          toolName.includes('update') ||
          toolName.includes('create') ||
          toolName.includes('delete') ||
          toolName.includes('remove')
        ) {
          this.logger.debug(`ELIMINATED (wrong action type): ${toolName}`);
          return false;
        }
      }

      // RULE 2: If user says "create" or "add", ONLY show create/add/insert operations
      if (promptLower.match(/\b(create|add)\b/)) {
        if (
          !toolName.includes('create') &&
          !toolName.includes('add') &&
          !toolName.includes('insert')
        ) {
          this.logger.debug(`ELIMINATED (not a create operation): ${toolName}`);
          return false;
        }
      }

      // RULE 3: Entity matching - operation must mention at least one keyword
      const hasKeywordMatch = keywords.some((keyword) =>
        toolName.includes(keyword),
      );
      if (keywords.length > 0 && !hasKeywordMatch) {
        this.logger.debug(`ELIMINATED (no entity match): ${toolName}`);
        return false;
      }

      return true;
    });

    this.logger.log(
      `After deterministic filtering: ${tools.length} → ${eligibleTools.length} tools`,
    );

    // Now score the eligible tools
    const scoredTools = eligibleTools.map((tool) => {
      let score = 0;
      const toolName = tool.function.name.toLowerCase();

      // Exact keyword match in operation name
      for (const keyword of keywords) {
        if (toolName === keyword) {
          score += 100; // Exact match!
        } else if (toolName.includes(keyword)) {
          score += 50; // Contains keyword
        }
      }

      // Boost simple query operations for read requests
      if (promptLower.match(/\b(list|get|show|find)\b/)) {
        // Prefer operations without "deep" or "aggregate" modifiers
        if (!toolName.includes('deep') && !toolName.includes('aggregate')) {
          score += 20;
        }
      }

      // Exact operation type match - BOOST SIGNIFICANTLY to avoid ties
      if (promptLower.includes('list') && toolName.startsWith('list'))
        score += 100;
      if (promptLower.includes('get') && toolName.startsWith('get'))
        score += 100;
      if (promptLower.includes('create') && toolName.startsWith('create'))
        score += 100;
      if (promptLower.includes('generate') && toolName.includes('generate'))
        score += 100;
      if (promptLower.includes('update') && toolName.startsWith('update'))
        score += 100;
      if (promptLower.includes('delete') && toolName.startsWith('delete'))
        score += 100;
      if (promptLower.includes('grade') && toolName.includes('grade'))
        score += 100;

      return { tool, score };
    });

    // Sort by score
    const sorted = scoredTools.sort((a, b) => b.score - a.score);

    // Log top matches for debugging
    this.logger.log(
      `Top 5 matches: ${sorted
        .slice(0, 5)
        .map((s) => `${s.tool.function.name}(${s.score})`)
        .join(', ')}`,
    );

    return {
      filteredTools: sorted.slice(0, MAX_TOOLS).map((s) => s.tool),
      topMatches: sorted.slice(0, 5), // Return top 5 for user choice if needed
    };
  }

  /**
   * Load GraphQL schema context for filtered tools
   * Extracts INPUT type definitions to help AI use correct field names
   */
  private async loadSchemaContextForTools(
    apiToolMap: Map<string, { apiName: string; operation: any }>,
  ): Promise<string> {
    const schemaContext: string[] = [];

    // Group operations by API to avoid loading schema multiple times
    const apiOperations = new Map<string, any[]>();

    for (const [, info] of apiToolMap.entries()) {
      if (!apiOperations.has(info.apiName)) {
        apiOperations.set(info.apiName, []);
      }
      apiOperations.get(info.apiName)!.push(info.operation);
    }

    // Load schema for each GraphQL API
    for (const [apiName, operations] of apiOperations.entries()) {
      try {
        const apiConfig = this.apiManager.getAPIConfig(apiName);
        if (apiConfig?.type !== 'graphql') continue;

        // Load schema
        let schema = this.schemaCache.get(apiName);
        if (!schema) {
          const loadedSchema =
            await this.apiManager.loadAPIDocumentation(apiName);
          if (typeof loadedSchema === 'string') {
            schema = loadedSchema;
            this.schemaCache.set(apiName, schema);
          }
        }

        if (!schema) continue;

        // Extract INPUT types
        const inputTypes = this.graphQLParser.extractInputTypes(schema);

        // Collect unique parameter types from operations
        const parameterTypes = new Set<string>();
        for (const op of operations) {
          if (op.type === 'query' || op.type === 'mutation') {
            for (const param of op.parameters || []) {
              const baseType = param.type.replace(/[\[\]!]/g, '').trim();
              parameterTypes.add(baseType);
            }
          }
        }

        // Build schema context for parameter types
        for (const paramType of parameterTypes) {
          const inputTypeDef = inputTypes.get(paramType);
          if (inputTypeDef) {
            if (inputTypeDef.isEnum) {
              schemaContext.push(`
${paramType} (enum):
  Valid values: ${inputTypeDef.values.join(', ')}`);
            } else {
              schemaContext.push(`
${paramType} (input type):
  Fields: ${JSON.stringify(inputTypeDef.fields, null, 2)}`);
              
              // For input types, also load ENUMs referenced in fields
              for (const [fieldName, fieldType] of Object.entries(inputTypeDef.fields || {})) {
                const cleanFieldType = (fieldType as string).replace(/[[\]!]/g, '').trim();
                const fieldTypeDef = inputTypes.get(cleanFieldType);
                if (fieldTypeDef?.isEnum && !parameterTypes.has(cleanFieldType)) {
                  schemaContext.push(`
${cleanFieldType} (enum - used in ${paramType}.${fieldName}):
  Valid values: ${fieldTypeDef.values.join(', ')}`);
                }
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to load schema context for ${apiName}`);
      }
    }

    if (schemaContext.length === 0) {
      return '';
    }

    return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL: GraphQL Schema-Aware Parameter Generation 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**MANDATORY RULES:**

1. ❌ NEVER use generic field names like: "limit", "offset", "filter", "sort"
2. ✅ ONLY use field names EXACTLY as defined in the schema below
3. ✅ Check the schema BEFORE generating ANY parameters
4. ✅ For string filters, use "iLike" (case-insensitive) or "like" (case-sensitive), NEVER "contains"
5. ✅ For enums (like sort direction), use unquoted values: ASC or DESC (not "ASC" or "DESC")
6. ✅ For pagination, use "first"/"last" with cursor pagination, NOT "limit"/"offset"
7. ✅ Do NOT include "includePagingDetails" - pagination details are returned automatically

**Schema Definitions:**
${schemaContext.join('\n')}

**Examples of CORRECT usage:**

❌ WRONG: {"limit": 10, "offset": 0}
✅ RIGHT: {"paging": {"first": 10}}

❌ WRONG: {"filter": {"city": {"contains": "West"}}}
✅ RIGHT: {"filter": {"city": {"iLike": "%West%"}}}

❌ WRONG: {"sorting": [{"field": "city", "direction": "ASC"}]}
✅ RIGHT: {"sorting": [{"field": city, "direction": ASC}]}
   Note: field and direction are ENUMS - no quotes!

❌ WRONG: {"paging": {"first": 10, "includePagingDetails": true}}
✅ RIGHT: {"paging": {"first": 10}}
   Note: includePagingDetails doesn't exist in CursorPaging

**String Filter Operators (StringFieldComparison):**
- iLike: Case-insensitive pattern match (use % for wildcards)
- like: Case-sensitive pattern match
- eq: Exact match
- neq: Not equal
- in: Value in list
- notIn: Value not in list
❌ NEVER use "contains" - it doesn't exist!

**Validation Checklist Before Calling Function:**
□ Did I check the schema for this operation?
□ Are ALL my parameter names in the schema?
□ Am I using the correct nested structure?
□ Am I using enum values WITHOUT quotes?
□ Am I using "iLike" instead of "contains" for string filters?
□ Did I avoid using "includePagingDetails"?

Remember: Schema compliance is NON-NEGOTIABLE. Wrong field names = API failure.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  /**
   * Build system prompt that tells AI to think like a programmer
   */
  private buildProgrammerSystemPrompt(
    apiToolMap: Map<string, { apiName: string; operation: any }>,
    schemaContext: string = '',
  ): string {
    const apiGroups = new Map<string, string[]>();

    // Group endpoints by API
    for (const [operationName, info] of apiToolMap.entries()) {
      if (!apiGroups.has(info.apiName)) {
        apiGroups.set(info.apiName, []);
      }
      const op = info.operation;

      // Handle GraphQL operations
      if (op.type === 'query' || op.type === 'mutation') {
        const opType = op.type === 'query' ? 'Query' : 'Mutation';
        const params =
          op.parameters
            ?.map((p: any) => `${p.name}: ${p.type}${p.required ? '!' : ''}`)
            .join(', ') || '';
        apiGroups
          .get(info.apiName)!
          .push(`${opType} ${operationName}(${params}): ${op.returnType}`);
      } else {
        // Handle REST operations
        apiGroups
          .get(info.apiName)!
          .push(
            `${op.method} ${op.path}: ${op.summary || op.description || 'No description'}`,
          );
      }
    }

    const apiList = Array.from(apiGroups.entries())
      .map(
        ([apiName, endpoints]) => `\n**${apiName}:**\n${endpoints.join('\n')}`,
      )
      .join('\n');

    return `You are an intelligent API router. Your job is to CALL API FUNCTIONS, not generate responses.

**CRITICAL RULES:**

1. **ALWAYS CALL FUNCTIONS** - When a user wants to perform an action (create, list, update, delete, generate, etc.), you MUST call the appropriate API function. NEVER generate content yourself.

2. **IGNORE EXTRA DETAILS** - If a user provides extra information that's not an API parameter, IGNORE IT and call the function anyway.
   Example: "create a quiz about JavaScript 10 questions very difficult" 
   → Extract: topic = "JavaScript"
   → Call: GenerateQuizController_generate(email, topic)
   → IGNORE: "10 questions very difficult" (not API parameters)

3. **USE AVAILABLE PARAMETERS ONLY** - Each API function has specific parameters. Use ONLY those parameters from the schema. Do not try to pass extra information the API doesn't accept.

4. **MATCH OPERATIONS PRECISELY**:
   - "create quiz" / "generate quiz" → GenerateQuizController_generate
   - "list quizzes" / "show quizzes" → ListQuizzesController_list  
   - "grade quiz" / "submit quiz" → GradeQuizController_grade
   - "list locations" → eswLocations (NOT eswAddresses, NOT eswLocationsAggregate)

5. **THINK LIKE A PROGRAMMER**:
   - Operation names are CODE, not English
   - "Aggregate" = GROUP BY/COUNT, not "list"
   - "eswLocations" is about LOCATIONS
   - "eswAddresses" is about ADDRESSES
   - Never mix similar entities

**Available APIs and Endpoints:**${apiList}
${schemaContext}

Remember: Your job is to ROUTE to API functions, not to perform the task yourself. When in doubt, call the function.`;
  }

  /**
   * Get all tools from all APIs (internal + external)
   * Handles both REST (OpenAPI) and GraphQL APIs dynamically
   */
  private async getAllAPITools(): Promise<{
    tools: OpenAITool[];
    apiToolMap: Map<string, { apiName: string; operation: any }>;
  }> {
    const tools: OpenAITool[] = [];
    const apiToolMap = new Map<string, { apiName: string; operation: any }>();

    const enabledAPIs = this.apiManager.getEnabledAPIs();

    for (const [apiName, apiConfig] of Object.entries(enabledAPIs)) {
      try {
        const documentation =
          await this.apiManager.loadAPIDocumentation(apiName);

        if (apiConfig.type === 'graphql') {
          // Handle GraphQL schema
          if (typeof documentation === 'string') {
            const { queries, mutations } =
              this.graphQLParser.parseSchema(documentation);

            // Extract INPUT types for schema-aware tool generation
            const inputTypes = this.graphQLParser.extractInputTypes(documentation);

            // Add queries as tools with schema context
            for (const [queryName, query] of queries.entries()) {
              const tool = this.buildSchemaAwareTool(
                queryName,
                query,
                'query',
                inputTypes,
              );
              tools.push(tool);

              apiToolMap.set(queryName, {
                apiName,
                operation: {
                  type: 'query',
                  name: queryName,
                  returnType: query.returnType,
                  parameters: query.parameters,
                },
              });
            }

            // Add mutations as tools with schema context
            for (const [mutationName, mutation] of mutations.entries()) {
              const tool = this.buildSchemaAwareTool(
                mutationName,
                mutation,
                'mutation',
                inputTypes,
              );
              tools.push(tool);

              apiToolMap.set(mutationName, {
                apiName,
                operation: {
                  type: 'mutation',
                  name: mutationName,
                  returnType: mutation.returnType,
                  parameters: mutation.parameters,
                },
              });
            }

            this.logger.log(
              `Loaded ${queries.size + mutations.size} GraphQL operations from ${apiName}`,
            );
          }
        } else {
          // Handle REST/OpenAPI documentation
          if (!documentation?.paths) {
            this.logger.warn(`No paths found in OpenAPI doc for ${apiName}`);
            continue;
          }

          // Build tools from OpenAPI spec
          const apiTools = ToolBuilder.buildTools(documentation);

          // Filter out intelligent-query endpoints to prevent recursion
          const filteredTools = apiTools.filter((tool) => {
            const toolName = tool.function.name.toLowerCase();
            return (
              !toolName.includes('intelligent') && !toolName.includes('query')
            );
          });

          // Add to unified tool list and map
          for (const tool of filteredTools) {
            tools.push(tool);

            // Find the operation in the OpenAPI doc
            for (const [path, methods] of Object.entries(documentation.paths)) {
              for (const [method, operation] of Object.entries(
                methods as Record<string, any>,
              )) {
                if (operation?.operationId === tool.function.name) {
                  apiToolMap.set(tool.function.name, {
                    apiName,
                    operation: {
                      path,
                      method: method.toUpperCase(),
                      ...operation,
                    },
                  });
                  break;
                }
              }
            }
          }

          this.logger.log(
            `Loaded ${filteredTools.length} REST operations from ${apiName}`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to load tools from ${apiName}:`,
          error.message,
        );
      }
    }

    return { tools, apiToolMap };
  }

  /**
   * Execute a tool call by routing to the correct API
   * Starts conversational parameter collection when needed
   */
  private async executeToolCall(
    toolName: string,
    args: Record<string, any>,
    apiToolMap: Map<string, { apiName: string; operation: any }>,
    context?: Record<string, any>,
  ): Promise<any> {
    const toolInfo = apiToolMap.get(toolName);

    if (!toolInfo) {
      return {
        error: `Could not resolve API for tool: ${toolName}`,
      };
    }

    const { apiName, operation } = toolInfo;
    const apiConfig = this.apiManager.getAPIConfig(apiName);

    if (!apiConfig) {
      return {
        error: `API configuration not found: ${apiName}`,
      };
    }

    // PHASE 9 FIX: Transform generic parameter names to schema-compliant names
    // This works dynamically for ANY API without hardcoding
    if (apiConfig.type === 'graphql' && Object.keys(args).length > 0) {
      args = await this.transformParametersToSchema(args, operation, apiName);
    }

    // Get all parameters (required + optional)
    const requiredParams = this.getRequiredParameters(operation);
    const allParams = this.getParameterDetails(operation);
    const optionalParams = allParams
      .filter((p) => !p.required)
      .map((p) => p.name);

    // Check for REQUIRED parameters
    const missingRequired = requiredParams.filter((param) => !args[param]);

    // If missing REQUIRED params, start conversational collection
    if (missingRequired.length > 0 && context?.email) {
      const email = context.email;

      // Start parameter collection
      this.conversationService.setPendingOperation(email, {
        toolName,
        apiName,
        operation,
        collectedParams: args,
        requiredParams: missingRequired,
        optionalParams,
        originalRequest: context.originalRequest || toolName,
      });

      // Ask for first required parameter
      return await this.askForNextParameter(
        email,
        {
          toolName,
          apiName,
          operation,
          collectedParams: args,
          requiredParams: missingRequired,
          optionalParams,
        },
        '',
      );
    }

    // Check if operation has parameters but none provided
    const hasParameters =
      operation.type === 'query' || operation.type === 'mutation'
        ? operation.parameters && operation.parameters.length > 0
        : operation.requestBody || operation.parameters;

    // DON'T start conversation for optional-only parameters
    // Let the operation execute with defaults instead
    // This prevents misleading "required" parameter messages

    try {
      let result;

      if (apiConfig.type === 'rest') {
        // Execute REST request
        result = await this.apiExecutor.executeRESTRequest(
          apiName,
          operation.path,
          {
            method: operation.method,
            body: args,
          },
        );
      } else {
        // Execute GraphQL request
        // Build query with inline arguments (not using variables)
        const query = await this.buildGraphQLQuery(operation, args, apiName);
        this.logger.log(`Built GraphQL Query: ${query}`);
        this.logger.log(
          `GraphQL Variables (should be empty): ${JSON.stringify({})}`,
        );

        // Get auth headers for the API
        const authHeaders = this.apiManager.getAuthHeaders(apiName);

        // Don't pass args as variables since we inlined them in the query
        result = await this.apiExecutor.executeGraphQLRequest(
          apiName,
          query,
          {}, // Empty variables object
          { headers: authHeaders }, // Pass auth headers in options
        );
      }

      return {
        api: apiName,
        function: toolName,
        endpoint: {
          method: operation.method,
          path: operation.path,
        },
        arguments: args,
        result: result.data || result,
        success: result.success !== false,
      };
    } catch (error: any) {
      this.logger.error(`Failed to execute ${toolName} on ${apiName}:`, error);
      return {
        api: apiName,
        function: toolName,
        arguments: args,
        error: error.message || 'Execution failed',
        success: false,
      };
    }
  }

  /**
   * Get detailed parameter information including type schemas
   */
  private getParameterDetails(operation: any): any[] {
    if (operation.type === 'query' || operation.type === 'mutation') {
      // GraphQL operation - return parameter details with type info
      return (
        operation.parameters?.map((p: any) => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description || `Filter parameter of type ${p.type}`,
        })) || []
      );
    } else {
      // REST operation - extract schema from requestBody
      const params: any[] = [];

      if (operation.requestBody?.content?.['application/json']?.schema) {
        const schema = operation.requestBody.content['application/json'].schema;
        const properties = schema.properties || {};

        for (const [propName, propSchema] of Object.entries(properties)) {
          const prop = propSchema as any;
          params.push({
            name: propName,
            type: prop.type || 'object',
            required: schema.required?.includes(propName) || false,
            description:
              prop.description || `Parameter of type ${prop.type || 'object'}`,
            schema: prop, // Include full schema for complex types
          });
        }
      }

      if (operation.parameters) {
        for (const param of operation.parameters) {
          params.push({
            name: param.name,
            type: param.schema?.type || 'string',
            required: param.required || false,
            description:
              param.description ||
              `Parameter of type ${param.schema?.type || 'string'}`,
          });
        }
      }

      return params;
    }
  }

  /**
   * Get required parameters from operation
   */
  private getRequiredParameters(operation: any): string[] {
    if (operation.type === 'query' || operation.type === 'mutation') {
      // GraphQL operation
      return (
        operation.parameters
          ?.filter((p: any) => p.required)
          .map((p: any) => p.name) || []
      );
    } else {
      // REST operation - check requestBody or parameters
      const required: string[] = [];

      if (
        operation.requestBody?.content?.['application/json']?.schema?.required
      ) {
        required.push(
          ...operation.requestBody.content['application/json'].schema.required,
        );
      }

      if (operation.parameters) {
        operation.parameters
          .filter((p: any) => p.required)
          .forEach((p: any) => required.push(p.name));
      }

      return required;
    }
  }

  /**
   * Build GraphQL query from operation
   */
  private async buildGraphQLQuery(
    operation: any,
    args: Record<string, any>,
    apiName: string,
  ): Promise<string> {
    const operationType = operation.type === 'mutation' ? 'mutation' : 'query';
    const operationName = operation.name;

    // Build arguments string with proper GraphQL formatting
    const argsStr = Object.entries(args)
      .map(([key, value]) => {
        return `${key}: ${this.formatGraphQLValue(value)}`;
      })
      .join(', ');

    // Get fields to request from schema
    const fieldsToRequest = await this.getFieldsForType(
      operation.returnType,
      apiName,
    );

    return `${operationType} {
      ${operationName}${argsStr ? `(${argsStr})` : ''} ${fieldsToRequest}
    }`;
  }

  /**
   * Format a value for GraphQL query (not JSON-stringified for variables)
   * CRITICAL: Enum values must NOT be quoted in GraphQL
   */
  private formatGraphQLValue(value: any, fieldName?: string): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Check if this looks like an enum value (all caps or PascalCase without spaces)
      // Common enum patterns: ASC, DESC, ACTIVE, INACTIVE, etc.
      const isLikelyEnum =
        /^[A-Z][A-Z_]*$/.test(value) || /^[A-Z][a-zA-Z]*$/.test(value);

      // Special cases: These fields are always enums
      const isDirectionField = fieldName === 'direction';
      const isFieldField = fieldName === 'field'; // Sorting field names are enums

      if (isLikelyEnum || isDirectionField || isFieldField) {
        // Don't quote enum values
        return value;
      }

      // Regular strings get quoted
      return `\"${value.replace(/\"/g, '\\\\\"')}\"`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatGraphQLValue(v)).join(', ')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .map(([k, v]) => `${k}: ${this.formatGraphQLValue(v, k)}`)
        .join(', ');
      return `{${entries}}`;
    }

    return String(value);
  }

  /**
   * Get fields to request from GraphQL type
   * Uses schema parser to extract actual fields from the schema
   */
  private async getFieldsForType(
    returnType: string,
    apiName: string,
  ): Promise<string> {
    try {
      // Load schema from cache or API
      let schema = this.schemaCache.get(apiName);
      if (!schema) {
        const loadedSchema =
          await this.apiManager.loadAPIDocumentation(apiName);
        if (typeof loadedSchema === 'string') {
          schema = loadedSchema;
          this.schemaCache.set(apiName, schema);
        }
      }

      if (!schema) {
        // Fallback to __typename only
        return this.getFallbackFields(returnType);
      }

      // Use GraphQLSchemaParser to extract fields
      const fields = this.graphQLParser.extractFieldsFromType(
        schema,
        returnType,
        2, // Max depth of 2 to avoid too deep nesting
      );

      return fields || this.getFallbackFields(returnType);
    } catch {
      // On error, fallback to safe fields
      return this.getFallbackFields(returnType);
    }
  }

  /**
   * Get fallback fields when schema extraction fails
   */
  private getFallbackFields(returnType: string): string {
    // For connection types (pagination)
    if (returnType.includes('Connection')) {
      return `{
        edges {
          node {
            __typename
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }`;
    }

    // For array types
    if (returnType.startsWith('[')) {
      return `{
        __typename
      }`;
    }

    // For scalar types, no fields needed
    if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(returnType)) {
      return '';
    }

    // For object types, request just __typename
    return `{
      __typename
    }`;
  }

  /**
   * Build schema-aware tool from GraphQL operation
   * This embeds schema field names directly in the tool definition
   * so OpenAI sees the correct parameter structure when generating arguments
   */
  private buildSchemaAwareTool(
    operationName: string,
    operation: any,
    operationType: 'query' | 'mutation',
    inputTypes: Map<string, any>,
  ): any {
    const parameters: any = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Add parameters with schema-enriched descriptions
    for (const param of operation.parameters || []) {
      const baseType = param.type.replace(/[[\]!]/g, '').trim();
      const inputTypeDef = inputTypes.get(baseType);

      let description = `Parameter of type ${param.type}`;
      
      if (inputTypeDef) {
        if (inputTypeDef.isEnum) {
          // For enums, show valid values
          description = `ENUM - Use one of: ${inputTypeDef.values.join(', ')}`;
        } else {
          // For input types, show exact field structure
          description = `INPUT OBJECT with fields: ${JSON.stringify(inputTypeDef.fields)}. Example: ${this.generateExample(inputTypeDef.fields)}`;
        }
      }

      parameters.properties[param.name] = {
        type: 'object',
        description,
      };

      if (param.required) {
        parameters.required.push(param.name);
      }
    }

    return {
      type: 'function',
      function: {
        name: operationName,
        description:
          operation.description ||
          `${operationType === 'query' ? 'Query' : 'Mutate'} ${operationName} returning ${operation.returnType}`,
        parameters,
      },
    };
  }

  /**
   * Generate example JSON for a field structure
   */
  private generateExample(fields: Record<string, string>): string {
    const example: any = {};

    for (const [fieldName, fieldType] of Object.entries(fields)) {
      const cleanType = fieldType.replace(/[[\]!]/g, '').trim();

      if (cleanType === 'Int') {
        example[fieldName] = 10;
      } else if (cleanType === 'String') {
        example[fieldName] = '"value"';
      } else if (cleanType === 'Boolean') {
        example[fieldName] = true;
      } else if (fieldType.includes('Filter') || fieldType.includes('Input')) {
        example[fieldName] = '{...}';
      } else {
        example[fieldName] = 'value';
      }
    }

    return JSON.stringify(example);
  }

  /**
   * Transform generic parameter names to schema-compliant names
   * Uses AI to intelligently map parameters based on schema analysis
   * Works dynamically for ANY GraphQL API without hardcoding
   */
  private async transformParametersToSchema(
    args: Record<string, any>,
    operation: any,
    apiName: string,
  ): Promise<Record<string, any>> {
    try {
      // Load schema to get INPUT type definitions
      const schema = await this.apiManager.loadAPIDocumentation(apiName);
      if (typeof schema !== 'string') return args;

      const inputTypes = this.graphQLParser.extractInputTypes(schema);

      // Build schema context for this operation's parameters
      const parameterSchemas: Record<string, any> = {};
      for (const param of operation.parameters || []) {
        const baseType = param.type.replace(/[[\]!]/g, '').trim();
        const inputTypeDef = inputTypes.get(baseType);
        if (inputTypeDef) {
          parameterSchemas[param.name] = inputTypeDef;
        }
      }

      // Use AI to intelligently map generic args to schema fields
      const mappingPrompt = `You are transforming API parameters to match a GraphQL schema.

**Original Parameters (from AI):**
${JSON.stringify(args, null, 2)}

**GraphQL Operation Schema:**
Operation: ${operation.name}
Parameters: ${operation.parameters?.map((p: any) => `${p.name}: ${p.type}`).join(', ')}

**INPUT Type Definitions:**
${JSON.stringify(parameterSchemas, null, 2)}

**Your Task:**
Transform the original parameters to match the exact schema structure.

**CRITICAL RULES:**
1. Use ONLY field names that exist in the schema - DELETE any fields not in schema
2. For ENUMs, convert to UPPERCASE (e.g., "asc" → "ASC", "desc" → "DESC")
3. For sorting field enums, use ONLY values from the schema enum definition
4. If a field doesn't exist in the schema, REMOVE IT completely
5. If cursor pagination (first/last/after/before), REMOVE offset/limit fields
6. For nested filters, use the exact nested structure from schema

**Validation Steps:**
1. Check each field name against the schema - if not found, DELETE IT
2. Check each enum value - if not valid, use the first valid value from schema or DELETE
3. Convert all enum values to UPPERCASE
4. For nested filters (e.g., address.state), use nested object structure

**Common Transformations:**
- limit + offset → {"paging": {"first": <limit>}} (REMOVE offset)
- "asc"/"desc" → "ASC"/"DESC" (UPPERCASE)
- Invalid field name → DELETE the field entirely
- Invalid enum value → Use first valid enum value or DELETE

**Examples:**

Example 1 (Invalid field):
Input: {"filter": {"state": {"like": "UT"}}}
Schema fields: title, storenumber, email, addressId, address
Output: {"filter": {}} (state doesn't exist, so remove it)

Example 2 (Nested filter):
Input: {"filter": {"state": {"like": "UT"}}}
Schema has nested: address: {state: StringFieldComparison}
Output: {"filter": {"address": {"state": {"like": "UT"}}}}

Example 3 (Invalid sort field + lowercase enum):
Input: {"sorting": [{"field": "city", "direction": "asc"}]}
Schema enum values: title, storenumber, phoneNumberId (NOT city)
Output: {"sorting": [{"field": "title", "direction": "ASC"}]}
Note: Use first valid enum value and UPPERCASE direction

Return ONLY valid JSON matching the schema:`;

      const response = await this.openAIService.createCompletion(
        [{ role: 'system', content: mappingPrompt }],
        { temperature: 0, response_format: { type: 'json_object' } },
      );

      const transformed = JSON.parse(response || '{}');

      this.logger.log(`Parameter transformation:`);
      this.logger.log(`  Before: ${JSON.stringify(args)}`);
      this.logger.log(`  After:  ${JSON.stringify(transformed)}`);

      return transformed;
    } catch {
      this.logger.warn('Parameter transformation failed, using original args');
      return args;
    }
  }

  /**
   * Get all available endpoints across all APIs
   */
  async getAvailableEndpoints(): Promise<string> {
    const { apiToolMap } = await this.getAllAPITools();

    const grouped = new Map<string, string[]>();
    for (const [toolName, info] of apiToolMap.entries()) {
      if (!grouped.has(info.apiName)) {
        grouped.set(info.apiName, []);
      }
      const op = info.operation;
      grouped
        .get(info.apiName)!
        .push(
          `${op.method} ${op.path}: ${op.summary || op.description || toolName}`,
        );
    }

    return Array.from(grouped.entries())
      .map(
        ([apiName, endpoints]) => `\n**${apiName}:**\n${endpoints.join('\n')}`,
      )
      .join('\n');
  }

  /**
   * Continue parameter collection conversation
   * Phase 5 & 7: Parse user responses with schema-aware field names
   */
  private async continueParameterCollection(
    email: string,
    userResponse: string,
    pendingOp: any,
  ): Promise<any> {
    try {
      // Special case: User is choosing between multiple operations
      if (pendingOp.toolName === 'AWAITING_CHOICE') {
        // Try to match user response to one of the available operations
        // Support both exact operation names AND natural language descriptions
        const chosenOperation = pendingOp.availableOperations?.find(
          (op: any) => {
            const responseLower = userResponse.toLowerCase();
            const toolNameLower = op.toolName.toLowerCase();
            
            // Exact match or contains operation name
            if (responseLower === toolNameLower || responseLower.includes(toolNameLower)) {
              return true;
            }
            
            // Match action words in natural language
            // e.g., "generate a new quiz" matches "GenerateQuizController_generate"
            if (responseLower.includes('generate') && toolNameLower.includes('generate')) {
              return true;
            }
            if (responseLower.includes('grade') && toolNameLower.includes('grade')) {
              return true;
            }
            if (responseLower.includes('list') && toolNameLower.includes('list')) {
              return true;
            }
            if (responseLower.includes('create') && toolNameLower.includes('create')) {
              return true;
            }
            
            return false;
          }
        );

        if (chosenOperation && pendingOp.originalRequest) {
          this.logger.log(
            `User chose ${chosenOperation.toolName}, extracting params from: ${pendingOp.originalRequest}`,
          );

          // Load schema for the chosen operation
          const operation = chosenOperation.apiInfo.operation;
          
          // Use AI to extract parameters from the original request
          const extractionPrompt = `Extract API parameters from this natural language request.

User request: "${pendingOp.originalRequest}"

Target operation: ${chosenOperation.toolName}
Operation parameters: ${operation.parameters?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || 'None'}

Extract ONLY the parameters mentioned in the request. Return JSON.

Examples:
- "paging 50" → {"paging": {"first": 50}}
- "filter for state UT" → {"filter": {"state": {"like": "UT"}}}
- "sort by city ASC" → {"sorting": [{"field": "city", "direction": "ASC"}]}

Return ONLY valid JSON with extracted parameters:`;

          const extractedArgsResponse = await this.openAIService.createCompletion(
            [{ role: 'system', content: extractionPrompt }],
            { temperature: 0.1, response_format: { type: 'json_object' } },
          );

          let extractedArgs: Record<string, any> = {};
          try {
            extractedArgs = JSON.parse(extractedArgsResponse || '{}');
          } catch {
            this.logger.warn('Failed to parse extracted args, using empty object');
          }

          this.logger.log(`Extracted args: ${JSON.stringify(extractedArgs)}`);

          // Clear pending operation
          this.conversationService.clearPendingOperation(email);

          // Get all API tools to find the operation
          const { apiToolMap } = await this.getAllAPITools();

          // Execute the chosen operation directly with extracted params
          return await this.executeToolCall(
            chosenOperation.toolName,
            extractedArgs,
            apiToolMap,
            { email, originalRequest: pendingOp.originalRequest },
          );
        }
      }

      // Load GraphQL schema if this is a GraphQL API to get exact INPUT type definitions
      let paramSchemas = '';
      if (
        pendingOp.operation?.type === 'query' ||
        pendingOp.operation?.type === 'mutation'
      ) {
        try {
          const schema = await this.apiManager.loadAPIDocumentation(
            pendingOp.apiName,
          );
          if (typeof schema === 'string') {
            const inputTypes = this.graphQLParser.extractInputTypes(schema);

            // Build schema definitions for each parameter
            const schemaDescriptions: string[] = [];
            for (const param of pendingOp.operation.parameters || []) {
              const baseType = param.type.replace(/[[\]!]/g, '');
              const inputTypeDef = inputTypes.get(baseType);

              if (inputTypeDef) {
                schemaDescriptions.push(`
${param.name} (type: ${param.type}):
  Fields: ${JSON.stringify(inputTypeDef.fields || inputTypeDef.values || {}, null, 2)}`);
              }
            }

            if (schemaDescriptions.length > 0) {
              paramSchemas = `\n\nACTUAL SCHEMA DEFINITIONS (USE THESE EXACT FIELD NAMES):
${schemaDescriptions.join('\n')}`;
            }
          }
        } catch {
          this.logger.warn(
            'Failed to load schema for parameter parsing, using generic parsing',
          );
        }
      }

      // Use OpenAI to parse the user's natural language response into structured parameters
      const systemPrompt = `You are parsing a user's response into API parameters.

Operation: ${pendingOp.toolName}
Already collected parameters: ${JSON.stringify(pendingOp.collectedParams, null, 2)}

User said: "${userResponse}"${paramSchemas}

Your task: Parse this natural language into structured API parameters.

CRITICAL: If schema definitions are provided above, you MUST use the EXACT field names shown in the schema.
Do NOT invent field names. Use only what is defined in the schema.

Examples of parsing (adjust based on actual schema):
- "city like West Val" → {filter: {city: {contains: "West Val"}}}
- "10 per page" → Use schema field names (e.g., {paging: {first: 10}} if schema has "first")
- "all" or "no filter" → {}
- "sorted by name ascending" → {sorting: [{field: "name", direction: "ASC"}]}

IMPORTANT:
- Return ONLY valid JSON
- Use EXACT field names from the schema above (if provided)
- If user wants defaults or "all", return empty object {}
- For cursor pagination: use "first", "last", "after", "before" (not "limit"/"offset")
- For offset pagination: use "limit" and "offset"
- Check the schema to know which pagination style to use`;

      const response = await this.openAIService.createCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userResponse },
        ],
        { temperature: 0.1, response_format: { type: 'json_object' } },
      );

      let parsedParams: Record<string, any> = {};
      try {
        parsedParams = JSON.parse(response || '{}');
      } catch {
        this.logger.warn(
          'Failed to parse AI response as JSON, using empty object',
        );
      }

      // Merge with already collected params
      const updatedParams = { ...pendingOp.collectedParams, ...parsedParams };

      // Update the pending operation
      this.conversationService.updatePendingOperation(email, {
        collectedParams: updatedParams,
      });

      // Check if we should execute or ask for more
      const hasAllRequired = pendingOp.requiredParams.every(
        (p: string) => updatedParams[p] !== undefined,
      );

      // For operations with only optional params, we can execute immediately if user provided something
      if (hasAllRequired || Object.keys(updatedParams).length > 0) {
        // Execute the operation
        return await this.executeWithCollectedParams(
          email,
          pendingOp,
          updatedParams,
        );
      }

      // Still need more parameters - ask for the next one
      return await this.askForNextParameter(email, pendingOp, userResponse);
    } catch (error: any) {
      this.logger.error('Failed to continue parameter collection:', error);
      // Clear pending operation on error
      this.conversationService.clearPendingOperation(email);
      return {
        error: 'Failed to process your response. Please try again.',
      };
    }
  }

  /**
   * Ask for next parameter with COMPLETE awareness of all options
   * Phase 4 Enhanced: Analyzes parameter structure for nested/cyclic relationships
   */
  private async askForNextParameter(
    email: string,
    pendingOp: any,
    context: string,
  ): Promise<any> {
    try {
      const collected = pendingOp.collectedParams || {};
      const requiredStillNeeded = pendingOp.requiredParams.filter(
        (p: string) => !collected[p],
      );
      const optionalStillNeeded = pendingOp.optionalParams.filter(
        (p: string) => !collected[p],
      );

      // Analyze parameter structure for GraphQL operations
      let parameterAnalysis = '';
      if (
        (pendingOp.operation?.type === 'query' ||
          pendingOp.operation?.type === 'mutation') &&
        optionalStillNeeded.length > 0
      ) {
        try {
          const schema = await this.apiManager.loadAPIDocumentation(
            pendingOp.apiName,
          );
          if (typeof schema === 'string') {
            const analysisResults: any[] = [];

            // Analyze each optional parameter
            for (const paramName of optionalStillNeeded) {
              const param = pendingOp.operation.parameters?.find(
                (p: any) => p.name === paramName,
              );
              if (param) {
                const analysis = this.graphQLParser.analyzeParameterStructure(
                  schema,
                  param.type,
                );

                analysisResults.push({
                  name: paramName,
                  type: param.type,
                  analysis,
                });
              }
            }

            // Build parameter analysis summary
            if (analysisResults.length > 0) {
              const summaries = analysisResults.map((result) => {
                let summary = `\n${result.name} (${result.type}):`;

                if (result.analysis.hasNestedStructure) {
                  summary += `\n  - Has nested structure with ${result.analysis.nestedTypes.length} nested types`;
                  summary += `\n  - Max depth: ${result.analysis.maxPossibleDepth}`;

                  if (result.analysis.hasCyclicDependencies) {
                    summary += `\n  - ⚠️  Contains cyclic/recursive relationships`;
                  }
                }

                if (result.analysis.optionalFields.length > 0) {
                  summary += `\n  - Optional fields: ${result.analysis.optionalFields.join(', ')}`;
                }

                if (result.analysis.requiredFields.length > 0) {
                  summary += `\n  - Required fields: ${result.analysis.requiredFields.join(', ')}`;
                }

                return summary;
              });

              parameterAnalysis = `\n\nDETAILED PARAMETER STRUCTURE:${summaries.join('\n')}`;
            }
          }
        } catch (error) {
          this.logger.warn(
            'Failed to analyze parameter structure, using basic prompting',
          );
        }
      }

      // Build a simple, direct prompt based on what parameters are actually missing
      let systemPrompt: string;
      
      if (requiredStillNeeded.length > 0) {
        // Simple, direct ask for required params - don't invent options
        systemPrompt = `Ask the user for the required parameter: ${requiredStillNeeded[0]}

Keep it brief and direct. Do NOT mention or invent optional parameters that don't exist in the schema.

Example: "What topic would you like the quiz to be about?"`;
      } else if (optionalStillNeeded.length > 0) {
        // For optional params, list what's actually available from the schema
        systemPrompt = `The user has provided all required parameters. There are optional parameters available:
${optionalStillNeeded.join(', ')}${parameterAnalysis}

Ask if they want to configure these optional parameters or proceed with defaults.

CRITICAL: Do NOT invent parameters. Only mention the parameters listed above.`;
      } else {
        // No params needed - shouldn't reach here
        systemPrompt = `All parameters collected. Ready to execute.`;
      }

      const response = await this.openAIService.createCompletion(
        [{ role: 'system', content: systemPrompt }],
        { temperature: 0.7, max_tokens: 300 },
      );

      return {
        needsMoreInfo: true,
        message: response,
        collectingParameters: true,
        operation: pendingOp.toolName,
        availableParameters: {
          required: requiredStillNeeded,
          optional: optionalStillNeeded,
          collected: Object.keys(collected),
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to ask for next parameter:', error);
      this.conversationService.clearPendingOperation(email);
      return {
        error: 'Failed to generate question. Please try again.',
      };
    }
  }

  /**
   * Execute operation with collected parameters
   * Phase 6: Execute with collected parameters
   */
  private async executeWithCollectedParams(
    email: string,
    pendingOp: any,
    collectedParams: Record<string, any>,
  ): Promise<any> {
    try {
      this.logger.log(
        `Executing ${pendingOp.toolName} with params: ${JSON.stringify(collectedParams)}`,
      );

      // Clear pending operation
      this.conversationService.clearPendingOperation(email);

      // Get API tools to find the operation
      const { apiToolMap } = await this.getAllAPITools();

      // Execute the tool call
      return await this.executeToolCall(
        pendingOp.toolName,
        collectedParams,
        apiToolMap,
      );
    } catch (error: any) {
      this.logger.error('Failed to execute with collected params:', error);
      return {
        error: 'Failed to execute operation. Please try again.',
      };
    }
  }
}
