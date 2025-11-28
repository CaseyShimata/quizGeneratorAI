/**
 * ToolBuilder
 * Converts an OpenAPI (Swagger) document into OpenAI function tools.
 * - Uses operationId as the function name when available (camelCase/PascalCase friendly)
 * - Falls back to METHOD+PascalPath format when operationId is missing
 * - Includes nested object schemas and resolves local $refs
 */

export type OpenApiDoc = {
  paths?: Record<string, any>;
  components?: { schemas?: Record<string, any> };
};

export type OpenAITool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
};

export class ToolBuilder {
  static buildTools(doc: OpenApiDoc): OpenAITool[] {
    if (!doc || !doc.paths) return [];

    const tools: OpenAITool[] = [];

    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, details] of Object.entries(
        methods as Record<string, any>,
      )) {
        if (
          !['get', 'post', 'put', 'delete', 'patch'].includes(
            method.toLowerCase(),
          )
        )
          continue;

        const operation = details;
        const parameters = ToolBuilder.buildParameters(operation, doc);
        const name = ToolBuilder.getOperationName(operation, method, path);
        const description =
          operation.summary ||
          operation.description ||
          `${method.toUpperCase()} ${path}`;

        // Include GET operations even if they declare no parameters
        if (
          Object.keys(parameters.properties).length === 0 &&
          method.toLowerCase() !== 'get'
        ) {
          continue;
        }

        tools.push({
          type: 'function',
          function: {
            name,
            description,
            parameters,
          },
        });
      }
    }

    return tools;
  }

  static buildParameters(
    operation: any,
    doc: OpenApiDoc,
  ): { type: 'object'; properties: Record<string, any>; required: string[] } {
    const parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    } = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Query/path parameters
    if (operation.parameters) {
      operation.parameters.forEach((param: any) => {
        const location = param.in;
        if (location === 'query' || location === 'path') {
          const schema = ToolBuilder.simplifySchema(param.schema, doc);
          if (schema) {
            parameters.properties[param.name] = {
              ...schema,
              description: param.description || '',
            };
            if (param.required) parameters.required.push(param.name);
          }
        }
      });
    }

    // JSON request body
    const bodySchema =
      operation.requestBody?.content?.['application/json']?.schema;
    if (bodySchema) {
      const simplified = ToolBuilder.simplifySchema(bodySchema, doc);
      if (simplified && simplified.type === 'object' && simplified.properties) {
        Object.assign(parameters.properties, simplified.properties);
        if (Array.isArray(simplified.required)) {
          parameters.required.push(
            ...simplified.required.filter(
              (r: string) => r in parameters.properties,
            ),
          );
        }
      }
    }

    return parameters;
  }

  static simplifySchema(schema: any, doc: OpenApiDoc, depth = 0): any | null {
    if (!schema || depth > 5) return null; // guard against excessive nesting

    if (schema.$ref && typeof schema.$ref === 'string') {
      const ref = schema.$ref.replace(/^#\//, '');
      const parts = ref.split('/');
      if (
        parts.length >= 3 &&
        parts[0] === 'components' &&
        parts[1] === 'schemas'
      ) {
        const name = parts[2];
        const target = doc.components?.schemas?.[name];
        if (target) return ToolBuilder.simplifySchema(target, doc, depth + 1);
      }
      return null;
    }

    const type = schema.type;
    if (!type) return null;

    if (['string', 'number', 'integer', 'boolean'].includes(type)) {
      const out: any = { type };
      if (schema.enum) out.enum = schema.enum;
      if (schema.format) out.format = schema.format;
      return out;
    }

    if (type === 'array' && schema.items) {
      const itemSchema = ToolBuilder.simplifySchema(
        schema.items,
        doc,
        depth + 1,
      );
      if (itemSchema) {
        return { type: 'array', items: itemSchema };
      }
      return { type: 'array', items: { type: 'string' } }; // safe fallback
    }

    if (type === 'object') {
      const properties: Record<string, any> = {};
      const required: string[] = Array.isArray(schema.required)
        ? schema.required.slice()
        : [];

      if (schema.properties) {
        for (const [key, child] of Object.entries(schema.properties)) {
          const simplified = ToolBuilder.simplifySchema(
            child as any,
            doc,
            depth + 1,
          );
          if (simplified) properties[key] = simplified;
        }
      }

      return { type: 'object', properties, required };
    }

    return null;
  }

  static getOperationName(
    operation: any,
    method: string,
    path: string,
  ): string {
    if (operation?.operationId && typeof operation.operationId === 'string') {
      return operation.operationId; // honor existing camelCase/PascalCase naming
    }
    // Fallback: METHOD+PascalPath (no underscores)
    const methodPart = method.toUpperCase();
    const pathPart = path
      .split('/')
      .filter(Boolean)
      .map((seg) => seg.replace(/\{|\}/g, ''))
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
      .join('');
    return `${methodPart}${pathPart}`;
  }
}
