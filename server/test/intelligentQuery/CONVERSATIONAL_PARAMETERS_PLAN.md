# Conversational Parameter Collection - Implementation Plan

## Problem Statement

Currently when a user requests an operation that requires parameters, the system responds with:
```json
{
  "message": "I need: paging, filter, sorting. Please provide these values.",
  "missingParameters": ["paging", "filter", "sorting"]
}
```

This is terrible UX because:
1. User doesn't know what options are available for each parameter
2. User doesn't know the type structure (e.g., what fields are in `filter`)
3. User doesn't know if parameters are optional or required
4. No guidance on defaults or common values

## Desired User Experience

```
User: "list addresses"

System: "Do you want to get all addresses, or something more specific like addresses 
         for a particular city or zip code? Or would you like me to just show you 
         the first 10?"

User: "city like West Val"

System: "Got it - filtering by city matching 'West Val'. How many results would 
         you like? First 10, first 100, or all results?"

User: "first 100"

System: [Executes query with filter: {city: {contains: "West Val"}}, paging: {limit: 100}]
        [Returns results]
```

## Architecture Overview

### Components Needed

1. **ConversationService** (Already exists) - Tracks conversation state per user
2. **ParameterCollectionContext** (New) - Tracks which parameters have been collected
3. **OpenAI-Driven Conversation** - Let AI handle the questions naturally
4. **Parameter Parser** (New) - Parse user responses into API parameters

### Key Insight

**We DON'T hardcode the questions!** OpenAI generates them dynamically based on:
- The API schema (parameter types)
- What's been collected so far
- The original user request
- Natural conversation flow

## Implementation Plan

### Phase 1: Extend Conversation Tracking

**File:** `server/src/intelligentQuery/services/ConversationService.ts`

Add to conversation context:
```typescript
interface ConversationContext {
  email: string;
  messages: Message[];
  pendingOperation?: {
    toolName: string;
    apiName: string;
    operation: any;
    collectedParams: Record<string, any>;
    requiredParams: string[];
    optionalParams: string[];
  };
}
```

**Why:** Track the operation we're building parameters for across multiple turns

### Phase 2: Create Parameter Schema Analyzer

**File:** `server/src/intelligentQuery/services/ParameterSchemaAnalyzer.ts` (New)

**Purpose:** Extract human-readable parameter info from GraphQL/REST schemas

**Methods:**

1. `analyzeOperation(operation): ParameterSchema`
   - Extracts all parameters (required + optional)
   - For each parameter, extracts:
     - Type (String, Int, Object, Enum, etc.)
     - Nested structure for complex types
     - Common field names (e.g., for Filter types: contains, equals, startsWith)
     - Enum values if applicable
     - Default values if specified

2. `getParameterGuidance(paramName, paramType): ParameterGuidance`
   - Returns human-friendly description
   - Example values
   - Common patterns (e.g., "contains" for string filters)

**Example Output:**
```typescript
{
  parameter: "filter",
  type: "EswAddressesDeepFilter",
  required: false,
  structure: {
    city: { type: "StringFilter", operations: ["equals", "contains", "startsWith"] },
    state: { type: "StringFilter", operations: ["equals", "contains", "startsWith"] },
    zipCode: { type: "StringFilter", operations: ["equals", "contains", "startsWith"] }
  },
  examples: [
    { city: { contains: "West" } },
    { state: { equals: "UT" } },
    { zipCode: { startsWith: "84" } }
  ]
}
```

### Phase 3: Modify IntelligentRouterService

**File:** `server/src/intelligentQuery/services/IntelligentRouterService.ts`

**In executeToolCall():**

Instead of asking for all parameters at once:

```typescript
// Check if we have a pending operation in conversation
const context = await conversationService.getContext(email);

if (context.pendingOperation && context.pendingOperation.toolName === toolName) {
  // We're continuing a parameter collection conversation
  return await this.continueParameterCollection(context, userPrompt);
}

// First time - start parameter collection
if (hasParameters && Object.keys(args).length === 0) {
  const parameterSchema = await parameterAnalyzer.analyzeOperation(operation);
  
  // Start conversation
  await conversationService.setPendingOperation(email, {
    toolName,
    apiName,
    operation,
    collectedParams: {},
    requiredParams: parameterSchema.required,
    optionalParams: parameterSchema.optional,
    schema: parameterSchema
  });

  // Let OpenAI generate the first question
  return await this.askForNextParameter(email, parameterSchema, userPrompt);
}
```

### Phase 4: OpenAI-Driven Parameter Questions

**New Method:** `askForNextParameter()`

```typescript
private async askForNextParameter(
  email: string,
  paramSchema: ParameterSchema,
  originalRequest: string
): Promise<any> {
  const context = await conversationService.getContext(email);
  const pending = context.pendingOperation;
  
  // Build prompt for OpenAI to generate a friendly question
  const systemPrompt = `You are helping a user provide parameters for an API call.

Original request: "${originalRequest}"
Operation: ${pending.toolName}

Parameters still needed:
${this.for matParametersForAI(paramSchema, pending.collectedParams)}

Your job: Ask the user ONE friendly question about the most important missing parameter.
- If it's a filter: Ask what they want to filter by (city? name? etc.)
- If it's pagination: Ask how many results they want
- If it's sorting: Ask how they want results ordered
- Keep it conversational and natural
- Suggest common options

DO NOT ask for all parameters at once. Just ask about ONE parameter in a friendly way.`;

  const response = await openAIService.createCompletion(
    [{role: 'system', content: systemPrompt}],
    {temperature: 0.7}
  );

  return {
    needsMoreInfo: true,
    message: response,
    collectingParameters: true
  };
}
```

**Key:** OpenAI generates the question dynamically based on:
- The parameter schema
- Original user request  
- What's already been collected
- Natural conversation flow

### Phase 5: Parse User Responses into Parameters

**New Method:** `continueParameterCollection()`

```typescript
private async continueParameterCollection(
  context: ConversationContext,
  userResponse: string
): Promise<any> {
  const pending = context.pendingOperation;
  
  // Use OpenAI to parse the user's response into structured parameters
  const systemPrompt = `You are parsing a user's response into API parameters.

Operation: ${pending.toolName}
Parameter Schema: ${JSON.stringify(pending.schema, null, 2)}
Already collected: ${JSON.stringify(pending.collectedParams, null, 2)}

User said: "${userResponse}"

Parse this into structured parameters. Examples:
- "city like West Val" → {filter: {city: {contains: "West Val"}}}
- "first 100" → {paging: {limit: 100, offset: 0}}
- "all addresses" → {paging: null, filter: null}
- "sorted by name" → {sorting: [{field: "name", direction: "ASC"}]}

Return ONLY valid JSON matching the parameter schema. If user wants defaults, use reasonable defaults.`;

  const parsed = await openAIService.createStructuredCompletion(
    [{role: 'system', content: systemPrompt}, {role: 'user', content: userResponse}],
    {type: 'json_object'}
  );

  // Merge parsed params with collected params
  const updatedParams = {...pending.collectedParams, ...parsed};
  await conversationService.updatePendingOperation(context.email, {
    collectedParams: updatedParams
  });

  // Check if we have enough to execute
  const hasAllRequired = pending.requiredParams.every(p => updatedParams[p] !== undefined);
  
  if (hasAllRequired) {
    // Optional: Ask if user wants to provide more params or execute now
    const optionalNeeded = pending.optionalParams.filter(p => !updatedParams[p]);
    
    if (optionalNeeded.length > 0) {
      return {
        needsMoreInfo: true,
        message: `Great! I have what I need. Would you like to add ${optionalNeeded.join(', ')} or should I go ahead with what we have?`,
        canExecuteNow: true,
        collectedParams: updatedParams
      };
    }
    
    // Execute the operation
    return await this.executeWithCollectedParams(context);
  }
  
  // Still missing required params - ask for next one
  return await this.askForNextParameter(context.email, pending.schema, userResponse);
}
```

### Phase 6: Execute with Collected Parameters

**New Method:** `executeWithCollectedParams()`

```typescript
private async executeWithCollectedParams(
  context: ConversationContext
): Promise<any> {
  const pending = context.pendingOperation;
  
  // Clear pending operation
  await conversationService.clearPendingOperation(context.email);
  
  // Execute the API call with collected params
  return await this.executeToolCall(
    pending.toolName,
    pending.collectedParams,
    apiToolMap
  );
}
```

## How It Works With Different APIs

### GraphQL APIs

**Example Schema:**
```graphql
type Query {
  eswAddresses(
    paging: PagingInput
    filter: EswAddressesDeepFilter
    sorting: [Sorting!]
  ): EswAddressesConnection!
}

input PagingInput {
  limit: Int
  offset: Int
}

input EswAddressesDeepFilter {
  city: StringFilter
  state: StringFilter
  zipCode: StringFilter
}

input StringFilter {
  equals: String
  contains: String
  startsWith: String
  endsWith: String
}

input Sorting {
  field: String!
  direction: SortDirection!
}

enum SortDirection {
  ASC
  DESC
}
```

**Parameter Analysis:**
```typescript
{
  parameters: [
    {
      name: "paging",
      type: "PagingInput",
      required: false,
      structure: {
        limit: "Int",
        offset: "Int"
      },
      defaults: {limit: 10, offset: 0}
    },
    {
      name: "filter", 
      type: "EswAddressesDeepFilter",
      required: false,
      structure: {
        city: {
          type: "StringFilter",
          operations: ["equals", "contains", "startsWith", "endsWith"]
        },
        state: {
          type: "StringFilter",
          operations: ["equals", "contains", "startsWith", "endsWith"]
        },
        zipCode: {
          type: "StringFilter",
          operations: ["equals", "contains", "startsWith", "endsWith"]
        }
      }
    },
    {
      name: "sorting",
      type: "[Sorting!]",
      required: false,
      structure: {
        field: "String! (one of: city, state, zipCode, etc.)",
        direction: "Enum (ASC, DESC)"
      }
    }
  ]
}
```

**Conversation Example:**
```
User: "list addresses"

System (analyzes schema, sees paging/filter/sorting are all optional):
  "Do you want all addresses, or would you like to filter by city, state, or 
   zip code? I can also limit results if you prefer."

User: "city like West Val"

System (parses: filter.city.contains = "West Val"):
  "Got it - filtering by city containing 'West Val'. How many results would 
   you like? (default is 10)"

User: "first 100" 

System (parses: paging.limit = 100):
  [Executes: eswAddresses(paging: {limit: 100, offset: 0}, 
                          filter: {city: {contains: "West Val"}})]
```

### REST APIs

**Example OpenAPI Schema:**
```json
{
  "paths": {
    "/api/users": {
      "get": {
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {"type": "integer", "default": 1}
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {"type": "integer", "default": 10}
          },
          {
            "name": "search",
            "in": "query",
            "schema": {"type": "string"}
          }
        ]
      }
    }
  }
}
```

**Parameter Analysis:**
```typescript
{
  parameters: [
    {
      name: "page",
      location: "query",
      type: "integer",
      required: false,
      default: 1
    },
    {
      name: "limit",
      location: "query",
      type: "integer",
      required: false,
      default: 10
    },
    {
      name: "search",
      location: "query",
      type: "string",
      required: false,
      description: "Search term to filter results"
    }
  ]
}
```

**Conversation Example:**
```
User: "list users"

System: "Would you like all users, or specific users matching a search term? 
         I can also limit the results."

User: "users with name john"

System (parses: search = "john"):
  "How many results? (default is 10)"
  
User: "give me 50"

System (parses: limit = 50):
  [Executes: GET /api/users?search=john&limit=50&page=1]
```

## Dynamic Schema Parsing

### For GraphQL

**File:** `server/src/intelligentQuery/services/GraphQLSchemaParser.ts`

**Add method:** `extractInputTypes()`

```typescript
/**
 * Extract INPUT type definitions from GraphQL schema
 */
extractInputTypes(schemaContent: string): Map<string, InputTypeDefinition> {
  const inputTypes = new Map();
  
  // Find all "input" type declarations
  const inputRegex = /input\s+(\w+)\s*\{([^}]+)\}/gs;
  let match;
  
  while ((match = inputRegex.exec(schemaContent)) !== null) {
    const [, typeName, fields] = match;
    
    const fieldMap = this.parseInputFields(fields);
    
    inputTypes.set(typeName, {
      name: typeName,
      fields: fieldMap
    });
  }
  
  // Also extract enum types
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/gs;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const [, enumName, values] = match;
    
    inputTypes.set(enumName, {
      name: enumName,
      isEnum: true,
      values: values.split(/[\n\s]+/).filter(v => v.length > 0)
    });
  }
  
  return inputTypes;
}
```

### For REST/OpenAPI

**File:** `server/src/intelligentQuery/services/ParameterSchemaAnalyzer.ts`

**New service to extract parameter schemas:**

```typescript
@Injectable()
export class ParameterSchemaAnalyzer {
  /**
   * Analyze operation parameters from OpenAPI schema
   */
  analyzeRESTParameters(operation: any): ParameterSchema[] {
    const params: ParameterSchema[] = [];
    
    // Query parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        params.push({
          name: param.name,
          location: param.in, // query, path, header
          type: param.schema?.type || 'string',
          required: param.required || false,
          default: param.schema?.default,
          enum: param.schema?.enum,
          description: param.description
        });
      }
    }
    
    // Request body parameters
    if (operation.requestBody?.content?.['application/json']?.schema) {
      const schema = operation.requestBody.content['application/json'].schema;
      
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          params.push({
            name: propName,
            location: 'body',
            type: (propSchema as any).type || 'object',
            required: schema.required?.includes(propName) || false,
            schema: propSchema,
            description: (propSchema as any).description
          });
        }
      }
    }
    
    return params;
  }
  
  /**
   * Analyze GraphQL operation parameters
   */
  analyzeGraphQLParameters(
    operation: GraphQLOperation,
    inputTypes: Map<string, InputTypeDefinition>
  ): ParameterSchema[] {
    const params: ParameterSchema[] = [];
    
    for (const param of operation.parameters) {
      const baseType = param.type.replace(/[\[\]!]/g, '');
      const inputTypeDef = inputTypes.get(baseType);
      
      params.push({
        name: param.name,
        type: param.type,
        required: param.required,
        structure: inputTypeDef ? this.expandInputType(inputTypeDef, inputTypes) : null,
        isEnum: inputTypeDef?.isEnum || false,
        enumValues: inputTypeDef?.values
      });
    }
    
    return params;
  }
  
  /**
   * Recursively expand input type to show full structure
   */
  private expandInputType(
    typeDef: InputTypeDefinition,
    allTypes: Map<string, InputTypeDefinition>
  ): any {
    if (typeDef.isEnum) {
      return { enum: typeDef.values };
    }
    
    const structure: any = {};
    for (const [fieldName, fieldType] of Object.entries(typeDef.fields || {})) {
      const baseType = (fieldType as string).replace(/[\[\]!]/g, '');
      const nestedType = allTypes.get(baseType);
      
      if (nestedType) {
        structure[fieldName] = this.expandInputType(nestedType, allTypes);
      } else {
        structure[fieldName] = fieldType;
      }
    }
    
    return structure;
  }
}
```

## Key Benefits of This Approach

### 1. **100% Dynamic**
- Works with ANY GraphQL schema
- Works with ANY OpenAPI schema
- No hardcoding of parameter types
- No hardcoding of conversation flow

### 2. **Natural Conversations**
- OpenAI generates questions dynamically
- Adapts to user responses
- Understands context and intent
- Parses natural language into structured data

### 3. **Smart Defaults**
- If user says "all results" → Omits pagination
- If user says "first 10" → Sets limit: 10
- If user skips optional params → Uses API defaults
- AI determines reasonable defaults when needed

### 4. **Handles Complexity**
- Nested input types (Filter with StringFilter, etc.)
- Array types (sorting: [Sorting!])
- Enum types (SortDirection: ASC | DESC)
- Required vs optional parameters
- Complex object structures

### 5. **Works Across APIs**
- Same conversation flow for GraphQL and REST
- Unified experience regardless of API type
- Parameter collection adapts to schema
- No special cases needed

## Implementation Phases

### Phase 1: Schema Analysis (Week 1, Days 1-2)
- [ ] Extend GraphQLSchemaParser to extract INPUT types
- [ ] Create ParameterSchemaAnalyzer service
- [ ] Parse nested input structures
- [ ] Extract enum values
- [ ] Test with real GraphQL schemas

### Phase 2: Conversation Tracking (Week 1, Days 3-4)
- [ ] Extend ConversationService with pendingOperation
- [ ] Add methods to store/retrieve parameter collection state
- [ ] Track which parameters have been collected
- [ ] Persist state across multiple requests

### Phase 3: OpenAI Integration (Week 1, Day 5)
- [ ] Create askForNextParameter() method
- [ ] Build prompts for OpenAI to generate questions
- [ ] Format parameter schemas for AI consumption
- [ ] Generate natural, conversational questions

### Phase 4: Response Parsing (Week 2, Days 1-2)
- [ ] Create continueParameterCollection() method
- [ ] Use OpenAI to parse natural language into parameters
- [ ] Handle different input formats ("first 10", "limit 10", "ten results")
- [ ] Validate parsed parameters against schema

### Phase 5: Execution Logic (Week 2, Days 3-4)
- [ ] Determine when to execute vs ask for more
- [ ] Handle "use defaults" responses
- [ ] Handle "that's all" / "go ahead" responses
- [ ] Execute with collected parameters

### Phase 6: Testing (Week 2, Day 5)
- [ ] Test with GraphQL operations
- [ ] Test with REST operations
- [ ] Test complex nested parameters
- [ ] Test with enums
- [ ] Test optional vs required params
- [ ] Test natural language variations

## Testing Strategy

### Unit Tests

**File:** `server/test/intelligentQuery/services/ParameterSchemaAnalyzer.spec.ts`

Test cases:
- Extract GraphQL input types
- Extract REST parameters
- Handle nested structures
- Handle enum types
- Handle array types
- Handle required vs optional

### Integration Tests

**File:** `server/test/intelligentQuery/integration/ConversationalParameters.integration.spec.ts`

Test scenarios:
```typescript
describe('Conversational Parameters', () => {
  it('should collect filter parameters conversationally', async () => {
    // User: "list addresses"
    // System: Asks about filtering
    // User: "city like West"
    // System: Asks about limit
    // User: "first 100"
    // System: Executes
  });
  
  it('should handle defaults', async () => {
    // User: "list addresses"
    // System: Asks questions
    // User: "use defaults"
    // System: Executes with defaults
  });
  
  it('should work with complex filters', async () => {
    // User: "find users"
    // System: Asks about search
    // User: "name starts with J and city is Provo"
    // System: Parses complex filter
    // System: Executes
  });
});
```

## Example: Complete Flow

```
=== Request 1 ===
User: "list addresses"

System Analysis:
- Operation: eswAddresses
- Parameters: paging (optional), filter (optional), sorting (optional)
- No parameters provided
- Start conversation

System: "Would you like all addresses, or filter by city, state, or zip code? 
         I can also limit the results if you prefer."

=== Request 2 ===
User: "city like West Val"

System Parsing:
- Detected filter request
- Parsed: {filter: {city: {contains: "West Val"}}}
- Still missing: paging, sorting (but optional)

System: "Got it! Filtering by city containing 'West Val'. How many results 
         would you like? (I can show first 10, 50, 100, or all)"

=== Request 3 ===
User: "first 100"

System Parsing:
- Detected pagination request  
- Parsed: {paging: {limit: 100, offset: 0}}
- Has filter + paging, sorting still optional

System: "Perfect! Should I sort the results in any particular way, or just 
         return them as-is?"

=== Request 4 ===
User: "that's fine"

System: [Executes]
Query: eswAddresses(
  paging: {limit: 100, offset: 0},
  filter: {city: {contains: "West Val"}},
  sorting: null
)

Returns: [100 addresses filtered by city]
```

## Conclusion

This approach provides:
- ✅ Natural conversational UX
- ✅ Works with ANY API schema
- ✅ No hardcoded questions or logic
- ✅ Smart AI-driven parameter collection
- ✅ Handles simple and complex parameters
- ✅ Provides defaults and guidance
- ✅ Fully dynamic and extensible

Total implementation time: **~2 weeks** (one developer)

The system becomes truly intelligent - not just routing to APIs, but having natural conversations to collect exactly what's needed to make the API call successfully.
