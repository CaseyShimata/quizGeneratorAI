import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Quiz } from './QuizEntity';
import { QuestionSelectedAnswers } from './QuestionSelectedAnswersEntity';

// Define a type for the hydrated Mongoose document
export type UserQuizDocument = HydratedDocument<UserQuiz>;

@Schema({
  collection: 'userquizzes',
  timestamps: true,
})
class UserQuiz {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true, type: () => Quiz })
  quiz: Quiz;

  @Prop({ type: () => [QuestionSelectedAnswers], required: true })
  questionsSelectedAnswers: QuestionSelectedAnswers[];

  @Prop({ default: 0 })
  totalCorrect: number;

  // Mongoose auto-generates these with timestamps: true
  createdAt?: Date;
  updatedAt?: Date;
}

const UserQuizSchema = SchemaFactory.createForClass(UserQuiz);

export { UserQuiz, UserQuizSchema };
