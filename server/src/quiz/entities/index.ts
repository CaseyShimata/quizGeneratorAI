/**
 * Entities Index
 * Central export point for all quiz-related entities and schemas.
 * This makes imports cleaner throughout the application.
 */

// Import classes for schema registration
import { UserQuiz, UserQuizSchema, UserQuizDocument } from './UserQuizEntity';

export { Answer, AnswerSchema } from './AnswerEntity';
export { QuizItem, QuizItemSchema } from './QuizItemEntity';
export {
  QuestionSelectedAnswers,
  QuestionSelectedAnswersSchema,
} from './QuestionSelectedAnswersEntity';
export { Quiz, QuizSchema } from './QuizEntity';
export { UserQuiz, UserQuizSchema } from './UserQuizEntity';
export type { UserQuizDocument } from './UserQuizEntity';
export type { AnswerDocument } from './AnswerEntity';
export type { QuizItemDocument } from './QuizItemEntity';
export type { QuestionSelectedAnswersDocument } from './QuestionSelectedAnswersEntity';
export type { QuizDocument } from './QuizEntity';

/**
 * All Mongoose schemas for this module
 * Use this array in QuizModule to register all schemas at once
 */
export const ALL_QUIZ_SCHEMAS = [
  { name: UserQuiz.name, schema: UserQuizSchema },
];
