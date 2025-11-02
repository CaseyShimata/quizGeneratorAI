import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../../openai/services/OpenAIService';
import { PromptBuilder } from '../../openai/utils/promptBuilder';
import { ExternalAPIManagerService } from './ExternalAPIManagerService';
import { ExternalAPIExecutionService } from './ExternalAPIExecutionService';
import { ToolBuilder, OpenAITool } from '../../openai/tools/ToolBuilder';
import { GraphQLSchemaParser } from './GraphQLSchemaParser';

/**
 * Intelligent Router Service
 * Routes requests to ANY API (internal or external) using OpenAPI documentation
 * No distinction between internal and external - all handled uniformly
 */
@Injectable()
export class IntelligentRouterService {
  private readonly logger = new Logger(IntelligentRouterService.name);

  constructor(
    private readonly openAIService: OpenAIService,
    private readonly apiManager: ExternalAPIManagerService,
    private readonly apiExecutor: ExternalAPIExecutionService,
    private readonly graphQLParser: GraphQLSchemaParser,
  ) {}

  /**
   * Process natural language request and route to appropriate API
   */
  async processRequest(
    userPrompt: string,
    context?: Record<string, any>,
  ): Promise<any> {
    try {
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
      if (topMatches.length > 1 && topMatches[0].score === topMatches[1].score) {
        return {
          needsMoreInfo: true,
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

      // Build system prompt
      const filteredToolMap = new Map(
        Array.from(apiToolMap.entries()).filter(([name]) =>
          filteredTools.some((t) => t.function.name === name),
        ),
      );
      const systemPrompt = this.buildProgrammerSystemPrompt(filteredToolMap);

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
      const isActionQuery = promptLower.match(/\b(create|generate|make|list|show|get|update|modify|delete|remove|grade|submit)\b/);
      
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
  ): { filteredTools: OpenAITool[]; topMatches: Array<{ tool: OpenAITool; score: number }> } {
    const MAX_TOOLS = 30;

    const promptLower = userPrompt.toLowerCase();

    // Extract entity keywords (likely represent data types)
    // EXCLUDE action words - those are handled separately
    const keywords = promptLower
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter(
        (word) =>
          !['this', 'that', 'with', 'from', 'want', 'need', 'show', 'list', 'some', 'like',
            'create', 'update', 'delete', 'generate', 'make', 'build', 'add'].includes(
            word,
          ),
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
      const hasKeywordMatch = keywords.some((keyword) => toolName.includes(keyword));
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

      // Exact operation type match
      if (promptLower.includes('list') && toolName.startsWith('list')) score += 30;
      if (promptLower.includes('get') && toolName.startsWith('get')) score += 30;
      if (promptLower.includes('create') && toolName.startsWith('create')) score += 30;
      if (promptLower.includes('update') && toolName.startsWith('update')) score += 30;
      if (promptLower.includes('delete') && toolName.startsWith('delete')) score += 30;

      return { tool, score };
    });

    // Sort by score
    const sorted = scoredTools.sort((a, b) => b.score - a.score);

    // Log top matches for debugging
    this.logger.log(
      `Top 5 matches: ${sorted.slice(0, 5).map((s) => `${s.tool.function.name}(${s.score})`).join(', ')}`,
    );

    return {
      filteredTools: sorted.slice(0, MAX_TOOLS).map((s) => s.tool),
      topMatches: sorted.slice(0, 5), // Return top 5 for user choice if needed
    };
  }

  /**
   * Build system prompt that tells AI to think like a programmer
   */
  private buildProgrammerSystemPrompt(
    apiToolMap: Map<string, { apiName: string; operation: any }>,
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
          .push(`${op.method} ${op.path}: ${op.summary || op.description || 'No description'}`);
      }
    }

    const apiList = Array.from(apiGroups.entries())
      .map(([apiName, endpoints]) => `\n**${apiName}:**\n${endpoints.join('\n')}`)
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
        const documentation = await this.apiManager.loadAPIDocumentation(apiName);

        if (apiConfig.type === 'graphql') {
          // Handle GraphQL schema
          if (typeof documentation === 'string') {
            const { queries, mutations } = this.graphQLParser.parseSchema(documentation);

            // Add queries as tools
            for (const [queryName, query] of queries.entries()) {
              const tool = this.graphQLParser.buildToolFromOperation(queryName, query, 'query');
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

            // Add mutations as tools
            for (const [mutationName, mutation] of mutations.entries()) {
              const tool = this.graphQLParser.buildToolFromOperation(
                mutationName,
                mutation,
                'mutation',
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
            return !toolName.includes('intelligent') && !toolName.includes('query');
          });

          // Add to unified tool list and map
          for (const tool of filteredTools) {
            tools.push(tool);

            // Find the operation in the OpenAPI doc
            for (const [path, methods] of Object.entries(documentation.paths)) {
              for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
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

          this.logger.log(`Loaded ${filteredTools.length} REST operations from ${apiName}`);
        }
      } catch (error: any) {
        this.logger.error(`Failed to load tools from ${apiName}:`, error.message);
      }
    }

    return { tools, apiToolMap };
  }

  /**
   * Execute a tool call by routing to the correct API
   * Shows detailed parameter schemas when asking for more info
   */
  private async executeToolCall(
    toolName: string,
    args: Record<string, any>,
    apiToolMap: Map<string, { apiName: string; operation: any }>,
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

    // Check for required parameters
    const requiredParams = this.getRequiredParameters(operation);
    const missingParams = requiredParams.filter((param) => !args[param]);

    if (missingParams.length > 0) {
      return {
        needsMoreInfo: true,
        message: `To use ${toolName}, I need the following information: ${missingParams.join(', ')}. Please provide these values.`,
        missingParameters: missingParams,
        operation: toolName,
        api: apiName,
      };
    }

    // CRITICAL: Prevent execution with empty args when operation has parameters
    const hasParameters =
      operation.type === 'query' || operation.type === 'mutation'
        ? operation.parameters && operation.parameters.length > 0
        : operation.requestBody || operation.parameters;

    if (hasParameters && Object.keys(args).length === 0) {
      // Get detailed parameter information
      const paramDetails = this.getParameterDetails(operation);

      return {
        needsMoreInfo: true,
        message: `To use ${toolName}, please provide filter criteria or parameters. Here's what's available:`,
        availableParameters: paramDetails,
        operation: toolName,
        api: apiName,
      };
    }

    try {
      let result;

      if (apiConfig.type === 'rest') {
        // Execute REST request
        result = await this.apiExecutor.executeRESTRequest(apiName, operation.path, {
          method: operation.method,
          body: args,
        });
      } else {
        // Execute GraphQL request
        const query = this.buildGraphQLQuery(operation, args);
        result = await this.apiExecutor.executeGraphQLRequest(apiName, query, args);
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
            description: prop.description || `Parameter of type ${prop.type || 'object'}`,
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
            description: param.description || `Parameter of type ${param.schema?.type || 'string'}`,
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
        operation.parameters?.filter((p: any) => p.required).map((p: any) => p.name) || []
      );
    } else {
      // REST operation - check requestBody or parameters
      const required: string[] = [];

      if (operation.requestBody?.content?.['application/json']?.schema?.required) {
        required.push(...operation.requestBody.content['application/json'].schema.required);
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
  private buildGraphQLQuery(operation: any, args: Record<string, any>): string {
    const operationType = operation.type === 'mutation' ? 'mutation' : 'query';
    const operationName = operation.name;

    // Build arguments string
    const argsStr = Object.entries(args)
      .map(([key, value]) => {
        // Handle different value types
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else if (typeof value === 'object') {
          return `${key}: ${JSON.stringify(value).replace(/"([^"]+)":/g, '$1:')}`;
        }
        return `${key}: ${value}`;
      })
      .join(', ');

    // For now, request basic fields - in production this would be more sophisticated
    // based on the returnType and user's needs
    const fieldsToRequest = this.getBasicFieldsForType(operation.returnType);

    return `${operationType} {
      ${operationName}${argsStr ? `(${argsStr})` : ''} ${fieldsToRequest}
    }`;
  }

  /**
   * Get basic fields to request based on return type
   */
  private getBasicFieldsForType(returnType: string): string {
    // For connection types (pagination), request edges and nodes
    if (returnType.includes('Connection') || returnType.includes('Edge')) {
      return `{
        edges {
          node {
            id
            __typename
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }`;
    }

    // For array types, request basic fields
    if (returnType.startsWith('[')) {
      return `{
        id
        __typename
      }`;
    }

    // For scalar types, no fields needed
    if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(returnType)) {
      return '';
    }

    // For object types, request id and typename
    return `{
      id
      __typename
    }`;
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
}
