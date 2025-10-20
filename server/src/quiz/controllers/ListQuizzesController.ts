import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ListQuizzesService } from '../services/ListQuizzesService.js';

/**
 * List Quizzes Controller
 * Handles GET /quiz/list endpoint to retrieve user's quiz history.
 */

@Controller('api/quiz')
class ListQuizzesController {
  constructor(private readonly service: ListQuizzesService) {}

  @Get('list')
  @ApiOperation({ 
    summary: 'List quizzes for a user',
    description: `Retrieve quizzes for a user with flexible filtering, sorting, and pagination.
    - email: exact or partial (regex) match for email address
    - limit: limit the number of results
    - offset: skip a number of results (for pagination)
    - sortBy: field to sort by (default: createdAt)
    - sortDir: asc or desc (default: desc)
    - filters: JSON object of additional field filters to AND with email match

    Examples:
    - email=shimatacb&limit=3 (first 3 recent)
    - email=foo@bar.com&limit=3&sortDir=asc (first 3 oldest)
    - email=example&filters={"quiz.topic":"elephants"}&sortBy=updatedAt&sortDir=desc
    `
  })
  @ApiQuery({ 
    name: 'email', 
    type: 'string',
    description: 'Email address or pattern to search for. Supports regex patterns.',
    example: 'user@example.com',
    required: true
  })
  @ApiQuery({ 
    name: 'limit', 
    type: 'number',
    description: 'Maximum number of results to return.',
    example: 10,
    required: false
  })
  @ApiQuery({ 
    name: 'offset', 
    type: 'number',
    description: 'Number of results to skip (for pagination).',
    example: 0,
    required: false
  })
  @ApiQuery({ 
    name: 'sortBy', 
    type: 'string',
    description: 'Field name to sort by (default: createdAt). Supports dot-notation for nested fields, e.g., "quiz.topic". Alias: "topic" → "quiz.topic".',
    example: 'quiz.topic',
    required: false,
    enum: ['createdAt', 'updatedAt', 'email', 'quiz.topic']
  })
  @ApiQuery({ 
    name: 'sortDir', 
    type: 'string',
    description: 'Sort direction: asc or desc (default: desc).',
    example: 'desc',
    required: false,
  })
  @ApiQuery({ 
    name: 'filters', 
    type: 'string',
    description: 'JSON object of additional field filters to AND with email match.',
    example: '{"quiz.topic":"elephants"}',
    required: false
  })
  @ApiResponse({ status: 200, description: 'List of quizzes returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async list(
    @Query('email') email: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('filters') filters?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const offsetNum = offset ? parseInt(offset, 10) : undefined;
    let parsedFilters: Record<string, any> | undefined = undefined;
    if (filters) {
      try { parsedFilters = JSON.parse(filters); } catch { parsedFilters = undefined; }
    }

    // Normalize sortBy aliases and support nested fields
    let normalizedSortBy = sortBy || undefined;
    if (normalizedSortBy) {
      const sbLower = normalizedSortBy.toLowerCase();
      if (sbLower === 'topic') normalizedSortBy = 'quiz.topic';
    }

    return this.service.execute(email, limitNum, {
      offset: offsetNum,
      sortBy: normalizedSortBy,
      sortDir: (sortDir === 'asc' || sortDir === 'desc') ? (sortDir as 'asc' | 'desc') : undefined,
      filters: parsedFilters,
    });
  }
}

export { ListQuizzesController };
