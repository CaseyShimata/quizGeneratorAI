import { ToolBuilder, OpenApiDoc } from '../../../src/openai/tools/ToolBuilder';

describe('ToolBuilder', () => {
  it('builds tools with nested object schemas and resolves local $refs', () => {
    const doc: OpenApiDoc = {
      components: {
        schemas: {
          Question: {
            type: 'object',
            required: ['prompt'],
            properties: {
              prompt: { type: 'string' },
              choices: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
      paths: {
        '/quizzes': {
          post: {
            operationId: 'createQuiz',
            summary: 'Create a quiz',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['title', 'questions'],
                    properties: {
                      title: { type: 'string' },
                      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                      meta: {
                        type: 'object',
                        properties: {
                          author: { type: 'string' },
                          tags: { type: 'array', items: { type: 'string' } },
                        },
                      },
                      questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } },
                    },
                  },
                },
              },
            },
          },
        },
        '/quizzes/{id}': {
          get: {
            operationId: 'getQuizById',
            summary: 'Get quiz by id',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
          },
        },
      },
    };

    const tools = ToolBuilder.buildTools(doc);
    const createTool = tools.find(t => t.function.name === 'createQuiz');
    const getTool = tools.find(t => t.function.name === 'getQuizById');

    expect(createTool).toBeTruthy();
    expect(getTool).toBeTruthy();

    const params = createTool!.function.parameters;
    expect(params.type).toBe('object');
    // top-level body fields should be exposed
    expect(Object.keys(params.properties)).toEqual(
      expect.arrayContaining(['title', 'difficulty', 'meta', 'questions'])
    );

    // nested meta object should include children
    const meta = (params as any).properties['meta'];
    expect(meta.type).toBe('object');
    expect(Object.keys(meta.properties)).toEqual(
      expect.arrayContaining(['author', 'tags'])
    );

    // questions should be an array of objects resolved via $ref
    const questions = (params as any).properties['questions'];
    expect(questions.type).toBe('array');
    expect(questions.items.type).toBe('object');
    expect(Object.keys(questions.items.properties)).toEqual(
      expect.arrayContaining(['prompt', 'choices'])
    );

    // required propagation for body-level fields
    expect(params.required).toEqual(expect.arrayContaining(['title', 'questions']));

    // get endpoint should include path parameter
    const getParams = getTool!.function.parameters;
    expect(getParams.required).toEqual(expect.arrayContaining(['id']));
  });
});
