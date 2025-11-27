import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Quiz,
  UserQuiz,
  UserQuizDocument,
  QuestionSelectedAnswers,
} from '../entities/index';

/**
 * Grade Quiz Service
 * Handles quiz grading logic and saving user quiz attempts.
 */
@Injectable()
class GradeQuizService {
  private readonly logger = new Logger(GradeQuizService.name);

  constructor(
    @InjectModel(UserQuiz.name)
    private readonly userQuizModel: Model<UserQuizDocument>,
  ) {}

  async execute(
    email: string,
    quiz: Quiz,
    questionsSelectedAnswers: QuestionSelectedAnswers[],
  ): Promise<UserQuiz> {
    let totalCorrect = 0;
    const quizItemIdToQuizItemMap = new Map(
      quiz.quizItems.map((quizItem) => [quizItem.id, quizItem]),
    );

    /*
      Each QuestionSelectedAnswers is a junction between a questionId and a set of answerIds

      This loop look at each question (that has selected answers) --it checks the associated question's
      answers against the selected answers to ensure no selected answers were placed where isCorrect == false
     */
    for (const questionSelectedAnswers of questionsSelectedAnswers) {
      const quizItem = quizItemIdToQuizItemMap.get(
        questionSelectedAnswers.questionId,
      );

      if (!quizItem) {
        const errorMessage = `Quiz item not found for questionId: ${questionSelectedAnswers.questionId}`;
        this.logger.error(errorMessage, {
          email,
          questionId: questionSelectedAnswers.questionId,
          stackTrace: new Error().stack,
        });
        throw new NotFoundException(errorMessage);
      }

      const selectedAnswerIdsSet = new Set(
        questionSelectedAnswers.selectedAnswerIds,
      );

      let noWrongAnswers = true;

      /*
        We must check all answers of a question for isCorrect instead of just selectedAnswers
        because the selected answers junction is just the answer id not the object
        no direct look up of answer object for given answerId
       */
      for (const answer of quizItem.answers) {
        if (
          (selectedAnswerIdsSet.has(answer.id) && !answer.isCorrect) ||
          (answer.isCorrect && !selectedAnswerIdsSet.has(answer.id))
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
    const userQuiz = await this.userQuizModel.create({
      email,
      quiz,
      questionsSelectedAnswers,
      totalCorrect,
    });

    return userQuiz.toObject() as UserQuiz;
  }
}

export { GradeQuizService };
