import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { GradeQuizService } from '../services/GradeQuizService';
import { z } from 'zod';

/**
 * Grade Quiz Controller
 * Handles POST /quiz/grade endpoint for quiz grading and submission.
 */

const GradeInputZ = z.object({
  email: z.string().email(),
  quiz: z.object({
    topic: z.string().min(1),
    quizItems: z.array(z.any()),
  }),
  questionsSelectedAnswers: z.array(
    z.object({
      questionId: z.string(),
      selectedAnswerIds: z.array(z.string()).min(1),
    }),
  ),
});

@Controller('api/quiz')
class GradeQuizController {
  constructor(private readonly service: GradeQuizService) {}

  @Post('grade')
  @ApiOperation({
    summary: 'Grade a completed quiz',
    description:
      'Submit a completed quiz for grading. Returns the score and stores the quiz attempt in the database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'quiz', 'questionsSelectedAnswers'],
      properties: {
        email: { type: 'string', format: 'email' },
        quiz: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            quizItems: { type: 'array', items: { type: 'object' } },
          },
        },
        questionsSelectedAnswers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'string' },
              selectedAnswerIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Quiz graded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async grade(@Body() body: any) {
    const { email, quiz, questionsSelectedAnswers } = GradeInputZ.parse(body);
    return this.service.execute(email, quiz, questionsSelectedAnswers);
  }
}

export { GradeQuizController };
