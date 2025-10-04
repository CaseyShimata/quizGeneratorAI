import { Injectable } from '@nestjs/common';
import { UserQuizModel, UserQuiz } from '../entities/index.js';

/**
 * List Quizzes Service
 * Retrieves all quiz attempts for a specific user.
 */
@Injectable()
class ListQuizzesService {
  async execute(email: string): Promise<UserQuiz[]> {
    const docs = await UserQuizModel
      .find({ email })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return docs as UserQuiz[];
  }
}

export { ListQuizzesService };
