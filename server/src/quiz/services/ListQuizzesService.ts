import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserQuiz, UserQuizDocument } from '../entities/index';

/**
 * List Quizzes Service
 * Retrieves quiz attempts - works with both exact and partial email matches
 */
@Injectable()
class ListQuizzesService {
  constructor(
    @InjectModel(UserQuiz.name)
    private readonly userQuizModel: Model<UserQuizDocument>,
  ) {}

  /**
   * Execute query with regex support and common list options
   * Works for both exact emails and partial patterns
   * @param emailPattern - Email or pattern to search for
   * @param limit - Optional limit on number of results (deprecated; prefer options.limit)
   * @param options - Optional list options (offset, sortBy, sortDir, filters)
   */
  async execute(
    emailPattern: string,
    limit?: number,
    options?: {
      offset?: number;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      filters?: Record<string, any>;
      limit?: number; // allow specifying via options
    },
  ): Promise<UserQuiz[]> {
    // Build base filter with email regex, merge with provided filters (AND)
    const baseFilter: Record<string, any> = {
      email: { $regex: emailPattern, $options: 'i' },
    };

    const mergedFilter = {
      ...baseFilter,
      ...(options?.filters ?? {}),
    };

    let query = this.userQuizModel.find(mergedFilter).sort({
      [options?.sortBy || 'createdAt']:
        (options?.sortDir || 'desc') === 'asc' ? 1 : -1,
    });

    const finalLimit = options?.limit ?? limit;
    if (finalLimit && finalLimit > 0) {
      query = query.limit(finalLimit);
    }

    if (options?.offset && options.offset > 0) {
      query = query.skip(options.offset);
    }

    const docs = await query.lean().exec();

    return docs as UserQuiz[];
  }
}

export { ListQuizzesService };
