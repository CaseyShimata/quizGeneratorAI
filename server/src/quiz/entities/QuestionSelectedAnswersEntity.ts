import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Define a type for the hydrated Mongoose document
export type QuestionSelectedAnswersDocument = HydratedDocument<QuestionSelectedAnswers>;

@Schema()
class QuestionSelectedAnswers {
  @Prop({ required: true })
  questionId: string;

  @Prop({ type: () => [String], required: true })
  selectedAnswerIds: string[];
}

const QuestionSelectedAnswersSchema = SchemaFactory.createForClass(QuestionSelectedAnswers);

export { QuestionSelectedAnswers, QuestionSelectedAnswersSchema };
