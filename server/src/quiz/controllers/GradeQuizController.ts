import { Body, Controller, Post } from '@nestjs/common';
import { GradeQuizService } from '../services/GradeQuizService.js';
import { z } from 'zod';

/**
 * Grade Quiz Controller
 * Handles POST /quiz/grade endpoint for quiz grading and submission.
 */

const GradeInputZ = z.object({ 
  email: z.string().email(),
  quiz: z.object({
    topic: z.string().min(1),
    quizItems: z.array(z.any()) // Accept any structure, validated by Typegoose
  }),
  questionSelectedAnswers: z.array(z.object({ 
    questionId: z.string(),
    selectedAnswerIds: z.array(z.string()).min(1)
  }))
});

@Controller('api/quiz')
class GradeQuizController {
  constructor(private readonly service: GradeQuizService) {}

  @Post('grade')
  async grade(@Body() body: any) {
    const { email, quiz, questionSelectedAnswers } = GradeInputZ.parse(body);
    return this.service.execute(email, quiz, questionSelectedAnswers);
  }
}

export { GradeQuizController };
