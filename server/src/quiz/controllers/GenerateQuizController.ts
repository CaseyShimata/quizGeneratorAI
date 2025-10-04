import { Body, Controller, Post } from '@nestjs/common';
import { GenerateQuizService } from '../services/GenerateQuizService.js';
import { z } from 'zod';

/**
 * Generate Quiz Controller
 * Handles POST /quiz/generate endpoint for quiz generation.
 */

const GenerateInputZ = z.object({ 
  email: z.string().email(), 
  topic: z.string().min(1) 
});

@Controller('api/quiz')
class GenerateQuizController {
  constructor(private readonly service: GenerateQuizService) {}

  @Post('generate')
  async generate(@Body() body: any) {
    const { email, topic } = GenerateInputZ.parse(body);
    return this.service.execute(email, topic);
  }
}

export { GenerateQuizController };
