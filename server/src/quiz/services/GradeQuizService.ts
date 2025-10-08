import { Injectable } from '@nestjs/common';
import {UserQuizModel, Quiz, UserQuiz, QuestionSelectedAnswers, Answer} from '../entities/index.js';

/**
 * Grade Quiz Service
 * Handles quiz grading logic and saving user quiz attempts.
 */
@Injectable()
class GradeQuizService {
  async execute(
    email: string, 
    quiz: Quiz,
    questionsSelectedAnswers: QuestionSelectedAnswers[]
  ): Promise<UserQuiz> {

    let totalCorrect = 0;
    const quizItemIdToQuizItemMap = new Map(quiz.quizItems.map(quizItem => [quizItem.id, quizItem]));

    /*
      Each QuestionSelectedAnswers is a junction between a questionId and a set of answerIds

      This loop look at each question (that has selected answers) --it checks the associated question's
      answers against the selected answers to ensure no selected answers were placed where isCorrect == false
     */
    for (const questionSelectedAnswers of questionsSelectedAnswers) {

      const quizItem =  quizItemIdToQuizItemMap.get(questionSelectedAnswers.questionId);

      if (!quizItem) {
          continue;
          /*
           TODO: catch and return error object with stack trace instead of forcing or simply not
            continuing (this is so the developers and user can be notified that
            this part of the code is failing. Add a global log handler.the
            endpoint will return a error json instead of data
           */
      }

      const selectedAnswerIdsSet = new Set(questionSelectedAnswers.selectedAnswerIds);

      let noWrongAnswers = true;

      /*
        We must check all answers of a question for isCorrect instead of just selectedAnswers
        because the selected answers junction is just the answer id not the object
        no direct look up of answer object for given answerId
       */
      for (const answer of quizItem.answers) {
          if (
              (selectedAnswerIdsSet.has(answer.id) && !answer.isCorrect)
              || (answer.isCorrect && !selectedAnswerIdsSet.has(answer.id))
          ) {
              noWrongAnswers = false;
              break;
          }
      }

      if (noWrongAnswers) {
          totalCorrect++;
      }
    }

    // Create UserQuiz document
    const userQuiz = await UserQuizModel.create({
      email,
      quiz,
      questionsSelectedAnswers,
      totalCorrect
    });

    return userQuiz.toObject() as UserQuiz;
  }
}

export { GradeQuizService };
