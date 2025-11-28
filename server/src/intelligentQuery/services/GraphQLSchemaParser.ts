import { Injectable, Logger } from '@nestjs/common';

/**
 * GraphQL Schema Parser
 * Parses GraphQL schema definitions (.gql files) and extracts operations
 */
@Injectable()
export class GraphQLSchemaParser {
  private readonly logger = new Logger(GraphQLSchemaParser.name);

  /**
   * Parse GraphQL schema string and extract query/mutation operations
   */
  parseSchema(schemaContent: string): {
    queries: Map<string, GraphQLOperation>;
    mutations: Map<string, GraphQLOperation>;
  } {
    const queries = new Map<string, GraphQLOperation>();
    const mutations = new Map<string, GraphQLOperation>();

    try {
      // Extract Query type
      const queryType = this.extractType(schemaContent, 'Query');
      if (queryType) {
        this.parseFields(queryType).forEach((op, name) => {
          queries.set(name, op);
        });
      }

      // Extract Mutation type
      const mutationType = this.extractType(schemaContent, 'Mutation');
      if (mutationType) {
        this.parseFields(mutationType).forEach((op, name) => {
          mutations.set(name, op);
        });
      }

      this.logger.log(
        `Parsed GraphQL schema: ${queries.size} queries, ${mutations.size} mutations`,
      );
    } catch (error: any) {
      this.logger.error('Failed to parse GraphQL schema:', error);
    }

    return { queries, mutations };
  }

  /**
   * Extract a specific type definition from schema
   * Uses brace counting to handle nested types properly
   */
  private extractType(schema: string, typeName: string): string | null {
    // Find the type declaration
    const typeStart = schema.indexOf(`type ${typeName}`);
    if (typeStart === -1) return null;

    // Find the opening brace
    const firstBrace = schema.indexOf('{', typeStart);
    if (firstBrace === -1) return null;

    // Count braces to find the matching closing brace
    let braceCount = 1;
    let i = firstBrace + 1;

    while (i < schema.length && braceCount > 0) {
      if (schema[i] === '{') braceCount++;
      if (schema[i] === '}') braceCount--;
      i++;
    }

    // Extract content between braces
    if (braceCount === 0) {
      return schema.substring(firstBrace + 1, i - 1);
    }

    this.logger.warn(`Failed to find closing brace for type ${typeName}`);
    return null;
  }

  /**
   * Parse fields from a type definition
   */
  private parseFields(typeContent: string): Map<string, GraphQLOperation> {
    const operations = new Map<string, GraphQLOperation>();

    // Match field definitions
    const fieldRegex = /(\w+)\s*(?:\([^)]*\))?\s*:\s*([^\n]+)/g;
    let match;

    while ((match = fieldRegex.exec(typeContent)) !== null) {
      const [, fieldName, returnType] = match;

      // Extract parameters from the field
      const paramMatch = typeContent.match(
        new RegExp(`${fieldName}\\s*\\(([^)]*)\\)`, 's'),
      );
      const params = paramMatch ? this.parseParameters(paramMatch[1]) : [];

      operations.set(fieldName, {
        name: fieldName,
        returnType: returnType.trim(),
        parameters: params,
        description: this.extractDescription(typeContent, fieldName),
      });
    }

    return operations;
  }

  /**
   * Parse parameter list
   */
  private parseParameters(paramString: string): GraphQLParameter[] {
    const params: GraphQLParameter[] = [];

    // Match parameters: name: Type or name: Type!
    const paramRegex = /(\w+)\s*:\s*([^,\n]+)/g;
    let match;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const [, name, type] = match;
      const isRequired = type.includes('!');
      const cleanType = type.replace(/!/g, '').trim();

      params.push({
        name,
        type: cleanType,
        required: isRequired,
      });
    }

    return params;
  }

  /**
   * Extract description/comment before a field
   */
  private extractDescription(content: string, fieldName: string): string {
    const lines = content.split('\n');
    let description = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this line contains our field
      if (line.includes(fieldName)) {
        // Look backwards for comments
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim();
          if (prevLine.startsWith('#') || prevLine.startsWith('"""')) {
            description =
              prevLine.replace(/^[#"]+/, '').trim() + ' ' + description;
          } else if (prevLine === '') {
            continue;
          } else {
            break;
          }
        }
        break;
      }
    }

    return description.trim();
  }

  /**
   * Analyze parameter structure for nested/recursive relationships
   * Returns information about parameter depth and cyclic dependencies
   */
  analyzeParameterStructure(
    schemaContent: string,
    parameterType: string,
    visited: Set<string> = new Set(),
    depth: number = 0,
  ): ParameterStructureAnalysis {
    const maxDepth = 5;
    const cleanType = parameterType.replace(/[[\]!]/g, '').trim();

    // Initialize analysis
    const analysis: ParameterStructureAnalysis = {
      typeName: cleanType,
      depth,
      isCyclic: visited.has(cleanType),
      hasNestedStructure: false,
      nestedTypes: [],
      optionalFields: [],
      requiredFields: [],
      maxPossibleDepth: depth,
    };

    // Check for cycles
    if (visited.has(cleanType)) {
      return analysis;
    }

    // Check max depth
    if (depth >= maxDepth) {
      analysis.reachedMaxDepth = true;
      return analysis;
    }

    // Get input type definition
    const inputTypes = this.extractInputTypes(schemaContent);
    const inputType = inputTypes.get(cleanType);

    if (!inputType || inputType.isEnum) {
      return analysis;
    }

    // Mark as visited
    const newVisited = new Set(visited);
    newVisited.add(cleanType);

    // Analyze fields
    if (inputType.fields) {
      for (const [fieldName, fieldType] of Object.entries(
        inputType.fields as Record<string, string>,
      )) {
        const isRequired = (fieldType as string).includes('!');
        const cleanFieldType = (fieldType as string)
          .replace(/[[\]!]/g, '')
          .trim();

        if (isRequired) {
          analysis.requiredFields.push(fieldName);
        } else {
          analysis.optionalFields.push(fieldName);
        }

        // Check if field is a complex type (not scalar)
        const scalarTypes = [
          'String',
          'Int',
          'Float',
          'Boolean',
          'ID',
          'DateTime',
        ];
        if (!scalarTypes.includes(cleanFieldType)) {
          analysis.hasNestedStructure = true;

          // Recursively analyze nested type
          const nestedAnalysis = this.analyzeParameterStructure(
            schemaContent,
            cleanFieldType,
            newVisited,
            depth + 1,
          );

          analysis.nestedTypes.push({
            fieldName,
            analysis: nestedAnalysis,
          });

          // Track max depth
          if (nestedAnalysis.maxPossibleDepth > analysis.maxPossibleDepth) {
            analysis.maxPossibleDepth = nestedAnalysis.maxPossibleDepth;
          }

          // Check if nested type is cyclic
          if (nestedAnalysis.isCyclic) {
            analysis.hasCyclicDependencies = true;
          }
        }
      }
    }

    return analysis;
  }

  /**
   * Extract INPUT type definitions from GraphQL schema
   */
  extractInputTypes(schemaContent: string): Map<string, any> {
    const inputTypes = new Map();

    // Find all "input" type declarations
    const inputRegex = /input\s+(\w+)\s*\{([^}]+)\}/gs;
    let match;

    while ((match = inputRegex.exec(schemaContent)) !== null) {
      const [, typeName, fields] = match;

      const fieldMap = this.parseInputFields(fields);

      inputTypes.set(typeName, {
        name: typeName,
        fields: fieldMap,
      });
    }

    // Also extract enum types
    const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/gs;
    while ((match = enumRegex.exec(schemaContent)) !== null) {
      const [, enumName, values] = match;

      inputTypes.set(enumName, {
        name: enumName,
        isEnum: true,
        values: values
          .split(/[\n\s]+/)
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      });
    }

    return inputTypes;
  }

  /**
   * Parse input field definitions into a field map
   */
  private parseInputFields(fieldsContent: string): Record<string, string> {
    const fieldMap: Record<string, string> = {};

    // Match field definitions: fieldName: Type or fieldName: Type!
    const fieldRegex = /(\w+)\s*:\s*([^\n]+)/g;
    let match;

    while ((match = fieldRegex.exec(fieldsContent)) !== null) {
      const [, fieldName, fieldType] = match;
      fieldMap[fieldName] = fieldType.trim();
    }

    return fieldMap;
  }

  /**
   * Extract comparison operators from a comparison type (e.g., StringFieldComparison)
   * Returns available operators grouped by category
   */
  extractComparisonOperators(
    schemaContent: string,
    comparisonTypeName: string,
  ): {
    patternMatch: string[]; // like, iLike, contains
    exactMatch: string[]; // eq, neq
    rangeMatch: string[]; // gt, gte, lt, lte
    listMatch: string[]; // in, notIn
    all: string[];
  } {
    const result = {
      patternMatch: [] as string[],
      exactMatch: [] as string[],
      rangeMatch: [] as string[],
      listMatch: [] as string[],
      all: [] as string[],
    };

    // Find the input type definition
    const inputRegex = new RegExp(
      `input\\s+${comparisonTypeName}\\s*\\{([^}]+)\\}`,
      's',
    );
    const match = inputRegex.exec(schemaContent);

    if (!match) {
      return result;
    }

    const fieldsContent = match[1];
    const fieldMap = this.parseInputFields(fieldsContent);

    // Categorize operators
    for (const fieldName of Object.keys(fieldMap)) {
      result.all.push(fieldName);

      // Pattern matching operators
      if (['like', 'iLike', 'contains', 'notLike', 'notILike'].includes(fieldName)) {
        result.patternMatch.push(fieldName);
      }
      // Exact match operators
      else if (['eq', 'neq', 'is', 'isNot'].includes(fieldName)) {
        result.exactMatch.push(fieldName);
      }
      // Range operators
      else if (['gt', 'gte', 'lt', 'lte', 'between', 'notBetween'].includes(fieldName)) {
        result.rangeMatch.push(fieldName);
      }
      // List operators
      else if (['in', 'notIn'].includes(fieldName)) {
        result.listMatch.push(fieldName);
      }
    }

    return result;
  }

  /**
   * Find the best matching field from schema for an invalid field name
   * Returns null if no suitable match found
   */
  findBestFieldMatch(
    invalidFieldName: string,
    availableFields: string[],
    intent: 'pattern' | 'exact' | 'range' | 'list' | 'auto' = 'auto',
  ): string | null {
    if (availableFields.includes(invalidFieldName)) {
      return invalidFieldName; // Already valid
    }

    // Auto-detect intent from field name
    if (intent === 'auto') {
      if (['contains', 'like', 'ilike', 'match', 'search'].includes(invalidFieldName.toLowerCase())) {
        intent = 'pattern';
      } else if (['equals', 'eq', 'is'].includes(invalidFieldName.toLowerCase())) {
        intent = 'exact';
      }
    }

    // Pattern matching intent - prefer like > iLike > contains > eq
    // Note: 'like' works with both PostgreSQL and Oracle, 'iLike' only works with PostgreSQL
    if (intent === 'pattern') {
      const preferenceOrder = ['like', 'iLike', 'contains', 'eq'];
      for (const preferred of preferenceOrder) {
        if (availableFields.includes(preferred)) {
          return preferred;
        }
      }
    }

    // Exact match intent
    if (intent === 'exact') {
      const preferenceOrder = ['eq', 'is'];
      for (const preferred of preferenceOrder) {
        if (availableFields.includes(preferred)) {
          return preferred;
        }
      }
    }

    // No match found
    return null;
  }

  /**
   * Build OpenAI function tool from GraphQL operation
   */
  buildToolFromOperation(
    operationName: string,
    operation: GraphQLOperation,
    operationType: 'query' | 'mutation',
  ): any {
    const parameters: any = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Add parameters to schema
    for (const param of operation.parameters) {
      parameters.properties[param.name] = {
        type: this.graphQLTypeToJsonType(param.type),
        description: `Parameter of type ${param.type}`,
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
   * Convert GraphQL type to JSON Schema type
   */
  private graphQLTypeToJsonType(gqlType: string): string {
    // Remove array brackets, exclamation marks from GraphQL type
    const cleanType = gqlType.replace(/\[|\]|!/g, '').trim();

    if (cleanType === 'String') return 'string';
    if (cleanType === 'Int' || cleanType === 'Float') return 'number';
    if (cleanType === 'Boolean') return 'boolean';
    if (cleanType === 'ID') return 'string';

    // For custom types, default to object
    return 'object';
  }

  /**
   * Extract all fields from a GraphQL type definition
   * Handles nested types with depth limiting to avoid infinite recursion
   */
  extractFieldsFromType(
    schemaContent: string,
    typeName: string,
    maxDepth: number = 2,
    currentDepth: number = 0,
  ): string {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      return '__typename';
    }

    // Handle scalar types - no fields to extract
    const scalarTypes = ['String', 'Int', 'Float', 'Boolean', 'ID'];
    const cleanTypeName = typeName.replace(/[\[\]!]/g, '').trim();
    if (scalarTypes.includes(cleanTypeName)) {
      return '';
    }

    // Handle Connection types (pagination patterns)
    if (cleanTypeName.includes('Connection')) {
      const nodeType = cleanTypeName.replace('Connection', '');
      const nodeFields = this.extractFieldsFromType(
        schemaContent,
        nodeType,
        maxDepth,
        currentDepth + 1,
      );

      // Build connection structure properly
      return `{
        edges {
          node ${nodeFields}
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        totalCount
      }`;
    }

    // Extract the type definition
    const typeContent = this.extractType(schemaContent, cleanTypeName);
    if (!typeContent) {
      // Type not found, return __typename as fallback
      return '__typename';
    }

    // Extract fields from the type
    const fields: string[] = [];
    const fieldRegex = /(\w+)\s*(?:\([^)]*\))?\s*:\s*([^\n]+)/g;
    let match;

    const visitedTypes = new Set<string>(); // Track visited types to avoid cycles

    while ((match = fieldRegex.exec(typeContent)) !== null) {
      const [, fieldName, fieldType] = match;
      const cleanFieldType = fieldType.replace(/[\[\]!]/g, '').trim();

      // Skip if we've already visited this type (circular reference)
      if (visitedTypes.has(cleanFieldType)) {
        continue;
      }

      // Check if this is a scalar type or special field
      const isScalar =
        scalarTypes.includes(cleanFieldType) ||
        fieldName === 'id' ||
        fieldName === '__typename';

      if (isScalar) {
        // Simple scalar field
        fields.push(fieldName);
      } else if (currentDepth < maxDepth - 1) {
        // Complex type - need to extract its fields
        visitedTypes.add(cleanFieldType);

        // Check if this type exists in schema
        const typeExists = this.extractType(schemaContent, cleanFieldType);

        if (typeExists) {
          // It's a defined type, recursively extract fields
          const nestedFields = this.extractFieldsFromType(
            schemaContent,
            cleanFieldType,
            maxDepth,
            currentDepth + 1,
          );

          if (nestedFields && nestedFields !== '__typename') {
            fields.push(`${fieldName} ${nestedFields}`);
          } else {
            // Type exists but no fields extracted, skip it
            continue;
          }
        } else {
          // Type not found in schema, might be enum or external - just include field name
          fields.push(fieldName);
        }
      } else {
        // At max depth, skip complex types to avoid nesting issues
        continue;
      }
    }

    // If no fields found, return __typename as fallback
    if (fields.length === 0) {
      return '__typename';
    }

    // Return fields without extra newlines/indentation to avoid syntax errors
    return `{ ${fields.join(' ')} }`;
  }
}

export interface GraphQLOperation {
  name: string;
  returnType: string;
  parameters: GraphQLParameter[];
  description?: string;
}

export interface GraphQLParameter {
  name: string;
  type: string;
  required: boolean;
}

export interface ParameterStructureAnalysis {
  typeName: string;
  depth: number;
  isCyclic: boolean;
  hasNestedStructure: boolean;
  nestedTypes: Array<{
    fieldName: string;
    analysis: ParameterStructureAnalysis;
  }>;
  optionalFields: string[];
  requiredFields: string[];
  maxPossibleDepth: number;
  reachedMaxDepth?: boolean;
  hasCyclicDependencies?: boolean;
}
