import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Define a type for the hydrated Mongoose document
export type AnswerDocument = HydratedDocument<Answer>;

@Schema()
class Answer {
  @Prop({ required: true, default: () => uuidv4() })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  isCorrect: boolean;

  @Prop({ default: '' })
  explanation: string;
}

const AnswerSchema = SchemaFactory.createForClass(Answer);

export { Answer, AnswerSchema };
