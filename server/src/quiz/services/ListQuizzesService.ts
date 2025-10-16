import { Injectable } from '@nestjs/common';
import { UserQuizModel, UserQuiz } from '../entities/index.js';

/**
 * List Quizzes Service
 * Retrieves quiz attempts - works with both exact and partial email matches
 */
@Injectable()
class ListQuizzesService {
  /**
   * Execute query with regex support
   * Works for both exact emails and partial patterns
   * @param emailPattern - Email or pattern to search for
   * @param limit - Optional limit on number of results
   */
  async execute(emailPattern: string, limit?: number): Promise<UserQuiz[]> {
    let query = UserQuizModel
      .find({ 
        email: { $regex: emailPattern, $options: 'i' } 
      })
      .sort({ createdAt: -1 });
    
    if (limit && limit > 0) {
      query = query.limit(limit);
    }
    
    const docs = await query.lean().exec();
    
    return docs as UserQuiz[];
  }
}

export { ListQuizzesService };
