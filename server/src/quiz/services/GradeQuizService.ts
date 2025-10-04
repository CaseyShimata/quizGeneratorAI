import { Injectable } from '@nestjs/common';
import { UserQuizModel, Quiz, UserQuiz, QuestionSelectedAnswers } from '../entities/index.js';

/**
 * Grade Quiz Service
 * Handles quiz grading logic and saving user quiz attempts.
 */
@Injectable()
class GradeQuizService {
  async execute(
    email: string, 
    quiz: Quiz,
    questionSelectedAnswers: QuestionSelectedAnswers[]
  ): Promise<UserQuiz> {

    let totalCorrect = 0;
    
    for (const selected of questionSelectedAnswers) {
      const question = quiz.quizItems.find(q => q.id === selected.questionId);
      if (!question) continue;

      const selectedAnswers = question.answers.filter(a => 
        selected.selectedAnswerIds.includes(a.id)
      );

      const correctAnswers = question.answers.filter(a => a.isCorrect);
      
      const allSelectedAreCorrect = selectedAnswers.every(a => a.isCorrect);
      const allCorrectAreSelected = question.allowMultipleSelections
        ? correctAnswers.every(ca => selected.selectedAnswerIds.includes(ca.id))
        : true;

      if (allSelectedAreCorrect && allCorrectAreSelected && selectedAnswers.length > 0) {
        totalCorrect++;
      }
    }

    // Create UserQuiz document
    const userQuiz = await UserQuizModel.create({
      email,
      quiz,
      questionSelectedAnswers,
      totalCorrect
    });

    return userQuiz.toObject() as UserQuiz;
  }
}

export { GradeQuizService };
