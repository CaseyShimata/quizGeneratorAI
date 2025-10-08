/**
 * Quiz TypeScript Types
 * Mirror the server entity structure
 */

export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizItem {
  id: string;
  question: string;
  answers: Answer[];
  allowMultipleSelections?: boolean;
}

export interface Quiz {
  topic: string;
  quizItems: QuizItem[];
}

export interface QuestionSelectedAnswers {
  questionId: string;
  selectedAnswerIds: string[];
}

export interface UserQuiz {
  email: string;
  quiz: Quiz;
  questionsSelectedAnswers: QuestionSelectedAnswers[];
  totalCorrect: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface QuizFormData {
  email: string;
  topic: string;
}
