import { Schema, model } from 'mongoose';

/**
 * Hand-written Mongoose schema that matches QuizFormZ structure
 * Keeps answer structure reusable and consistent
 */

const AnswerSchema = new Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
  explanation: { type: String, default: '' }
}, { _id: false });

const QuizItemSchema = new Schema({
  id: { type: String, required: true },
  question: { type: String, required: true },
  answers: [AnswerSchema],
  allowMultipleSelections: { type: Boolean, default: false }
}, { _id: false });

const SubmittedAnswerSchema = new Schema({
  questionId: { type: String, required: true },
  selectedAnswerIds: [{ type: String, required: true }]
}, { _id: false });

const QuizFormSchema = new Schema({
  email: { type: String, required: true },
  topic: { type: String, required: true },
  quizItems: [QuizItemSchema],
  submittedAnswers: [SubmittedAnswerSchema],
  totalCorrect: { type: Number, default: 0 }
}, { timestamps: true });

QuizFormSchema.index({ email: 1, createdAt: -1 });

const QuizModel = model('Quiz', QuizFormSchema);

export { QuizModel };
