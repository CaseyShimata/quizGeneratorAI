import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * SINGLE SOURCE OF TRUTH - All Quiz Schemas
 */

const AnswerZ = z.object({
  id: z.string().default(() => uuidv4()),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().default('')
});

const QuizItemZ = z.object({
  id: z.string().default(() => uuidv4()),
  question: z.string().min(1),
  answers: z.array(AnswerZ).length(4),
  selectedAnswerId: z.string().nullable().optional(),
  isCorrect: z.boolean().nullable().optional()
});

// What OpenAI generates (just topic + questions)
const GeneratedQuizContentZ = z.object({
  topic: z.string().min(1),
  quizItems: z.array(QuizItemZ).length(5)
});

// Complete quiz stored in DB
const QuizFormZ = z.object({
  _id: z.string().optional(),
  email: z.string().email(),
  topic: z.string().min(1),
  quizItems: z.array(QuizItemZ).length(5),
  totalCorrect: z.number().int().min(0).max(5).default(0),
  aiMetadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

type Answer = z.infer<typeof AnswerZ>;
type QuizItem = z.infer<typeof QuizItemZ>;
type GeneratedQuizContent = z.infer<typeof GeneratedQuizContentZ>;
type QuizForm = z.infer<typeof QuizFormZ>;

export { AnswerZ, QuizItemZ, GeneratedQuizContentZ, QuizFormZ };
export type { Answer, QuizItem, GeneratedQuizContent, QuizForm };
