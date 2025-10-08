import { prop, getModelForClass, modelOptions, Severity, index } from '@typegoose/typegoose';
import { Quiz } from './QuizEntity.js';
import { QuestionSelectedAnswers } from './QuestionSelectedAnswersEntity.js';

/**
 * UserQuiz Entity
 * Represents a user's quiz attempt with their answers and score.
 * Embeds the complete Quiz to prevent data desynchronization.
 * 
 * NOTE: IntelliJ may mark this class as "unused" - this is a FALSE POSITIVE.
 * This class is actively used by Typegoose decorators and the TypeScript type system.
 */
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
  public questionsSelectedAnswers!: QuestionSelectedAnswers[];

  @prop({ default: 0 })
  public totalCorrect!: number;

  // Mongoose auto-generates these with timestamps: true
  public createdAt?: Date;
  public updatedAt?: Date;
}

const UserQuizModel = getModelForClass(UserQuiz);

export { UserQuiz, UserQuizModel };


//TODO: switch out all TypeGoose with modern type inference available as utility in modern mongoose package

// const userQuizSchema = new Schema({
//     email: { type: String, required: true },
//     // Embed the sub-document schema directly
//     quiz: { type: quizSchema, required: true },
//     // Embed the array of sub-document schemas directly
//     questionSelectedAnswers: {
//         type: [questionSelectedAnswersSchema],
//         required: true,
//     },
//     totalCorrect: { type: Number, default: 0 },
// }, {
//     collection: 'userquizzes',
//     timestamps: true,
//     strict: false, // For `allowMixed: Severity.ALLOW`
// });
//
// // Infer the plain document type from the schema
// type IUserQuiz = InferSchemaType<typeof userQuizSchema>;
//
// // Infer the full hydrated document type and create the model
// const UserQuizModel = model<IUserQuiz>('UserQuiz', userQuizSchema);
