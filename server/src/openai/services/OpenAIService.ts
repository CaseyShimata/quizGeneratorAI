import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { 
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming 
} from 'openai/resources/chat/completions';

/**
 * Shared OpenAI Service
 * Provides reusable OpenAI client and common operations across modules
 */
@Injectable()
export class OpenAIService {
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({ 
      apiKey: this.configService.get<string>('OPENAI_API_KEY') 
    });
    this.defaultModel = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
  }

  /**
   * Get the OpenAI client instance
   */
  getClient(): OpenAI {
    return this.client;
  }

  /**
   * Get the default model name
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Create a chat completion with structured output
   */
  async createStructuredCompletion<T>(
    messages: ChatCompletionMessageParam[],
    schema: any,
    options?: Partial<ChatCompletionCreateParamsNonStreaming>
  ): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      response_format: { 
        type: 'json_schema', 
        json_schema: schema 
      },
      ...options
    });

    const message = completion.choices[0].message;
    const parsed = (message as any).parsed || JSON.parse(message.content || '{}');
    
    if (!parsed) {
      throw new Error('AI returned no data');
    }

    return parsed as T;
  }

  /**
   * Create a standard chat completion
   */
  async createCompletion(
    messages: ChatCompletionMessageParam[],
    options?: Partial<ChatCompletionCreateParamsNonStreaming>
  ): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      ...options
    });

    return completion.choices[0].message.content || '';
  }

  /**
   * Create a function calling completion
   */
  async createFunctionCallingCompletion(
    messages: ChatCompletionMessageParam[],
    tools: any[],
    options?: Partial<ChatCompletionCreateParamsNonStreaming>
  ) {
    const completion = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: options?.temperature ?? 0.7,
      ...options
    });

    return completion.choices[0].message;
  }
}
