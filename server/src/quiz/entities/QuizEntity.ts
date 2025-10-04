import { prop, getModelForClass, modelOptions, Severity, index } from '@typegoose/typegoose';
import { QuizItem } from './QuizItemEntity.js';

/**
 * Quiz Entity
 * Represents a reusable quiz template with topic and questions.
 * 
 * NOTE: IntelliJ may mark this class as "unused" - this is a FALSE POSITIVE.
 * This class is actively used by Typegoose decorators and the TypeScript type system.
 */
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

const QuizModel = getModelForClass(Quiz);

export { Quiz, QuizModel };
