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
            description = prevLine.replace(/^[#"]+/, '').trim() + ' ' + description;
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
    const cleanType = gqlType.replace(/[\[\]!]/g, '').trim();

    if (cleanType === 'String') return 'string';
    if (cleanType === 'Int' || cleanType === 'Float') return 'number';
    if (cleanType === 'Boolean') return 'boolean';
    if (cleanType === 'ID') return 'string';

    // For custom types, default to object
    return 'object';
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
