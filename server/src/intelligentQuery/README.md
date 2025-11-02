# Intelligent Query Module

## Overview
The intelligentQuery module provides AI-powered natural language query routing that works with **any GraphQL or REST API**. Users interact in plain English, and the system automatically routes to the correct API endpoints.

### Core Value Proposition
- 🤖 **Natural Language Interface** - "create a quiz about JavaScript" instead of API calls
- 🌐 **Universal API Support** - Works with any GraphQL or REST API
- 🔗 **Dynamic Discovery** - No hardcoding, just provide the schema
- 💬 **Smart Routing** - AI determines which endpoint to call
- 📚 **Schema-Driven** - Analyzes schemas automatically at runtime
- 🎯 **Zero Code Changes** - Add new APIs without modifying code

## Configuration

### External API Setup (.env)

```bash
# REST API Example
EXTERNAL_API_EXAMPLE_REST_NAME=example-api
EXTERNAL_API_EXAMPLE_REST_TYPE=rest
EXTERNAL_API_EXAMPLE_REST_URL=https://api.example.com
EXTERNAL_API_EXAMPLE_REST_AUTH_KEY=Authorization: Bearer token123
EXTERNAL_API_EXAMPLE_REST_DOC_PATH=./APIDocs/example-api.json

# GraphQL API Example
EXTERNAL_API_GRAPHQL_NAME=graphql-api
EXTERNAL_API_GRAPHQL_TYPE=graphql
EXTERNAL_API_GRAPHQL_URL=https://api.example.com/graphql
EXTERNAL_API_GRAPHQL_AUTH_KEY=Authorization: Bearer token456
EXTERNAL_API_GRAPHQL_DOC_PATH=./APIDocs/graphql-api.schema
```

### Internal API
Internal API is automatically registered using exported OpenAPI documentation from `/APIDocs/internalREST.json`.

## How It Works

### Example: "create a quiz about Python"

```
User: "create a quiz about Python"
  ↓
AI analyzes: user intent + available endpoints
  ↓
Selects: GenerateQuizController_generate
  ↓
Extracts: topic = "Python"
  ↓
Calls: POST /api/quiz/generate
  ↓
Returns: Generated quiz ✓
```

## Architecture

### Active Services

**IntelligentRouterService** - AI-powered routing
- Dynamically loads all APIs from schemas
- Uses OpenAI to understand user intent
- Routes to correct endpoint
- Extracts parameters from natural language
- Zero hardcoding!

**GraphQLSchemaParser** - GraphQL schema parsing
- Parses GraphQL schemas at runtime
- Extracts queries, mutations, and types
- Builds OpenAI function tools dynamically

**ExternalAPIManagerService** - API configuration
- Loads API configs from .env
- Manages API credentials
- Generates OpenAPI documentation

**ExternalAPIExecutionService** - API execution
- Executes REST requests
- Executes GraphQL queries
- Handles authentication
- Returns formatted responses

**InternalAPIIntegrationService** - Internal API integration
- Registers internal API automatically
- Treats internal API same as external

**ConversationService** - Conversation state
- Tracks conversation history per user
- Maintains context across messages

## File Structure
```
server/src/intelligentQuery/
├── IntelligentQueryModule.ts
├── README.md
├── controllers/
│   └── IntelligentQueryController.ts
└── services/
    ├── IntelligentRouterService.ts          # AI routing
    ├── GraphQLSchemaParser.ts               # GraphQL parsing
    ├── ExternalAPIManagerService.ts         # API management
    ├── ExternalAPIExecutionService.ts       # API execution
    ├── InternalAPIIntegrationService.ts     # Internal API
    └── ConversationService.ts               # Conversation tracking
```

## Key Features

### 1. Dynamic API Discovery
Add any API without code changes:
```bash
# Add to .env
EXTERNAL_API_MYAPI_NAME=my-api
EXTERNAL_API_MYAPI_TYPE=graphql
EXTERNAL_API_MYAPI_URL=https://api.example.com/graphql
EXTERNAL_API_MYAPI_DOC_PATH=./APIDocs/my-api.schema
```

System automatically:
- Loads the schema
- Parses all operations
- Makes them available to AI
- Routes requests correctly

### 2. Smart Action Detection
```typescript
// Action queries → Force API call
"create a quiz"  → Calls API
"list my quizzes" → Calls API
"update order"   → Calls API

// Informational queries → Text response
"what can you do"    → Returns explanation
"how does this work" → Returns description
```

### 3. Parameter Extraction
```typescript
User: "create a quiz about JavaScript 10 questions very hard"
  ↓
AI extracts: topic = "JavaScript"
AI ignores:  "10 questions very hard" (not API parameters)
  ↓
Calls: generate(email, topic: "JavaScript")
```

### 4. GraphQL Support
Automatically parses and supports:
- Queries
- Mutations
- Complex types
- Nested parameters
- Filter types

Tested with 371 operations from production GraphQL API ✓

## Usage Example

```typescript
// User message
POST /api/intelligent-query
{
  "email": "user@example.com",
  "message": "create a quiz about Python"
}

// System response
{
  "api": "internalREST",
  "function": "GenerateQuizController_generate",
  "arguments": {
    "email": "user@example.com",
    "topic": "Python"
  },
  "result": {
    "quiz": {
      "topic": "Python",
      "quizItems": [...]
    }
  }
}
```

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Database  
MONGODB_URI=mongodb://localhost:27017/quiz-generator

# API Configuration
API_BASE_URL=http://localhost:3000

# External APIs (optional, add as many as needed)
EXTERNAL_API_*_NAME=...
EXTERNAL_API_*_TYPE=rest|graphql
EXTERNAL_API_*_URL=...
EXTERNAL_API_*_AUTH_KEY=...
EXTERNAL_API_*_DOC_PATH=...
```

## Testing

```bash
# Start server
yarn start:dev

# Test quiz creation
curl -X POST http://localhost:3000/api/intelligent-query \
  -H "Content-Type: application/json" \
  -d '{"message": "create a quiz about JavaScript", "email": "test@test.com"}'

# Test informational query
curl -X POST http://localhost:3000/api/intelligent-query \
  -H "Content-Type: application/json" \
  -d '{"message": "what can you do", "email": "test@test.com"}'
```

## Success Criteria

✅ Users can interact in natural language  
✅ System works with any GraphQL or REST API  
✅ Zero hardcoding required  
✅ AI determines dependencies at runtime  
✅ Add new APIs by just providing schemas  
✅ No code changes needed for new APIs  

## Design Philosophy

**100% Dynamic**: The system discovers everything at runtime by analyzing schemas. There is NO hardcoded logic for specific operations, entities, or relationships.

**AI-Powered**: OpenAI analyzes user intent and API schemas together to determine:
- Which endpoint to call
- What parameters to extract
- How to handle the response

**Schema-Driven**: Everything comes from API schemas:
- GraphQL introspection
- OpenAPI specifications
- Type definitions
- Parameter requirements

This is the intelligent query system as it should be: truly intelligent, truly dynamic.
