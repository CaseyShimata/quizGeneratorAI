import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QuizService } from './QuizService';
import { z } from 'zod';

const GenerateInputZ = z.object({ 
  email: z.string().email(), 
  topic: z.string().min(1) 
});

const GradeInputZ = z.object({
  email: z.string().email(),
  topic: z.string().min(1),
  quizItems: z.array(z.any()),
  answers: z.array(z.object({ 
    id: z.string(), 
    selectedAnswerId: z.string() 
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
    const { email, topic, quizItems, answers } = GradeInputZ.parse(body);
    return this.service.gradeQuiz(email, topic, quizItems, answers);
  }

  @Get('list')
  async list(@Query('email') email: string) {
    return this.service.getQuizzesByEmail(email);
  }
}

export { QuizController };
