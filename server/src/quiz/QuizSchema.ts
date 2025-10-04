import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * SINGLE SOURCE OF TRUTH - All Quiz Schemas
 * 
 * Design: Reusable base types composed into different contexts
 */

// ============================================================================
// Base Reusable Types (Used everywhere)
// ============================================================================

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
  allowMultipleSelections: z.boolean().default(false)
});

const SubmittedAnswerZ = z.object({
  questionId: z.string(),
  selectedAnswerIds: z.array(z.string()).min(1) // Array for multi-select support
});

// ============================================================================
// Context-Specific Schemas (Compose from base types)
// ============================================================================

// What OpenAI generates
const GeneratedQuizContentZ = z.object({
  topic: z.string().min(1),
  quizItems: z.array(QuizItemZ).length(5)
});

// Complete quiz form (stored in DB with user answers)
const QuizFormZ = z.object({
  _id: z.string().optional(),
  email: z.string().email(),
  topic: z.string().min(1),
  quizItems: z.array(QuizItemZ).length(5),
  submittedAnswers: z.array(SubmittedAnswerZ),
  totalCorrect: z.number().int().min(0).max(5).default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

// ============================================================================
// Type Exports (Derived from schemas)
// ============================================================================

type Answer = z.infer<typeof AnswerZ>;
type QuizItem = z.infer<typeof QuizItemZ>;
type SubmittedAnswer = z.infer<typeof SubmittedAnswerZ>;
type GeneratedQuizContent = z.infer<typeof GeneratedQuizContentZ>;
type QuizForm = z.infer<typeof QuizFormZ>;

// ============================================================================
// Exports
// ============================================================================

export { 
  AnswerZ, 
  QuizItemZ,
  SubmittedAnswerZ,
  GeneratedQuizContentZ, 
  QuizFormZ
};

export type { 
  Answer, 
  QuizItem,
  SubmittedAnswer,
  GeneratedQuizContent, 
  QuizForm
};
