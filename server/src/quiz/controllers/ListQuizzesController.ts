import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
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
    description: 'Retrieve all quizzes for a user. Supports both exact email matching and partial pattern matching via regex. Example: "user@example.com" or "shimatacb" to find all emails containing that pattern. Use limit parameter to restrict number of results.'
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
    description: 'Maximum number of quizzes to return. Use 1 for "first quiz", etc.',
    example: 10,
    required: false
  })
  @ApiResponse({ status: 200, description: 'List of quizzes returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async list(
    @Query('email') email: string,
    @Query('limit') limit?: string
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.service.execute(email, limitNum);
  }
}

export { ListQuizzesController };
