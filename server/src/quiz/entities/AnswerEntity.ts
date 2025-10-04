import { prop } from '@typegoose/typegoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * Answer Entity
 * Represents a single answer option for a quiz question.
 * 
 * NOTE: IntelliJ may mark this class as "unused" - this is a FALSE POSITIVE.
 * This class is actively used by Typegoose decorators and the TypeScript type system.
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

export { Answer };
