import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Quiz } from '../entities/index';
import { OpenAIQuizGenerationSchema } from '../schemas/OpenAIQuizGenerationSchema';
import { OpenAIService } from '../../openai/services/OpenAIService';
import { PromptBuilder } from '../../openai/utils/promptBuilder';

/**
 * Generate Quiz Service
 * Handles quiz generation using shared OpenAI service
 */
@Injectable()
class GenerateQuizService {
  private readonly generationSchema: any;

  constructor(private readonly openAIService: OpenAIService) {
    this.generationSchema = OpenAIQuizGenerationSchema;
  }

  async execute(
    email: string,
    topic: string,
  ): Promise<{ email: string; quiz: Quiz }> {
    const systemPrompt = PromptBuilder.buildSystemPrompt(
      'You are a quiz generation assistant. Create educational quizzes based on user-provided topics',
      this.generationSchema,
    );

    const userPrompt = `Create a quiz about "${topic}" with 5 questions, 4 answers each, exactly one correct answer per question, with brief explanations for each answer.`;

    const messages = PromptBuilder.buildMessages(systemPrompt, userPrompt);

    try {
      const parsed = await this.openAIService.createStructuredCompletion<any>(
        messages,
        this.generationSchema,
        { temperature: 0.2 },
      );

      return {
        email,
        quiz: {
          topic: parsed.topic,
          quizItems: parsed.quizItems,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate quiz', error);
    }
  }
}

export { GenerateQuizService };
