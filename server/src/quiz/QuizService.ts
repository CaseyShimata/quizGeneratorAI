import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { GeneratedQuizContentZ, QuizFormZ } from './QuizSchema';
import { QuizModel } from './QuizModel';
import type { QuizForm, QuizItem, SubmittedAnswer } from './QuizSchema';

@Injectable()
class QuizService {
  private client: OpenAI;
  private model: string;
  private generationSchema: any;

  constructor(configService: ConfigService) {
    this.client = new OpenAI({ apiKey: configService.get<string>('OPENAI_API_KEY') });
    this.model = configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    
    // Hand-written schema that matches OpenAI's strict requirements
    // Structure mirrors QuizItemZ and AnswerZ from QuizSchema.ts
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

  async gradeQuiz(
    email: string, 
    topic: string, 
    quizItems: QuizItem[], 
    submittedAnswers: SubmittedAnswer[]
  ): Promise<QuizForm> {
    // Grade the quiz by comparing submitted answers with correct answers
    let totalCorrect = 0;
    
    for (const submitted of submittedAnswers) {
      const question = quizItems.find(q => q.id === submitted.questionId);
      if (!question) continue;

      // Get selected answers
      const selectedAnswers = question.answers.filter(a => 
        submitted.selectedAnswerIds.includes(a.id)
      );

      // Get correct answers
      const correctAnswers = question.answers.filter(a => a.isCorrect);
      
      // For single-select: Check if the one selected answer is correct
      // For multi-select: Check if ALL selected answers are correct AND ALL correct answers are selected
      const allSelectedAreCorrect = selectedAnswers.every(a => a.isCorrect);
      const allCorrectAreSelected = question.allowMultipleSelections
        ? correctAnswers.every(ca => submitted.selectedAnswerIds.includes(ca.id))
        : true;

      if (allSelectedAreCorrect && allCorrectAreSelected && selectedAnswers.length > 0) {
        totalCorrect++;
      }
    }

    // Create quiz form with graded results
    const doc = await QuizModel.create({
      email,
      topic,
      quizItems,
      submittedAnswers,
      totalCorrect
    });

    return this.docToQuizForm(doc);
  }

  async getQuizzesByEmail(email: string): Promise<QuizForm[]> {
    const docs = await QuizModel
      .find({ email })
      .sort({ createdAt: -1 })
      .exec();
    
    return docs.map(doc => this.docToQuizForm(doc));
  }

  private docToQuizForm(doc: any): QuizForm {
    return QuizFormZ.parse({
      _id: String(doc._id),
      email: doc.email,
      topic: doc.topic,
      quizItems: doc.quizItems,
      submittedAnswers: doc.submittedAnswers,
      totalCorrect: doc.totalCorrect ?? 0,
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString()
    });
  }
}

export { QuizService };
