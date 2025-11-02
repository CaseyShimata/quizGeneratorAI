import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { QuizItem } from './QuizItemEntity';

// Define a type for the hydrated Mongoose document
export type QuizDocument = HydratedDocument<Quiz>;

@Schema({
  collection: 'quizzes',
  timestamps: true,
})
class Quiz {
  @Prop({ required: true, index: true })
  topic: string;

  @Prop({ type: () => [QuizItem], required: true })
  quizItems: QuizItem[];

  // Mongoose auto-generates these with timestamps: true
  createdAt?: Date;
  updatedAt?: Date;
}

const QuizSchema = SchemaFactory.createForClass(Quiz);

export { Quiz, QuizSchema };
