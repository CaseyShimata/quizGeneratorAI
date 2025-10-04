import { prop } from '@typegoose/typegoose';
import { v4 as uuidv4 } from 'uuid';
import { Answer } from './AnswerEntity.js';

/**
 * QuizItem Entity
 * Represents a single question in a quiz with its answer options.
 * 
 * NOTE: IntelliJ may mark this class as "unused" - this is a FALSE POSITIVE.
 * This class is actively used by Typegoose decorators and the TypeScript type system.
 */
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

export { QuizItem };
