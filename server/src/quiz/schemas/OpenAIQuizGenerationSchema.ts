/**
 * OpenAI Quiz Generation Schema
 * 
 * Manual JSON Schema for OpenAI's structured output API.
 * This schema must be manually maintained because OpenAI requires a very specific
 * JSON Schema format that automated tools don't generate correctly.
 * 
 * This schema mirrors the Quiz entity structure (topic + quizItems with answers).
 */
const OpenAIQuizGenerationSchema = {
  name: 'quiz_generation',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      quizItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            answers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                  explanation: { type: 'string' }
                },
                required: ['id', 'text', 'isCorrect', 'explanation'],
                additionalProperties: false
              }
            }
          },
          required: ['id', 'question', 'answers'],
          additionalProperties: false
        }
      }
    },
    required: ['topic', 'quizItems'],
    additionalProperties: false
  }
};

export { OpenAIQuizGenerationSchema };
