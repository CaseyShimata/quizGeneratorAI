import { prop, getModelForClass, modelOptions, Severity, index } from '@typegoose/typegoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * SINGLE SOURCE OF TRUTH - Typegoose Entities
 * 
 * These classes serve as:
 * 1. TypeScript types
 * 2. Mongoose schemas
 * 3. Runtime validation (via Typegoose)
 * 
 * Naming Convention:
 * - Quiz: Reusable quiz template
 * - UserQuiz: Junction table (User × Quiz attempt)
 * - QuestionSelectedAnswers: Junction table (Question × Selected Answers)
 */

// ============================================================================
// Sub-Document Classes (Embedded types)
// ============================================================================

/**
 * NOTE: IntelliJ may mark these classes as "unused" - this is a FALSE POSITIVE.
 * These classes are actively used by:
 * 1. Typegoose decorators (@prop type references)
 * 2. TypeScript type system (imported as types in QuizService.ts)
 * 3. Runtime schema generation via getModelForClass()
 * IntelliJ doesn't recognize decorator-based or type-only usage as "real" usage.
 */

class Answer {
  @prop({ required: true, default: () => uuidv4() })
  public id!: string;

  @prop({ required: true })
  public text!: string;

  @prop({ required: true })
  public isCorrect!: boolean;

  @prop({ default: '' })
  public explanation!: string;
}

class QuizItem {
  @prop({ required: true, default: () => uuidv4() })
  public id!: string;

  @prop({ required: true })
  public question!: string;

  @prop({ type: () => [Answer], required: true })
  public answers!: Answer[];

  @prop({ default: false })
  public allowMultipleSelections!: boolean;
}

class QuestionSelectedAnswers {
  @prop({ required: true })
  public questionId!: string;

  @prop({ type: () => [String], required: true })
  public selectedAnswerIds!: string[];
}

// ============================================================================
// Document Classes (Collections)
// ============================================================================

@index({ topic: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: {
    collection: 'quizzes',
    timestamps: true
  },
  options: {
    allowMixed: Severity.ALLOW
  }
})
class Quiz {
  @prop({ required: true })
  public topic!: string;

  @prop({ type: () => [QuizItem], required: true })
  public quizItems!: QuizItem[];

  // Mongoose auto-generates these with timestamps: true
  public createdAt?: Date;
  public updatedAt?: Date;
}

@index({ email: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: {
    collection: 'userquizzes',
    timestamps: true
  },
  options: {
    allowMixed: Severity.ALLOW
  }
})
class UserQuiz {
  @prop({ required: true })
  public email!: string;

  @prop({ required: true, type: () => Quiz })
  public quiz!: Quiz;

  @prop({ type: () => [QuestionSelectedAnswers], required: true })
  public questionSelectedAnswers!: QuestionSelectedAnswers[];

  @prop({ default: 0 })
  public totalCorrect!: number;

  // Mongoose auto-generates these with timestamps: true
  public createdAt?: Date;
  public updatedAt?: Date;
}

// ============================================================================
// Model Generation
// ============================================================================

const QuizModel = getModelForClass(Quiz);
const UserQuizModel = getModelForClass(UserQuiz);

// ============================================================================
// OpenAI Structured Output Schema
// ============================================================================

/**
 * Manual JSON Schema for OpenAI's structured output API.
 * 
 * This schema mirrors the Typegoose entities above (Answer, QuizItem).
 * It must be manually maintained because OpenAI requires a very specific
 * JSON Schema format that automated tools don't generate correctly.
 * 
 * Co-located here with the entities to keep them in sync.
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

// ============================================================================
// Exports
// ============================================================================

export { Answer, QuizItem, QuestionSelectedAnswers, Quiz, UserQuiz };
export { QuizModel, UserQuizModel };
export { OpenAIQuizGenerationSchema };
