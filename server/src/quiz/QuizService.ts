import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { QuizFormZ, GeneratedQuizContentZ } from './QuizSchema';
import { QuizModel } from './QuizModel';
import type { QuizForm } from './QuizSchema';

@Injectable()
class QuizService {
  private client: OpenAI;
  private model: string;
  private generationSchema: any;

  constructor(configService: ConfigService) {
    this.client = new OpenAI({ apiKey: configService.get<string>('OPENAI_API_KEY') });
    this.model = configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    
    // Hand-written schema that matches OpenAI's strict requirements
    this.generationSchema = {
      name: 'quiz_generation',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          quizItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                answers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      isCorrect: { type: 'boolean' },
                      explanation: { type: 'string' }
                    },
                    required: ['id', 'text', 'isCorrect', 'explanation'],
                    additionalProperties: false
                  }
                }
              },
              required: ['id', 'question', 'answers'],
              additionalProperties: false
            }
          }
        },
        required: ['topic', 'quizItems'],
        additionalProperties: false
      }
    };
  }

  async generateQuiz(email: string, topic: string) {
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

    const content = GeneratedQuizContentZ.parse(parsed);

    // Return the generated quiz without saving to DB
    return {
      email,
      topic: content.topic,
      quizItems: content.quizItems
    };
  }

  async gradeQuiz(email: string, topic: string, quizItems: any[], answers: { id: string; selectedAnswerId: string }[]): Promise<QuizForm> {
    let totalCorrect = 0;
    const gradedQuizItems = quizItems.map(item => {
      const submittedAnswer = answers.find(a => a.id === item.id);
      if (!submittedAnswer) return item;

      const selectedAnswer = item.answers.find((a: any) => a.id === submittedAnswer.selectedAnswerId);
      const isCorrect = selectedAnswer?.isCorrect === true;
      if (isCorrect) totalCorrect++;

      return {
        ...item,
        selectedAnswerId: submittedAnswer.selectedAnswerId,
        isCorrect
      };
    });

    // Save the graded quiz to database
    const doc = await QuizModel.create({
      email,
      topic,
      quizItems: gradedQuizItems,
      totalCorrect,
      aiMetadata: { source: 'openai', submittedAt: new Date().toISOString() }
    });

    return this.docToQuizForm(doc);
  }

  async getQuizzesByEmail(email: string): Promise<QuizForm[]> {
    const docs = await QuizModel.find({ email }).sort({ createdAt: -1 }).exec();
    return docs.map(doc => this.docToQuizForm(doc));
  }

  private docToQuizForm(doc: any): QuizForm {
    return QuizFormZ.parse({
      _id: String(doc._id),
      email: doc.email,
      topic: doc.topic,
      quizItems: doc.quizItems,
      totalCorrect: doc.totalCorrect ?? 0,
      aiMetadata: doc.aiMetadata,
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString()
    });
  }
}

export { QuizService };
