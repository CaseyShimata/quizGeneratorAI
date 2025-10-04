import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QuizService } from './QuizService.js';
import { z } from 'zod';

// Minimal Zod schemas for API input validation only
// Types come from Typegoose entities
const GenerateInputZ = z.object({ 
  email: z.string().email(), 
  topic: z.string().min(1) 
});

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

@Controller('quiz')
class QuizController {
  constructor(private readonly service: QuizService) {}

  @Post('generate')
  async generate(@Body() body: any) {
    const { email, topic } = GenerateInputZ.parse(body);
    return this.service.generateQuiz(email, topic);
  }

  @Post('grade')
  async grade(@Body() body: any) {
    const { email, quiz, questionSelectedAnswers } = GradeInputZ.parse(body);
    return this.service.gradeQuiz(email, quiz, questionSelectedAnswers);
  }

  @Get('list')
  async list(@Query('email') email: string) {
    return this.service.getQuizzesByEmail(email);
  }
}

export { QuizController };
