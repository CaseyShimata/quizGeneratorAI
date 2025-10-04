import { Controller, Get, Query } from '@nestjs/common';
import { ListQuizzesService } from '../services/ListQuizzesService.js';

/**
 * List Quizzes Controller
 * Handles GET /quiz/list endpoint to retrieve user's quiz history.
 */

@Controller('api/quiz')
class ListQuizzesController {
  constructor(private readonly service: ListQuizzesService) {}

  @Get('list')
  async list(@Query('email') email: string) {
    return this.service.execute(email);
  }
}

export { ListQuizzesController };
