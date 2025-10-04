import { prop } from '@typegoose/typegoose';

/**
 * QuestionSelectedAnswers Entity
 * Junction entity that stores which answer IDs a user selected for a specific question.
 * 
 * NOTE: IntelliJ may mark this class as "unused" - this is a FALSE POSITIVE.
 * This class is actively used by Typegoose decorators and the TypeScript type system.
 */
class QuestionSelectedAnswers {
  @prop({ required: true })
  public questionId!: string;

  @prop({ type: () => [String], required: true })
  public selectedAnswerIds!: string[];
}

export { QuestionSelectedAnswers };
