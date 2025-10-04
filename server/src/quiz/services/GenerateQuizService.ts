import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Quiz } from '../entities/index.js';
import { OpenAIQuizGenerationSchema } from '../schemas/OpenAIQuizGenerationSchema.js';

/**
 * Generate Quiz Service
 * Handles quiz generation using OpenAI's structured output API.
 */
@Injectable()
class GenerateQuizService {
  private client: OpenAI;
  private model: string;
  private generationSchema: any;

  constructor(configService: ConfigService) {
    this.client = new OpenAI({ apiKey: configService.get<string>('OPENAI_API_KEY') });
    this.model = configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    this.generationSchema = OpenAIQuizGenerationSchema;
  }

  async execute(email: string, topic: string): Promise<{ email: string; quiz: Quiz }> {
    const messages: ChatCompletionMessageParam[] = [
      { 
        role: 'system', 
        content: 'Generate a quiz matching the schema. Return only valid JSON.' 
      },
      { 
        role: 'user', 
        content: `Generate a quiz about "${topic}" with 5 questions, 4 answers each, one correct answer per question, with brief explanations.` 
      }
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      response_format: { type: 'json_schema', json_schema: this.generationSchema }
    });

    const message = completion.choices[0].message;
    const parsed = (message as any).parsed || JSON.parse(message.content || '{}');
    if (!parsed) throw new InternalServerErrorException('AI returned no data');

    return {
      email,
      quiz: {
        topic: parsed.topic,
        quizItems: parsed.quizItems
      }
    };
  }
}

export { GenerateQuizService };
