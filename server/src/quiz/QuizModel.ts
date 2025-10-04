import { Schema, model } from 'mongoose';

// Simple hand-written Mongoose schema matching our Zod schema
const QuizSchema = new Schema({
  email: { type: String, required: true },
  topic: { type: String, required: true },
  quizItems: [{
    id: { type: String, required: true },
    question: { type: String, required: true },
    answers: [{
      id: { type: String, required: true },
      text: { type: String, required: true },
      isCorrect: { type: Boolean, required: true },
      explanation: { type: String, default: '' }
    }],
    selectedAnswerId: { type: String, default: null },
    isCorrect: { type: Boolean, default: null }
  }],
  totalCorrect: { type: Number, default: 0 },
  aiMetadata: { type: Schema.Types.Mixed }
}, { timestamps: true });

QuizSchema.index({ email: 1, createdAt: -1 });

const QuizModel = model('Quiz', QuizSchema);

export { QuizModel };
