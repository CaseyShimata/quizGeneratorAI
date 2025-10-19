import { Body, Controller, Post } from '@nestjs/common';
import { ConversationalRouterService } from '../services/ConversationalRouterService.js';
import { z } from 'zod';
import { ApiBody, ApiOperation } from "@nestjs/swagger";

/**
 * Intelligent Query Controller
 * Handles conversational natural language queries with multi-turn support
 * Uses email for conversation tracking with automatic history truncation
 */

const ConversationalQueryInputZ = z.object({
  email: z.string().email('Valid email required'),
  message: z.string().min(1, 'Message cannot be empty')
});

@Controller('api')
export class IntelligentQueryController {
  constructor(
    private readonly conversationalRouterService: ConversationalRouterService
  ) {}

  /**
   * Process a conversational query
   * Supports multi-turn conversations with parameter collection
   * Conversation history is tracked per email address
   * 
   * Examples:
   * - "What can I do?" → Lists available endpoints
   * - "Generate a quiz" → Asks for topic
   * - "JavaScript" → Creates quiz with topic "JavaScript"
   */
  @Post('intelligent-query')
  @ApiOperation({
    summary: 'Conversational AI query interface',
    description: `Chat with the API using natural language. The AI will:
    - Help you discover what endpoints are available
    - Guide you through providing required parameters
    - Execute API calls when it has all needed information
    - Remember context per email address (auto-truncates after 20 messages)`
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'message'],
      properties: {
        email: { 
          type: 'string', 
          format: 'email',
          example: 'user@example.com',
          description: 'Your email address (used to track conversation)'
        },
        message: { 
          type: 'string', 
          example: 'What can I do?',
          description: 'Your natural language message or question'
        }
      }
    }
  })
  async processConversationalQuery(@Body() body: any) {
    const { email, message } = ConversationalQueryInputZ.parse(body);
    
    const result = await this.conversationalRouterService.processConversationalQuery(
      email,
      message
    );
    
    return result;
  }
}
