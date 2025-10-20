/**
 * Entities Index
 * Central export point for all quiz-related entities and schemas.
 * This makes imports cleaner throughout the application.
 */

// Import classes for schema registration
import { UserQuiz, UserQuizSchema, UserQuizDocument } from './UserQuizEntity.js';

export { Answer, AnswerSchema } from './AnswerEntity.js';
export { QuizItem, QuizItemSchema } from './QuizItemEntity.js';
export { QuestionSelectedAnswers, QuestionSelectedAnswersSchema } from './QuestionSelectedAnswersEntity.js';
export { Quiz, QuizSchema } from './QuizEntity.js';
export { UserQuiz, UserQuizSchema } from './UserQuizEntity.js';
export type { UserQuizDocument } from './UserQuizEntity.js';
export type { AnswerDocument } from './AnswerEntity.js';
export type { QuizItemDocument } from './QuizItemEntity.js';
export type { QuestionSelectedAnswersDocument } from './QuestionSelectedAnswersEntity.js';
export type { QuizDocument } from './QuizEntity.js';

/**
 * All Mongoose schemas for this module
 * Use this array in QuizModule to register all schemas at once
 */
export const ALL_QUIZ_SCHEMAS = [
  { name: UserQuiz.name, schema: UserQuizSchema }
];
