import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { GenerateQuizService } from '../services/GenerateQuizService';
import { z } from 'zod';

/**
 * Generate Quiz Controller
 * Handles POST /quiz/generate endpoint.
 */

const GenerateInputZ = z.object({
  email: z.string().email(),
  topic: z.string().min(1),
});

@Controller('api/quiz')
class GenerateQuizController {
  constructor(private readonly service: GenerateQuizService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a new quiz',
    description:
      'Generate a new quiz on a specific topic using AI. The quiz will contain 5 questions with 4 answer choices each.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'topic'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        topic: { type: 'string', example: 'JavaScript Promises' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Quiz generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async generate(@Body() body: any) {
    const { email, topic } = GenerateInputZ.parse(body);
    return this.service.execute(email, topic);
  }
}

export { GenerateQuizController };
