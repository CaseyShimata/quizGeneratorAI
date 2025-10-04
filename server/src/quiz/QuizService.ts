import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { 
  UserQuizModel, 
  type Quiz, 
  type UserQuiz, 
  type QuizItem, 
  type QuestionSelectedAnswers,
  OpenAIQuizGenerationSchema 
} from './QuizEntities.js';

@Injectable()
class QuizService {
  private client: OpenAI;
  private model: string;
  private generationSchema: any;

  constructor(configService: ConfigService) {
    this.client = new OpenAI({ apiKey: configService.get<string>('OPENAI_API_KEY') });
    this.model = configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    
    // Use schema from QuizEntities.ts (co-located with entity definitions)
    // This eliminates duplication and keeps the schema near the entities it describes
    this.generationSchema = OpenAIQuizGenerationSchema;
  }

  async generateQuiz(email: string, topic: string): Promise<{ email: string; quiz: Quiz }> {
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

    // Return generated quiz without saving
    return {
      email,
      quiz: {
        topic: parsed.topic,
        quizItems: parsed.quizItems
      }
    };
  }

  async gradeQuiz(
    email: string, 
    quiz: Quiz,
    questionSelectedAnswers: QuestionSelectedAnswers[]
  ): Promise<UserQuiz> {
    // Grade the quiz
    let totalCorrect = 0;
    
    for (const selected of questionSelectedAnswers) {
      const question = quiz.quizItems.find(q => q.id === selected.questionId);
      if (!question) continue;

      const selectedAnswers = question.answers.filter(a => 
        selected.selectedAnswerIds.includes(a.id)
      );

      const correctAnswers = question.answers.filter(a => a.isCorrect);
      
      const allSelectedAreCorrect = selectedAnswers.every(a => a.isCorrect);
      const allCorrectAreSelected = question.allowMultipleSelections
        ? correctAnswers.every(ca => selected.selectedAnswerIds.includes(ca.id))
        : true;

      if (allSelectedAreCorrect && allCorrectAreSelected && selectedAnswers.length > 0) {
        totalCorrect++;
      }
    }

    // Create UserQuiz document
    const userQuiz = await UserQuizModel.create({
      email,
      quiz,
      questionSelectedAnswers,
      totalCorrect
    });

    return userQuiz.toObject() as UserQuiz;
  }

  async getQuizzesByEmail(email: string): Promise<UserQuiz[]> {
    const docs = await UserQuizModel
      .find({ email })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return docs as UserQuiz[];
  }
}

export { QuizService };
