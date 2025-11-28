import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Answer } from './AnswerEntity';

// Define a type for the hydrated Mongoose document
export type QuizItemDocument = HydratedDocument<QuizItem>;

@Schema()
class QuizItem {
  @Prop({ required: true, default: () => uuidv4() })
  id: string;

  @Prop({ required: true })
  question: string;

  @Prop({ type: () => [Answer], required: true })
  answers: Answer[];

  @Prop({ default: false })
  allowMultipleSelections: boolean;
}

const QuizItemSchema = SchemaFactory.createForClass(QuizItem);

export { QuizItem, QuizItemSchema };
